import type { NPool, NSecSigner } from '@nostrify/nostrify';
import { kinds, type NostrEvent, type UnsignedEvent } from 'nostr-tools';
import { bestProofCombination, signEvent } from './wallet';
import { notesCache, reactionsCache, type Note, repostsCache, key, zapsCache } from 'src/stores/db';
import { wallets, type WalletInfo } from 'src/stores/wallet';
import { nutKinds } from 'src/lib';
import { get } from 'svelte/store';

export const sendPost = async (
	pool: NPool,
	signer: NSecSigner,
	post: string,
	tags?: string[][]
) => {
	try {
		const event: UnsignedEvent = {
			kind: kinds.ShortTextNote,
			content: post,
			created_at: Math.floor(Date.now() / 1000),
			pubkey: await signer.getPublicKey(),
			tags: tags || []
		};

		const signedEvent = await signEvent(signer, event);

		notesCache.add(signedEvent);

		await pool.event(signedEvent);

		console.log('reaction sent');
	} catch (e) {
		console.log('could not send reaction', e);
	}
};

export const sendReaction = async (
	pool: NPool,
	signer: NSecSigner,
	messageId: string,
	reaction: string
) => {
	try {
		const event: UnsignedEvent = {
			kind: kinds.Reaction,
			tags: [['e', messageId]],
			content: '🤟',
			created_at: Math.floor(Date.now() / 1000),
			pubkey: await signer.getPublicKey()
		};

		const signedEvent = await signEvent(signer, event);

		reactionsCache.add({
			id: signedEvent.id,
			kind: signedEvent.kind,
			created_at: signedEvent.created_at,
			ref: messageId,
			pubkey: signedEvent.pubkey
		});

		await pool.event(signedEvent);

		console.log('reaction sent');
	} catch (e) {
		console.log('could not send reaction', e);
	}
};

export const sendReply = async (pool: NPool, signer: NSecSigner, post: Note, reply: string) => {
	const tags = [];
	if (post.reply_to) tags.push(['e', post.reply_to, '', 'root']);
	if (post.reply_to_pubkey) tags.push(['p', post.reply_to_pubkey, '', 'root']);
	try {
		const event: UnsignedEvent = {
			kind: kinds.ShortTextNote,
			tags: [...tags, ['e', post.id], ['p', post.pubkey]],
			content: reply,
			created_at: Math.floor(Date.now() / 1000),
			pubkey: await signer.getPublicKey()
		};

		const signedEvent = await signEvent(signer, event);

		notesCache.add({
			...signedEvent,
			id: signedEvent.id,
			kind: signedEvent.kind,
			created_at: signedEvent.created_at,
			reply_to: post.id,
			pubkey: signedEvent.pubkey
		});

		await pool.event(signedEvent);

		console.log('reply sent');
	} catch (e) {
		console.log('could not send reaction', e);
	}
};

export const sendRepost = async (pool: NPool, signer: NSecSigner, note: NostrEvent) => {
	// let repostId = note.id,
	try {
		const event: UnsignedEvent = {
			kind: kinds.Repost,
			tags: [
				['e', note.id],
				['p', note.pubkey]
			],
			content: JSON.stringify(note),
			created_at: Math.floor(Date.now() / 1000),
			pubkey: await signer.getPublicKey()
		};

		const signedEvent = await signEvent(signer, event);

		repostsCache.add({
			// ...signedEvent,
			id: signedEvent.id,
			kind: signedEvent.kind,
			ref: note.id,
			created_at: signedEvent.created_at,
			pubkey: signedEvent.pubkey
		});

		await pool.event(signedEvent);

		console.log('repost sent');
	} catch (e) {
		console.log('could not send reaction', e);
	}
};

export const nutsZap = async (
	pool: NPool,
	signer: NSecSigner,
	wallets: WalletInfo[],
	note: NostrEvent,
	content: string,
	amount: number
) => {
	console.log(content, amount);
	if (!amount) return;
	let amountLeft = amount;
	for (const wallet of wallets) {
		if (amountLeft <= 0) break;
		if (wallet.amount == 0) continue;
		const amountSent = wallet.amount > amountLeft ? amountLeft : wallet.amount;
		let proofs = await bestProofCombination(wallet, amountSent);

		if (!proofs.length) continue;

		// nip-19 encrypt the unblinded signature for each proofs
		proofs = await Promise.all(
			proofs.map(async (p) => ({ ...p, C: await signer.nip04.encrypt(note.pubkey, p.C) }))
		);

		try {
			const event: UnsignedEvent = {
				kind: nutKinds.Nutzap,
				content: content || '',
				created_at: Math.floor(Date.now() / 1000),
				pubkey: await signer.getPublicKey(),
				tags: [
					['amount', amountSent.toString()],
					['unit', 'sat'],
					...proofs.map((proof) => ['proof', JSON.stringify(proof)]),
					['u', wallet.mintURL],
					['e', note.id],
					['p', note.pubkey] // recipient of nut zap
				]
			};

			const signedEvent = await signEvent(signer, event);

			// optimistically add the nutzap to the cache

			await pool.event(signedEvent);

			amountLeft -= wallet.amount;
		} catch (e) {
			console.log('could not send nutzap', e);
		}
	}
};
