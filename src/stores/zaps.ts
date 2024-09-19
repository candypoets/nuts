import { derived, get } from 'svelte/store';
import { Status, db, historyCache, key, proofsCache } from './db';
import { pool } from './relays';
import { signer } from './signer';
import { browser } from '$app/environment';
import { nutKinds } from 'src/lib';
import { CashuMint, CashuWallet, getEncodedToken, type Proof } from '@cashu/cashu-ts';
import { HistoryItemType } from 'src/model/historyItem';
import { getKeysForUnit } from 'src/actions/wallet';
import { sendMessage } from 'src/actions/chat';
import type { UnsignedEvent } from 'nostr-tools';

let zapController = new AbortController();

export const nutzapSub = derived([key, pool, signer, db], async ([$key, $pool, $signer, $db]) => {
	zapController.abort();

	if (!browser) return;
	if (!$key?.pub) return;
	if (!$pool) return;
	if (!$signer) return;

	const lastEvent = await $db.history.orderBy('date').last();

	zapController = new AbortController();

	const messages = $pool.req(
		[
			{
				kinds: [nutKinds.Nutzap],
				'#p': [$key.pub],
				since: lastEvent?.date
			},
			{
				kinds: [nutKinds.Nutzap],
				authors: [$key.pub],
				since: lastEvent?.date
			}
		],
		{ signal: zapController.signal }
	);

	for await (const message of messages) {
		if (message[0] === 'CLOSED') break;
		if (message[0] !== 'EVENT') continue;
		const event = message[2];
		console.log('nutzap event', event);
		const incoming = event.tags.some((t) => t[0] === 'p' && t[1] === $key.pub);

		// get all the proofs from the message
		let proofs: Proof[] = event.tags.filter((t) => t[0] === 'proof').map((t) => JSON.parse(t[1]));

		const mintUrl = event.tags.find((t) => t[0] === 'u')?.[1];
		// if mintUrl is not present, ignore the message
		if (!mintUrl) continue;

		if (incoming) {
			console.log('incoming nutzap event');

			try {
				proofs = await Promise.all(
					proofs.map(async (p) => {
						return { ...p, C: await $signer.nip04.decrypt(event.pubkey, p.C) };
					})
				);
			} catch (e) {
				console.info('invalid zap proofs incoming');
				continue;
			}
			// add an event in the history db
			historyCache.add({
				date: event.created_at,
				type: HistoryItemType.RECEIVE_NUTZAP,
				amount: proofs.reduce((acc, p) => acc + p.amount, 0),
				data: {
					mint: mintUrl,
					from: event.pubkey,
					keyset: proofs.map((p) => p.id)
				}
			});
			// put the proofs in the db in pending state (to be claimed)
			// proofs.map((p) => proofsCache.put(p));
			const cashuMint = new CashuMint(mintUrl);

			const cashukeys = await cashuMint.getKeys();
			// const keysets = await cashu.getKeySets();
			const keys = getKeysForUnit(cashukeys.keysets);
			const wallet: CashuWallet = new CashuWallet(cashuMint, keys);
			const res = await wallet.receiveTokenEntry({ proofs, mint: mintUrl });

			proofsCache.bulkPut([
				...res.proofs.map((p) => ({ ...p, status: Status.Confirmed })),
				...proofs.map((p) => ({ ...p, status: Status.Spent }))
			]);
			if (res.proofs.length) {
				console.log('zaps: save the proofs');
				// save the proofs
				await sendMessage(
					$signer,
					$key?.pub,
					getEncodedToken({ token: [{ mint: mintUrl, proofs: res.proofs }] }),
					[['nuts']]
				);

				const noteId = event.tags.find((t) => t[0] == 'e')?.[1];

				// send good reception of the proofs
				const redeem: UnsignedEvent = {
					kind: nutKinds.NutzapRedeemed,
					content: event.content,
					created_at: Math.floor(Date.now() / 1000),
					pubkey: await $signer.getPublicKey(),
					tags: [
						...proofs.map((proof) => ['proof', JSON.stringify(proof)]),
						['amount', proofs.reduce((acc, p) => acc + p.amount, 0).toString()],
						['e', noteId],
						['e', event.id, 'relay-hint', 'redeemed'],
						['p', event.pubkey]
					]
				};

				// sign the redeem event
				const signedRedeem = await $signer.signEvent(redeem);
				console.log('zaps: sending redeem event');
				await $pool.event(signedRedeem);
			}
		} else {
			console.log('outgoing nutzap event');
			// set the outgoing proofs as spent
			proofs.map((p) => proofsCache.put({ ...p, status: Status.Spent }));
			// add an event in the history db
			historyCache.add({
				date: event.created_at,
				type: HistoryItemType.SEND_NUTZAP,
				amount: -proofs.reduce((acc, p) => acc + p.amount, 0),
				data: {
					mint: mintUrl,
					to: event.tags.find((t) => t[0] === 'p')?.[1],
					keyset: proofs.map((p) => p.id)
				}
			});
		}
	}
});
