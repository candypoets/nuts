/// this store query nostr for private messages containing nuts

import { browser } from '$app/environment';
import {
	CashuMint,
	CashuWallet,
	getDecodedToken,
	getEncodedToken,
	type Proof,
	type Token
} from '@cashu/cashu-ts';
import { decode } from '@gandlaf21/bolt11-decode';
import type { NostrEvent } from 'nostr-tools';
import * as nostrTools from 'nostr-tools';
import { sendMessage } from 'src/actions/chat';
import { checkProofsSpent, saveNuts } from 'src/actions/wallet';
import { getKeysForUnit, isValidToken } from 'src/actions/wallet';
import { HistoryItemType } from 'src/model/historyItem';
import { derived, get } from 'svelte/store';

import { db, invoices, pendingProofs, proofs, type Invoice, key, spentProofs, Status } from './db';
import { timestamp10 } from './time';
import { pool } from './relays';
import { signer } from './signer';
import _ from 'lodash';

// export const eventMap: { [key: string]: boolean } = {};
if (browser) {
	let into = 0;
	let out = 0;
	let totalMessage = 0;
	let topups = 0;
	derived([key, pool, db], async ([$key, $pool, $db]) => {
		// console.info('fetching messages');
		if (!$key?.pub) return;
		if (!$pool) return;
		// if (!get(mints).length) return;
		const messages = get(pool).req([
			{
				kinds: [nostrTools.kinds.EncryptedDirectMessage],
				'#p': [$key.pub]
				// since: Math.round(Date.now() / 1000)
			}, // incoming messages
			{
				kinds: [nostrTools.kinds.EncryptedDirectMessage],
				authors: [$key.pub]
				// since: Math.round(Date.now() / 1000)
			} // outgoing messages and topups
		]);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] !== 'EVENT') continue;
			// console.log('message', totalMessage++);
			const event = message[2];
			const exist = await $db.messages.where('event.id').equals(event.id).count();
			if (exist > 0) continue;
			// push the message to the db, it will be listed in the chat
			$db.messages.add({ event });

			// if the event content is in the map, it has been processed already

			if (!nostrTools.validateEvent(event)) continue;

			const incoming = event.tags.some((t) => t[0] === 'p' && t[1] === $key.pub);
			const token = await decodeEventContent(event, incoming);
			if (!token) continue;

			// store the mint in the db
			token.token.map((t) => {
				t.proofs.map((p) => {
					$db.mints.add({ url: t.mint });
				});
			});

			// get all the proofs in the token
			const proofs = token.token.reduce((acc, cur) => [...acc, ...cur.proofs], [] as Proof[]);
			if (incoming) {
				// if the nuts tag is present, do not add to history, it is a wallet save
				const isSave = event.tags.some((t) => t[0] === 'nuts');
				if (!isSave) {
					$db.history.add({
						date: event.created_at,
						type: event.pubkey == $key.pub ? HistoryItemType.MINT : HistoryItemType.RECEIVE_NOSTR,
						amount: proofs.reduce((acc, cur) => (acc += cur.amount), 0),
						data: {
							mint: token.token[0].mint,
							keyset: ['0'], // @todo,
							from: event.pubkey
						}
					});
				}
				// incoming messages
				// add an history entry in the db
				if (event.pubkey !== $key.pub) {
					console.log('--------incoming message', into++);
					// if the sender is not yourself, add to pendingProofs to be claimed later
					proofs.map((p) => $db.proofs.add(p));
				} else {
					// get the saved nuts and put the status as confirmed
					// $db.proofs.bulkPut(proofs.map((p) => ({ ...p, status: Status.Confirmed })));
					$db.proofs.bulkPut(proofs.map((p) => ({ ...p, status: Status.Confirmed })));
				}
			} else {
				console.log('-----------outgoing message', out++);
				const proofs = token.token.flatMap((t) => t.proofs);
				// add them to the spentProofs table
				$db.proofs.bulkPut(proofs.map((p) => ({ ...p, status: Status.Spent })));
				// outgoing messages
				$db.history.add({
					date: event.created_at,
					type: HistoryItemType.SEND,
					amount: -proofs.reduce((acc, cur) => (acc += cur.amount), 0),
					data: {
						mint: '',
						keyset: ['0'], // @todo
						to: event.tags.find((t) => t[0] === 'p')?.[1] ?? ''
					}
				});
			}
		}
	}).subscribe((n) => n);

	// when new pendingProofs are added, try to claim them
	derived([key, db, timestamp10], async ([$key, $db, $time]) => {
		const pp = get(pendingProofs);
		if (!pp.length) return;
		console.info('claiming pending proofs', pp);
		// organize proofs by mint
		const proofsByKeySet = pp.reduce(
			(acc, cur) => {
				if (!acc[cur.id]) acc[cur.id] = [];
				acc[cur.id].push(cur);
				return acc;
			},
			{} as Record<string, Proof[]>
		);
		for (const key in proofsByKeySet) {
			const m = await $db.keysets.get({ id: key });
			if (!m) {
				console.error('could not find mint for keyset', key);
				continue;
			}
			const cashuMint = new CashuMint(m.mint);

			const cashukeys = await cashuMint.getKeys();
			// const keysets = await cashu.getKeySets();
			const keys = getKeysForUnit(cashukeys.keysets);
			const wallet: CashuWallet = new CashuWallet(cashuMint, keys);
			// if (!validateMintKeys(keys)) {
			// 	return;
			// }
			try {
				const res = await wallet.receiveTokenEntry(
					{ proofs: proofsByKeySet[key], mint: m.mint },
					{ privkey: $key?.priv }
				);

				// // add the proofs to the db
				$db.proofs.bulkPut(res.proofs.map((p) => ({ ...p, status: Status.Confirmed })));

				if (res.proofs.length) {
					await saveNuts(res.proofs, $key?.pub);
				}
			} catch (e) {
				console.error(e);
			}
		}
	}).subscribe((n) => n);

	// claim pending invoices
	let timestampIndex = 0;
	derived([key, db, invoices, timestamp10], async ([$key, $db, $invoices]) => {
		if (!$key?.pub) return;

		timestampIndex++;
		// for fresh invoices, try to claim them on every timestamp
		$invoices.forEach(async (invoice, i) => {
			i = i % 30;
			const minting = async (invoice: Invoice) => {
				const cashuMint = new CashuMint(invoice.mint);
				const keys = await cashuMint.getKeys();
				const wallet = new CashuWallet(cashuMint, keys.keysets[0]);
				const amount = decode(invoice.request).sections[2].value / 1000;
				wallet.mintTokens(amount, invoice.quote).then(async (res) => {
					const encodedToken = getEncodedToken({
						token: [{ proofs: res.proofs, mint: invoice.mint }],
						memo: 'invoice'
					});
					// will be claimed twice probably
					// adding anyway in case the message is not sent
					await $db.proofs.bulkAdd(res.proofs);

					await $db.invoices.delete(invoice.quote);
					// send the token to the profile public address
					await sendMessage($key.pub, encodedToken);
				});
			};
			if (Date.now() / 1000 - invoice.date < 60 * 5) {
				await minting(invoice);
			} else if (timestampIndex % 30 === i) {
				await minting(invoice);
			}
		});
	}).subscribe((n) => n);

	let lastCheck = '';
	// every 10 seconds, check if the proofs are spent
	derived([timestamp10], async ([$time]) => {
		if (lastCheck == JSON.stringify(get(proofs))) return;
		await checkProofsSpent(get(proofs));
		lastCheck = JSON.stringify(get(proofs));
	}).subscribe((n) => n);
}

export async function decodeEventContent(
	event: NostrEvent,
	incoming: boolean
): Promise<Token | undefined> {
	let decodedMessage: string | undefined;
	const pubkey = incoming ? event.pubkey : event.tags.find((t) => t[0] == 'p')?.[1];
	console.log('pubkey', pubkey);
	if (!pubkey) return;
	try {
		decodedMessage = await get(signer)?.nip04.decrypt(pubkey, event.content);
	} catch (e) {
		console.error(e, 'could not decrypt nip-04 message. Ignoring this message');
		// continue;
		return;
	}

	if (!decodedMessage) return;

	let token;
	try {
		token = getDecodedToken(decodedMessage);
	} catch (e) {
		console.error(e, 'could not decode nip-04 message as token. Ignoring this message');
		return;
	}

	if (!token?.token) {
		//if the event is not in a cashu token format, ignore it
		return;
	}

	if (!isValidToken(token.token)) {
		// ignore messages that are not tokens
		return;
	}
	return token;
}
