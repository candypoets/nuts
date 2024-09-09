import { kinds, nip04 } from 'nostr-tools';
import type { Event, UnsignedEvent } from 'nostr-tools';
import { get } from 'svelte/store';
import { signEvent } from './wallet';
import { getConvertedPubKey } from 'src/stores/wallet';
import { pool } from 'src/stores/relays';

import { key } from 'src/stores/db';
import type { NSecSigner } from '@nostrify/nostrify';

// export const getEncryptedContent = async (
// 	toPub: string,
// 	message: string
// ): Promise<string | undefined> => {
// 	return await get(signer)?.nip04.encrypt(toPub, message);
// };

// export const getDecryptedContent = async (
// 	fromPub: string,
// 	content: string
// ): Promise<string | undefined> => {
// 	return await get(signer)?.nip04.decrypt(fromPub, content);
// };

// create a nostr event of type NIP04, sign it and publish it
export const sendMessage = async (
	signer: NSecSigner,
	toPub: string,
	message: string,
	tags?: string[][]
) => {
	try {
		const event: UnsignedEvent = {
			kind: kinds.EncryptedDirectMessage,
			tags: [['p', await getConvertedPubKey(toPub)], ...(tags || [])],
			content: await signer.nip04.encrypt(toPub, message),
			created_at: Math.floor(Date.now() / 1000),
			pubkey: get(key).pub
		};

		const signedEvent = await signEvent(signer, event);

		await get(pool).event(signedEvent);
	} catch (e) {
		console.error('could not send event', e);
		// consider a queue of unsent messagees to be tried again later
	}
};
