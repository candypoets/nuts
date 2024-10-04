import type { NPool, NSecSigner, NostrEvent } from '@nostrify/nostrify';
import { kinds } from 'nostr-tools';
import { notesCache, type Note, dmCache } from './db';

export async function* fetchMessages(
	pool: NPool,
	signer: NSecSigner,
	abortController: AbortController,
	pubkey: string,
	contactkey: string,
	since?: number
) {
	const oneDayAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
	let newMessages: { [key: string]: NostrEvent } = {};
	let loaded = false;

	try {
		const messages = pool.req(
			[
				{
					kinds: [kinds.EncryptedDirectMessage],
					'#p': [contactkey],
					authors: [pubkey],
					since: since || oneDayAgo,
					limit: 150
				},
				{
					kinds: [kinds.EncryptedDirectMessage],
					'#p': [pubkey],
					authors: [contactkey],
					since: since || oneDayAgo,
					limit: 150
				}
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] == 'EOSE') {
				if (!loaded) {
					yield Object.values(newMessages);
					loaded = true;
					console.log('loaded');
				}
				continue;
			}
			if (message[0] !== 'EVENT') continue;
			const event = message[2];
			let decrypted: string;
			// decrypt the message
			if (event.pubkey == pubkey) {
				decrypted = await signer.nip04.decrypt(contactkey, event.content);
			} else {
				decrypted = await signer.nip04.decrypt(pubkey, event.content);
			}
			event.content = decrypted;
			console.log('event: ', event.content, loaded);

			if (loaded && !newMessages[event.id]) {
				yield [event];
			}
			newMessages[event.id] = event;
			dmCache.add(event);
		}
	} catch (e) {
		console.log('unsubscribe');
		// console.error(e);
	}
}
