import type { NPool, NSecSigner } from '@nostrify/nostrify';
import { kinds, type NostrEvent, type UnsignedEvent } from 'nostr-tools';
import { bestProofCombination, signEvent } from './wallet';
import { notesCache, reactionsCache } from 'src/stores/db';
import { wallets, type WalletInfo } from 'src/stores/wallet';

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

export const sendReply = async (
	pool: NPool,
	signer: NSecSigner,
	messageId: string,
	reply: string
) => {
	try {
		const event: UnsignedEvent = {
			kind: kinds.ShortTextNote,
			tags: [['e', messageId]],
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
			reply_to: messageId,
			pubkey: signedEvent.pubkey
		});

		await pool.event(signedEvent);

		console.log('reply sent');
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
	let amountLeft = amount;
	for (const wallet of wallets) {
		if (amountLeft <= 0) break;
		if (wallet.amount == 0) continue;
		const amountSent = wallet.amount > amountLeft ? amountLeft : wallet.amount;
		const proofs = await bestProofCombination(wallet, amountSent, note.pubkey);
		try {
			const event: UnsignedEvent = {
				kind: 9321,
				content,
				pubkey: await signer.getPublicKey(),
				tags: [
					['amount', amountSent.toString()],
					['unit', 'sat'],
					...proofs.map((proof) => ['proof', JSON.stringify(proof)]),
					['u', wallet.mintURL],
					['e', note.id],
					['p', 'e9fbced3a42dcf551486650cc752ab354347dd413b307484e4fd1818ab53f991'] // recipient of nut zap
				]
			};

			const signedEvent = await signEvent(signer, event);

			await pool.event(signedEvent);

			amountLeft -= wallet.amount;
		} catch (e) {
			console.log('could not send nutzap', e);
		}
	}
};
