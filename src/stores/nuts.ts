/// this store query nostr for private messages containing nuts

import { derived, get } from 'svelte/store';
import * as nostrTools from 'nostr-tools';
import { nostrPrivKey, nostrPubKey, pool, profile } from './nostr';
import { db, invoices, pendingProofs, history, proofs, type Invoice, spentProofs } from './db';
import {
	CashuMint,
	CashuWallet,
	getDecodedToken,
	getEncodedToken,
	type Proof,
	type Token
} from '@cashu/cashu-ts';
import { getKeysForUnit, isValidToken } from 'src/comp/util/walletUtils';
import { HistoryItemType } from 'src/model/historyItem';
import { decode } from '@gandlaf21/bolt11-decode';
import { liveQuery } from 'dexie';
import { timestamp10 } from './time';
import { getDecryptedContent, sendMessage } from 'src/actions/chat';
import { browser } from '$app/environment';
import type { UnsignedEvent } from 'nostr-tools';
import { saveNuts } from 'src/actions/wallet';

if (browser) {
	derived([nostrPubKey, nostrPrivKey, db], async ([$pubkey, $privkey, $db]) => {
		// console.info('fetching messages');
		if (!$pubkey) return;
		const messages = pool.req([
			{ kinds: [nostrTools.kinds.EncryptedDirectMessage], limit: 100, '#p': [$pubkey] }, // incoming messages
			{ kinds: [nostrTools.kinds.EncryptedDirectMessage], limit: 100, authors: [$pubkey] } // outgoing messages and topups
		]);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] !== 'EVENT') continue;
			const event = message[2];
			const exist = await $db.messages.where('event.id').equals(event.id).count();
			if (exist > 0) continue;
			if (!nostrTools.validateEvent(event)) continue;
			// push the message to the db, will be listed in the chat
			await $db.messages.add({ event });

			const incoming = event.tags.find((t) => t[0] === 'p' && t[1] === $pubkey);
			if (incoming) {
				console.log(event.content);
				const decodedMessage = window.nostr
					? await window.nostr.nip04.decrypt(event.pubkey, event.content)
					: await nostrTools.nip04.decrypt($privkey, event.pubkey, event.content);

				let token;
				try {
					token = getDecodedToken(decodedMessage);
				} catch (e) {
					console.error(e, 'could not decode nip-04 message as token. Ignoring this message');
					continue;
				}

				if (!token?.token) {
					//if the event is not in a cashu token format, ignore it
					continue;
				}

				if (!isValidToken(token.token)) {
					// ignore messages that are not tokens
					continue;
				}
				// store the mint in the db
				await Promise.all(
					token.token.map(async (t) => {
						await Promise.all(
							t.proofs.map(async (p) => {
								await $db.keysets.put({ id: p.id, mint: t.mint });
							})
						);
					})
				);

				// get all the proofs in the token
				const proofs = token.token.reduce((acc, cur) => [...acc, ...cur.proofs], [] as Proof[]);
				console.log('incoming message');
				// if the nuts tag is present, do not add to history, it is a wallet save
				const isSave = event.tags.some((t) => t[0] === 'nuts');
				if (!isSave) {
					$db.history.add({
						date: event.created_at,
						type: event.pubkey == $pubkey ? HistoryItemType.MINT : HistoryItemType.RECEIVE_NOSTR,
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
				if (event.pubkey !== $pubkey) {
					// if the sender is not yourself, add to pendingProofs to be claimed later
					await $db.pendingProofs.bulkAdd(proofs);
				} else {
					console.log('hey');
					// just verify that the token is not spent yet
					await getNuts(token);
				}
			} else {
				console.log('outgoing message', event.tags);
				// outgoing messages
				$db.history.add({
					date: event.created_at,
					type: HistoryItemType.SEND,
					amount: !!event.tags.find((t) => t[0] === 'amount')?.[1]
						? -Number(
								await getDecryptedContent(
									event.pubkey,
									event.tags.find((t) => t[0] === 'amount')?.[1]
								)
							)
						: 0,
					// amount: 0,
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
	derived([nostrPubKey, nostrPrivKey, db, pendingProofs], async ([$pubkey, $privkey, $db, $pp]) => {
		console.info('claiming proofs', $pp);
		if (!$pp.length) return;
		// organize proofs by mint
		const proofsByKeySet = $pp.reduce(
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
			const res = await wallet.receiveTokenEntry(
				{ proofs: proofsByKeySet[key], mint: m.mint },
				{ privkey: $privkey }
			);

			// add the proofs to the db
			await $db.proofs.bulkAdd(res.proofs);
			// remove the proofs from the pendingProofs
			await $db.pendingProofs.bulkDelete(proofsByKeySet[key].map((p) => p.secret));

			await saveNuts(res.proofs, $pubkey);
		}
	}).subscribe((n) => n);

	// claim pending invoices
	let timestampIndex = 0;
	derived(
		[nostrPubKey, nostrPrivKey, db, invoices, timestamp10],
		async ([$pubkey, $privkey, $db, $invoices]) => {
			if (!$pubkey) return;

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
						await sendMessage($pubkey, encodedToken);
					});
				};
				if (Date.now() / 1000 - invoice.date < 60 * 5) {
					await minting(invoice);
				} else if (timestampIndex % 30 === i) {
					await minting(invoice);
				}
			});
		}
	).subscribe((n) => n);
}

// try to get the cashu tokens saved in the user private chat
export async function getNuts(cashu: Token) {
	console.log('getNuts', cashu);
	const validProofs: Proof[] = [];
	await Promise.all(
		cashu.token.map(async (t) => {
			// verify the token
			const cashuMint = new CashuMint(t.mint);
			const keys = await cashuMint.getKeys();
			const wallet = new CashuWallet(cashuMint, keys.keysets[0]);
			// check if the proofs are already spent in the db
			const unspend = t.proofs.filter((p) => !get(spentProofs).some((sp) => sp.secret == p.secret));
			if (unspend.length) {
				const spents = await wallet.checkProofsSpent(unspend);
				console.log('spents', spents);
				await get(db).spentProofs.bulkPut(spents);
				validProofs.push(...t.proofs.filter((p) => !spents.some((s) => s.secret == p.secret)));
			}
			// await Promise.all(
			// 	t.proofs.map(async (p) => {
			// 		await get(db).keysets.put({ id: p.id, mint: t.mint });
			// 	})
			// );
		})
	);
	if (validProofs.length) {
		await get(db).proofs.bulkPut(validProofs);
	}
}
