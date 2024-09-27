// fetch all dms for this account

import { browser } from '$app/environment';
import { CashuMint, CashuWallet, getDecodedToken, type Proof, type Token } from '@cashu/cashu-ts';
import type { NPool, NSecSigner, NostrEvent } from '@nostrify/nostrify';
import { kinds, type UnsignedEvent } from 'nostr-tools';
import _ from 'lodash';
import { checkProofsSpentWithMintUrl, saveNuts, signEventWithRetry } from 'src/actions/wallet';
import {
	activeAccount,
	db,
	dmCache,
	historyCache,
	key,
	keysCache,
	keysetsCache,
	mintsCache,
	proofsCache,
	Status
} from './db';
import { derived } from 'svelte/store';
import { signer } from './signer';
import { pool } from './relays';
import { nutKinds } from 'src/lib';
import { HistoryItemType, type HistoryItem } from 'src/model/historyItem';
import type { HistoryData } from 'src/model/data/HistoryData';
import { ADDRESS_ZERO } from './constants';
import { satsLoading } from '.';

let abortController = new AbortController();

export const dmSub = derived(
	[signer, pool, key, db, keysCache, activeAccount],
	async ([$signer, $pool, $key, $db, $keysCache, $activeAccount]) => {
		abortController.abort();
		if (!browser) return;
		if (!$key?.pub) return;
		if (!$pool) return;
		if (!$signer) return;
		if (Array.from($keysCache.values())[$activeAccount]?.pub != $key?.pub) return;
		abortController = new AbortController();
		const lastEvent = await $db.dms.orderBy('created_at').last();
		console.log('dmSub');
		const newDms = fetchDms($signer, $pool, $key.pub, abortController, lastEvent?.created_at);
		for await (const dm of newDms) {
			// console.log('dm', dm);
		}
	}
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function* fetchDms(
	signer: NSecSigner,
	pool: NPool,
	pubkey: string,
	abortController: AbortController,
	since?: number
) {
	satsLoading.set(true);
	console.log('fetchDms');
	let newMessages: { [key: string]: NostrEvent } = {};
	let newZaps: { [key: string]: NostrEvent } = {};
	let redeemedZaps: { [key: string]: NostrEvent } = {};
	let loaded = false;

	try {
		const messages = pool.req(
			[
				{
					kinds: [kinds.EncryptedDirectMessage],
					'#p': [pubkey],
					since
				},
				{
					kinds: [kinds.EncryptedDirectMessage],
					authors: [pubkey],
					since
				},
				{
					kinds: [nutKinds.Nutzap],
					'#p': [pubkey],
					since
				},
				{
					kinds: [nutKinds.Nutzap],
					authors: [pubkey],
					since
				},
				{
					kinds: [nutKinds.NutzapRedeemed],
					authors: [pubkey],
					since
				}
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] == 'EOSE') {
				if (!loaded) {
					dmCache.bulkPut(Object.values(newMessages));
					// call a function that will decrypt all message content
					const { proofsToSave, zapRedeemed, history } = await computeProofs(
						Object.values(newMessages),
						Object.values(newZaps),
						Object.values(redeemedZaps),
						pubkey,
						signer
					);

					historyCache.bulkPut(history);

					await dispatchEvents(proofsToSave, zapRedeemed, newZaps, pubkey, signer, pool);

					loaded = true;
					satsLoading.set(false);
				}
				satsLoading.set(false);
			}
			if (message[0] !== 'EVENT') continue;
			const event = message[2];
			if (event.kind == kinds.EncryptedDirectMessage) {
				if (loaded && !newMessages[event.id]) {
					const { proofsToSave, zapRedeemed, history } = await computeProofs(
						[event],
						[],
						Object.values(redeemedZaps),
						pubkey,
						signer
					);

					historyCache.bulkPut(history);

					await dispatchEvents(proofsToSave, zapRedeemed, newZaps, pubkey, signer, pool);
				}
				newMessages[event.id] = event;
			} else if (event.kind == nutKinds.NutzapRedeemed) {
				redeemedZaps[event.id] = event;
			} else {
				console.log('new zap');
				if (loaded && !newZaps[event.id]) {
					const { proofsToSave, zapRedeemed, history } = await computeProofs(
						[],
						[event],
						Object.values(redeemedZaps),
						pubkey,
						signer
					);

					historyCache.bulkPut(history);

					await dispatchEvents(proofsToSave, zapRedeemed, newZaps, pubkey, signer, pool);
				}
				newZaps[event.id] = event;
			}
			// console.log('newdm');
			// if (loaded) {
			// 	yield event;
			// }
		}
	} catch (e) {
		console.log('error in dm', e);
	}
}

async function dispatchEvents(
	proofsToSave: Proof[],
	zapRedeemed: string[],
	newZaps: { [key: string]: NostrEvent },
	pubkey: string,
	signer: NSecSigner,
	pool: NPool
) {
	// send the zap redeem event and the saved proofs event too
	for (const eventId of zapRedeemed) {
		const zap = newZaps[eventId];
		const event = {
			kind: nutKinds.NutzapRedeemed,
			content: zap.content,
			created_at: Math.floor(Date.now() / 1000),
			pubkey,
			tags: [
				...zap.tags,
				[
					'amount',
					zap.tags
						.filter((t) => t[0] == 'proof')
						.map((t) => JSON.parse(t[1]))
						.reduce((acc: number, p: Proof) => acc + p.amount, 0)
						.toString()
				],
				['e', zap.id, 'redeemed', 'true'],
				['p', zap.pubkey]
			]
		};
		const signedEvent = await signEventWithRetry(signer, event);
		if (signedEvent) {
			pool.event(signedEvent);
		}
	}
	if (proofsToSave.length) {
		saveNuts(signer, proofsToSave, pubkey);
	}
}

async function computeProofs(
	newMessages: NostrEvent[],
	newZaps: NostrEvent[],
	redeemedZaps: NostrEvent[],
	pubkey: string,
	signer: NSecSigner
): Promise<{ proofsToSave: Proof[]; zapRedeemed: string[]; history: HistoryItem<HistoryData>[] }> {
	const { incoming, saving, outgoing, history } = await decryptMessages(
		newMessages,
		pubkey,
		signer
	);

	const { proofsToSave, proofsSpent, zapRedeemed, zapHistory } = await decryptZaps(
		_.differenceBy(newZaps, redeemedZaps, 'id'),
		pubkey,
		signer
	);

	console.log('message decrypted', proofsSpent);
	console.log(incoming, saving, outgoing);
	// for all the proofs that are coming back, save the keysetId to mintURL mapping
	Object.keys(incoming).map((k) => mintsCache.add({ url: k }));
	Object.keys(saving).map((k) => mintsCache.add({ url: k }));

	// check what has been spent from the incoming and saving proofs
	const spents = (
		await Promise.all([
			...Object.keys(incoming).map((mintURL) =>
				checkProofsSpentWithMintUrl(incoming[mintURL], mintURL)
			),
			...Object.keys(saving).flatMap((mintURL) =>
				checkProofsSpentWithMintUrl(saving[mintURL], mintURL)
			),
			outgoing,
			proofsSpent
		])
	).flatMap((x) => x);

	const unspentIncomings = _.differenceBy(
		Object.keys(incoming).flatMap((key) => incoming[key]),
		spents,
		'secret'
	);

	// put all unspent incoming in the db
	proofsCache.bulkPut(unspentIncomings);

	const unspentSavings = _.differenceBy(
		Object.keys(saving).flatMap((key) => saving[key]),
		spents,
		'secret'
	);

	// add all the unspent savings to the db as confirmed
	proofsCache.bulkPut(
		unspentSavings.concat(proofsToSave).map((p) => ({ ...p, status: Status.Confirmed }))
	);

	// add all the rest to the db as spent
	proofsCache.bulkPut(spents.concat(proofsSpent).map((p) => ({ ...p, status: Status.Spent })));
	return { proofsToSave, zapRedeemed, history: history.concat(zapHistory) };
}

async function decryptMessages(
	messages: NostrEvent[],
	pubkey: string,
	signer?: NSecSigner
): Promise<{
	incoming: { [mintUrl: string]: Proof[] };
	saving: { [mintUrl: string]: Proof[] };
	outgoing: Proof[];
	history: HistoryItem<HistoryData>[];
}> {
	if (!signer) return { incoming: {}, saving: {}, outgoing: [], history: [] };
	if (!pubkey) return { incoming: {}, saving: {}, outgoing: [], history: [] };
	const incomings = [];
	const savings = [];
	const outgoings = [];
	const history: HistoryItem<HistoryData>[] = [];
	console.log(messages.length);
	for (const m of messages) {
		if (m.pubkey == pubkey) {
			if (m.tags.some((t) => t[0] === 'p' && t[1] === pubkey)) {
				savings.push(m);
			} else {
				outgoings.push(m);
			}
		} else {
			incomings.push(m);
		}
	}
	// filter message by incoming and outgoing
	// const incomingTokens = await Promise.all(
	// 	incomings.map(async (message) => await decryptToken(message, pubkey, signer))
	// );
	const incomingTokens = [];
	for (const incoming of incomings) {
		const token = await decryptToken(incoming, pubkey, signer);
		if (token) {
			history.push({
				date: incoming.created_at,
				type: HistoryItemType.RECEIVE_NOSTR,
				amount:
					token?.token
						.reduce((acc, cur) => acc.concat(cur.proofs), [] as Proof[])
						.reduce((acc, cur) => (acc += cur.amount), 0) || 0,
				data: {
					mint: token?.token[0].mint || '',
					keyset: ['0'], // @todo,
					from: incoming.pubkey
				}
			});
		}
		incomingTokens.push(token);
	}
	const savingsToken = [];
	for (const saving of savings) {
		const token = await decryptToken(saving, pubkey, signer);
		if (token && !saving.tags.some((t) => t[0] === 'nuts')) {
			history.push({
				date: saving.created_at,
				type: saving.tags.some((t) => t[0] === 'change')
					? HistoryItemType.CHANGE
					: HistoryItemType.MINT,
				amount:
					token?.token
						.reduce((acc, cur) => acc.concat(cur.proofs), [] as Proof[])
						.reduce((acc, cur) => (acc += cur.amount), 0) || 0,
				data: {
					mint: token?.token[0].mint || '',
					keyset: ['0'], // @todo,
					from: saving.pubkey
				}
			});
		}
		savingsToken.push(token);
	}
	// const savingsToken = await Promise.all(
	// 	savings.map(async (message) => await decryptToken(message, pubkey, signer))
	// );
	const outgoingTokens = [];
	for (const outgoing of outgoings) {
		const token = await decryptToken(outgoing, pubkey, signer);
		const to = outgoing.tags.find((t) => t[0] === 'p')?.[1] ?? '';
		if (token) {
			history.push({
				date: outgoing.created_at,
				type: to == ADDRESS_ZERO ? HistoryItemType.MELT : HistoryItemType.SEND,
				amount: -(
					token?.token
						.reduce((acc, cur) => acc.concat(cur.proofs), [] as Proof[])
						.reduce((acc, cur) => (acc += cur.amount), 0) || 0
				),
				data: {
					mint: '',
					keyset: ['0'], // @todo
					to
				}
			});
		}
		outgoingTokens.push(token);
	}
	// const outgoingTokens = await Promise.all(
	// 	outgoings.map(async (message) => await decryptToken(message, pubkey, signer))
	// );
	const incoming = (incomingTokens.filter((t) => !!t) as Token[])
		.flatMap((t) => t.token)
		.reduce(
			(acc, cur) => ({ ...acc, [cur.mint]: [...(acc[cur.mint] || []), ...cur.proofs] }),
			{} as { [key: string]: Proof[] }
		);
	const saving = (savingsToken.filter((t) => !!t) as Token[])
		.flatMap((t) => t.token)
		.reduce(
			(acc, cur) => ({ ...acc, [cur.mint]: [...(acc[cur.mint] || []), ...cur.proofs] }),
			{} as { [key: string]: Proof[] }
		);
	for (const key in incoming) {
		incoming[key] = _.uniqBy(incoming[key], 'secret');
	}
	for (const key in saving) {
		saving[key] = _.uniqBy(saving[key], 'secret');
	}

	// only return tokens that resolves
	return {
		history,
		incoming,
		saving,
		outgoing: _.uniqBy(
			(outgoingTokens.filter((t) => t) as Token[]).flatMap((t) => t.token).flatMap((t) => t.proofs),
			'secret'
		)
	};
}

async function decryptZaps(
	messages: NostrEvent[],
	pubkey: string,
	signer: NSecSigner
): Promise<{
	proofsToSave: Proof[];
	proofsSpent: Proof[];
	zapRedeemed: string[];
	zapHistory: HistoryItem<HistoryData>[];
}> {
	let proofsToSave: Proof[] = [];
	let proofsSpent: Proof[] = [];
	const zapRedeemed: string[] = [];
	const incomings = [];
	const outgoings = [];
	const zapHistory: HistoryItem<HistoryData>[] = [];
	console.log(messages.length);
	for (const m of messages) {
		if (m.pubkey == pubkey) {
			outgoings.push(m);
		} else {
			incomings.push(m);
		}
	}
	for (const m of incomings) {
		const mintUrl = m.tags.find((t) => t[0] === 'u')?.[1];
		if (!mintUrl) continue;
		let proofs: Proof[] = m.tags.filter((t) => t[0] === 'proof').map((t) => JSON.parse(t[1]));
		try {
			proofs = (
				await Promise.all(
					proofs.map(async (p) => {
						return { ...p, C: await decryptMessageWithRetry(signer, m.pubkey, p.C) };
					})
				)
			).filter((p) => !!p.C) as Proof[];
		} catch (e) {
			console.info('invalid zap proofs incoming');
			continue;
		}
		if (proofs.length > 0) {
			const cashuMint = new CashuMint(mintUrl);
			const wallet = new CashuWallet(cashuMint);
			const res = await wallet.receiveTokenEntry({ proofs, mint: mintUrl });

			if (res.proofs.length) {
				// make sure this mint is known by the cache
				mintsCache.add({ url: mintUrl });
				proofsToSave = proofsToSave.concat(res.proofs);
				zapRedeemed.push(m.id);
			}
			zapHistory.push({
				date: m.created_at,
				type: HistoryItemType.RECEIVE_NUTZAP,
				amount: proofs.reduce((acc, p) => acc + p.amount, 0),
				data: {
					mint: mintUrl,
					from: m.pubkey,
					keyset: proofs.map((p) => p.id)
				}
			});
		}
	}
	for (const m of outgoings) {
		let proofs: Proof[] = m.tags.filter((t) => t[0] === 'proof').map((t) => JSON.parse(t[1]));
		// try {
		// 	proofs = (
		// 		await Promise.all(
		// 			proofs.map(async (p) => {
		// 				return { ...p, C: await decryptMessageWithRetry(signer, m.pubkey, p.C) };
		// 			})
		// 		)
		// 	).filter((p) => !!p.C) as Proof[];
		// } catch (e) {
		// 	console.info('invalid zap proofs incoming');
		// 	continue;
		// }
		zapHistory.push({
			date: m.created_at,
			type: HistoryItemType.SEND_NUTZAP,
			amount: -proofs.reduce((acc, p) => acc + p.amount, 0),
			data: {
				mint: '',
				to: m.tags.find((t) => t[0] === 'p')?.[1],
				keyset: proofs.map((p) => p.id)
			}
		});
		proofsSpent = proofsSpent.concat(proofs);
	}
	return { proofsToSave, proofsSpent, zapRedeemed, zapHistory };
}

export async function decryptMessageWithRetry(
	signer: NSecSigner,
	senderKey: string,
	content: string
): Promise<string | undefined> {
	let attempts = 0;
	const maxAttempts = 5;
	const initialTimeout = 100;
	while (attempts < maxAttempts) {
		// console.log('attempts', attempts);
		try {
			const decryptPromise = signer.nip04.decrypt(senderKey, content);
			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Decryption timed out')), initialTimeout)
			);
			return (await Promise.race([decryptPromise, timeoutPromise])) as string;
		} catch (error) {
			console.error(`Decryption attempt ${attempts + 1} failed: ${error}`);
			attempts++;
			// await new Promise((resolve) => setTimeout(resolve, 100)); // Short delay before retrying
		}
	}
	console.error(`Failed to decrypt message after ${maxAttempts} attempts`);
	return undefined;
}

async function decryptToken(
	message: NostrEvent,
	pubkey: string,
	signer: NSecSigner
): Promise<Token | undefined> {
	const incoming = message.tags.some((t) => t[0] === 'p' && t[1] === pubkey);
	let decodedMessage: string | undefined;
	const senderKey = incoming ? message.pubkey : message.tags.find((t) => t[0] == 'p')?.[1];

	decodedMessage = await decryptMessageWithRetry(signer, senderKey as string, message.content);

	if (!decodedMessage) {
		return;
	}

	let token;
	try {
		token = getDecodedToken(decodedMessage);
	} catch (e) {
		// console.error(e, 'could not decode nip-04 message as token. Ignoring this message');
		return;
	}

	if (!token?.token) {
		// if the event is not in a cashu token format, ignore it
		return;
	}

	// if (!isValidToken(token.token)) {
	// 	// ignore messages that are not tokens
	// 	return;
	// }
	return token;
}
