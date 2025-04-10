import { type NostrEvent, SimplePool } from 'nostr-tools';
import { addEvent, getProfile, nostrDb } from 'src/db';
import { parseContent, type Request } from 'src/workers/utils';
import type { ContentBlock } from 'src/workers/utils';

const INDEX_RELAYS = (import.meta.env.VITE_INDEXER_RELAYS || '').split(',').filter(Boolean);

export type Kind4Parsed = {
	parsedContent?: ContentBlock[];
	decryptedContent?: string;
	chatID: string;
	recipient: string;
};

export async function parseKind4(
	event: NostrEvent,
	EOSERequests?: Request[]
): Promise<Kind4Parsed | null> {
	const db = await nostrDb;
	if (!event || event.kind !== 4 || !db) return null;

	try {
		// Get the recipient from the p tag
		let recipient = '';
		for (const tag of event.tags) {
			if (tag.length >= 2 && tag[0] === 'p') {
				recipient = tag[1];
				break;
			}
		}

		if (!recipient) {
			console.error('No recipient found in DM');
			return null;
		}

		// Request profile information for both sender and recipient
		const pool = new SimplePool();
		const promises: Promise<void>[] = [];

		// Check if the event author is in indexedDB
		if (!(await getProfile(db, event.pubkey))) {
			promises.push(
				(async function () {
					if (EOSERequests) {
						EOSERequests.push({
							kinds: [0],
							authors: [event.pubkey],
							cacheFirst: true,
							relays: event.relays || INDEX_RELAYS
						});
					} else {
						const result = await pool.querySync(event.relays || INDEX_RELAYS, {
							kinds: [0],
							authors: [event.pubkey]
						});
						if (!result.length) {
							console.warn('Failed to fetch profile for sender: ', event.pubkey);
						}
						console.info('Fetched profile for sender:', event.pubkey, result?.[0]);
						await addEvent(db, result?.[0]);
					}
				})()
			);
		}

		// Check if the recipient's profile is in indexedDB
		if (!(await getProfile(db, recipient))) {
			promises.push(
				(async function () {
					if (EOSERequests) {
						EOSERequests.push({
							kinds: [0],
							authors: [recipient],
							cacheFirst: true,
							relays: event.relays || INDEX_RELAYS
						});
					} else {
						const result = await pool.querySync(event.relays || INDEX_RELAYS, {
							kinds: [0],
							authors: [recipient]
						});
						if (!result.length) {
							console.warn('Failed to fetch profile for recipient: ', recipient);
						}
						console.info('Fetched profile for recipient:', recipient, result?.[0]);
						await addEvent(db, result?.[0]);
					}
				})()
			);
		}

		// Trigger all promises in parallel
		await Promise.all(promises);

		// Create a consistent chat ID by sorting the pubkeys
		const chatParticipants = [event.pubkey, recipient];
		if (event.pubkey > recipient) {
			chatParticipants[0] = recipient;
			chatParticipants[1] = event.pubkey;
		}
		const chatID = `${chatParticipants[0]}_${chatParticipants[1]}`;

		// TODO: Implement decryption similarly to the Go code when needed
		// The decryption is commented out in the Go code, so we're leaving it as a placeholder here
		// const decryptedContent = tryDecryptMessage(event);
		// let parsedContent: ContentBlock[] | undefined;
		// if (decryptedContent) {
		//   parsedContent = await parseContent(decryptedContent);
		// }

		return {
			chatID,
			recipient
			// decryptedContent,
			// parsedContent
		};
	} catch (error) {
		console.error('Failed to parse encrypted direct message:', error);
		return null;
	}
}
