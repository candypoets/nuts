import { kinds, nip04 } from 'nostr-tools';
import type { Event, UnsignedEvent } from 'nostr-tools';
import { get } from 'svelte/store';
import { signEvent } from './wallet';
import { getConvertedPubKey } from 'src/stores/wallet';
import { pool } from 'src/stores/relays';
import { signer } from 'src/stores/signer';
import { key } from 'src/stores/db';

export const getEncryptedContent = async (
	toPub: string,
	message: string
): Promise<string | undefined> => {
	return await get(signer)?.nip04.encrypt(toPub, message);
};

export const getDecryptedContent = async (
	fromPub: string,
	content: string
): Promise<string | undefined> => {
	return await get(signer)?.nip04.decrypt(fromPub, content);
};

// create a nostr event of type NIP04, sign it and publish it
export const sendMessage = async (toPub: string, message: string, tags?: string[][]) => {
	try {
		const event: UnsignedEvent = {
			kind: kinds.EncryptedDirectMessage,
			tags: [['p', await getConvertedPubKey(toPub)], ...(tags || [])],
			content: await getEncryptedContent(toPub, message),
			created_at: Math.floor(Date.now() / 1000),
			pubkey: get(key).pub
		};

		const signedEvent = await signEvent(event);

		await get(pool).event(signedEvent);
	} catch (e) {
		console.error('could not send event', e);
	}
};
