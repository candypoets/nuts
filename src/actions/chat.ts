import { kinds, nip04 } from 'nostr-tools';
import type { Event, UnsignedEvent } from 'nostr-tools';
import { nostrPrivKey, pool } from 'src/stores/nostr';
import { get } from 'svelte/store';
import { getMyPubKey, signEvent } from './wallet';
import { getConvertedPubKey } from 'src/stores/wallet';

export const getEncryptedContent = async (toPub: string, message: string): Promise<string> => {
	return window.nostr
		? await window.nostr.nip04.encrypt(toPub, message)
		: await nip04.encrypt(get(nostrPrivKey), toPub, message);
};

export const getDecryptedContent = async (fromPub: string, content: string): Promise<string> => {
	return window.nostr
		? await window.nostr.nip04.decrypt(fromPub, content)
		: await nip04.decrypt(get(nostrPrivKey), fromPub, content);
};

// create a nostr event of type NIP04, sign it and publish it
export const sendMessage = async (toPub: string, message: string, tags?: string[][]) => {
	const event: UnsignedEvent = {
		kind: kinds.EncryptedDirectMessage,
		tags: [['p', await getConvertedPubKey(toPub)], ...(tags || [])],
		content: await getEncryptedContent(toPub, message),
		created_at: Math.floor(Date.now() / 1000),
		pubkey: await getMyPubKey()
	};

	const signedEvent = await signEvent(event);

	await pool.event(signedEvent);
};
