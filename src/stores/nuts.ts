/// this store query nostr for private messages containing nuts

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

import {
	db,
	invoices,
	pendingProofs,
	proofs,
	type Invoice,
	key,
	Status,
	proofsCache,
	mintsCache,
	keysetsCache,
	historyCache,
	dmCache
} from './db';
import { timestamp1, timestamp10 } from './time';
import { pool } from './relays';
import { signer } from './signer';
import _ from 'lodash';
import { browser } from '$app/environment';
import { ADDRESS_ZERO } from './constants';
import type { NSecSigner } from '@nostrify/nostrify';

// export const eventMap: { [key: string]: boolean } = {};
//
let abortController = new AbortController();

export const nostrEventSub = derived(
	[key, pool, signer, db],
	async ([$key, $pool, $signer, $db]) => {
		abortController.abort();
		if (!browser) return;
		if (!$key?.pub) return;
		if (!$pool) return;
		if (!$signer) return;
		console.log('nostrEventSub', $key.pub);
		const lastEvent = await $db.dms.orderBy('created_at').last();
		// end the previous ws connection if any

		abortController = new AbortController();
		console.log('new ws connection');
		const messages = $pool.req(
			[
				{
					kinds: [nostrTools.kinds.EncryptedDirectMessage],
					'#p': [$key.pub],
					since: lastEvent?.created_at
				}, // incoming messages
				{
					kinds: [nostrTools.kinds.EncryptedDirectMessage],
					authors: [$key.pub],
					since: lastEvent?.created_at
				} // outgoing messages and topups
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] !== 'EVENT') continue;
			const event = message[2];
			// console.log('new note');
			// push the message to the db, it will be listed in the chat
			dmCache.add(event);

			// if the event content is in the map, it has been processed already

			if (!nostrTools.validateEvent(event)) continue;

			const incoming = event.tags.some((t) => t[0] === 'p' && t[1] === $key.pub);
			const token = await decodeEventContent(event, incoming, $signer);
			if (!token) continue;

			// store the mint in the db
			token.token.map((t) => {
				t.proofs.map((p) => {
					mintsCache.add({ url: t.mint });
				});
			});

			// get all the proofs in the token
			const proofs = token.token.reduce((acc, cur) => [...acc, ...cur.proofs], [] as Proof[]);
			if (incoming) {
				// if the nuts tag is present, do not add to history, it is a wallet save
				const isSave = event.tags.some((t) => t[0] === 'nuts');
				if (!isSave) {
					historyCache.add({
						date: event.created_at,
						type:
							event.pubkey == $key.pub
								? event.tags.some((t) => t[0] === 'change')
									? HistoryItemType.CHANGE
									: HistoryItemType.MINT
								: HistoryItemType.RECEIVE_NOSTR,
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
					// console.log('--------incoming message', into++);
					// if the sender is not yourself, add to pendingProofs to be claimed later
					proofs.map((p) => proofsCache.add(p));
				} else {
					// get the saved nuts and put the status as confirmed
					// $db.proofs.bulkPut(proofs.map((p) => ({ ...p, status: Status.Confirmed })));
					proofsCache.bulkPut(proofs.map((p) => ({ ...p, status: Status.Confirmed })));
				}
			} else {
				// console.log('-----------outgoing message', out++);
				const proofs = token.token.flatMap((t) => t.proofs);
				// add them to the spentProofs table
				proofsCache.bulkPut(proofs.map((p) => ({ ...p, status: Status.Spent })));
				const to = event.tags.find((t) => t[0] === 'p')?.[1] ?? '';
				// outgoing messages
				historyCache.add({
					date: event.created_at,
					type: to == ADDRESS_ZERO ? HistoryItemType.MELT : HistoryItemType.SEND,
					amount: -proofs.reduce((acc, cur) => (acc += cur.amount), 0),
					data: {
						mint: '',
						keyset: ['0'], // @todo
						to
					}
				});
			}
		}
	}
);

// when new pendingProofs are added, try to claim them
export const claimPendingSub = derived([signer, timestamp1], async ([$signer, $time]) => {
	const pp = get(pendingProofs);
	if (!pp.length) return;

	// organize proofs by mint
	const proofsByKeySet = pp.reduce(
		(acc, cur) => {
			if (!acc[cur.id]) acc[cur.id] = [];
			acc[cur.id].push(cur);
			return acc;
		},
		{} as Record<string, Proof[]>
	);
	for (const keysetId in proofsByKeySet) {
		const m = get(keysetsCache).get(keysetId);
		if (!m) {
			console.error('could not find mint for keyset', keysetId);
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
			console.log('claiming', proofsByKeySet[keysetId], get(key)?.priv, get(key)?.pub);
			const res = await wallet.receiveTokenEntry({
				proofs: proofsByKeySet[keysetId],
				mint: m.mint
			});
			console.log('res', res);
			proofsCache.bulkPut([
				...res.proofs.map((p) => ({ ...p, status: Status.Confirmed })),
				...proofsByKeySet[keysetId].map((p) => ({ ...p, status: Status.Spent }))
			]);
			if (res.proofs.length) {
				// add the proofs to the nostr
				console.info('saving nuts');
				await sendMessage(
					$signer,
					get(key)?.pub,
					getEncodedToken({ token: [{ mint: m.mint, proofs: res.proofs }] }),
					[['nuts']]
				);
				// await saveNuts(res.proofs, get(key)?.pub);
			}
		} catch (e) {
			console.error(e);
			// proofsCache.bulkPut(proofsByKeySet[key].map((p) => ({ ...p, status: Status.Spent })));
		}
	}
});

export const claimInvoicesSub = () => {
	// claim pending invoices
	let timestampIndex = 0;
	return derived(
		[key, db, invoices, signer, timestamp10],
		async ([$key, $db, $invoices, $signer]) => {
			if (!browser) return;
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
						res.proofs.forEach((p) => proofsCache.add(p));
						// await $db.proofs.bulkAdd(res.proofs);
						await sendMessage($signer, $key.pub, encodedToken);

						$db.invoices.delete(invoice.quote);

						// checkProofsSpent();
						// send the token to the profile public address
					});
				};
				if (Date.now() / 1000 - invoice.date < 60 * 5) {
					await minting(invoice);
				} else if (timestampIndex % 30 === i) {
					await minting(invoice);
				}
			});
		}
	);
};

export const proofSpentSub = () => {
	let lastCheck = '';
	// // every 10 seconds, check if the proofs are spent
	return derived([timestamp1], async ([$time]) => {
		if (lastCheck == JSON.stringify(get(proofs))) return;
		const errors = await checkProofsSpent(get(proofs));
		if (!errors.length) {
			lastCheck = JSON.stringify(get(proofs));
		}
	});
};

export async function decodeEventContent(
	event: NostrEvent,
	incoming: boolean,
	signer?: NSecSigner
): Promise<Token | undefined> {
	let decodedMessage: string | undefined;
	const pubkey = incoming ? event.pubkey : event.tags.find((t) => t[0] == 'p')?.[1];
	if (!signer) return;
	if (!pubkey) return;
	try {
		decodedMessage = await signer.nip04.decrypt(pubkey, event.content);
	} catch (e) {
		// console.error(e, 'could not decrypt nip-04 message. Ignoring this message');
		// continue;
		return;
	}

	if (!decodedMessage) return;

	let token;
	try {
		token = getDecodedToken(decodedMessage);
	} catch (e) {
		// console.error(e, 'could not decode nip-04 message as token. Ignoring this message');
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
