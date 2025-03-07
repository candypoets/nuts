import _ from 'lodash';
import type { NostrEvent } from 'nostr-tools';
import { nostrDb, queryEvents } from 'src/db';
import type { Kind10002Parsed } from 'src/parsers';
import type { ParsedEvent } from 'src/workers/nipworker';

export async function getRelaysFromNote(note: NostrEvent): Promise<string[]> {
	let relays: string[] = [];
	// Check for relay tag
	if (note.tags) {
		const relayTags = note.tags.filter((tag) => tag[0] === 'relays');
		if (relayTags.length > 0 && relayTags[0].length > 1) {
			// Use relays from the tag, removing the first element which is 'relays'
			return relayTags[0].slice(1);
		}
	}
	if (!relays.length) {
		const db = await nostrDb;
		if (db) {
			const event: ParsedEvent<Kind10002Parsed> = (
				await queryEvents(db, { authors: [note.pubkey], kinds: [10002] })
			)?.[0];
			if (event && event.parsed) {
				const readableRelays = event.parsed.filter((r) => r.read).map((r) => r.url);
				// Randomly pick 2 relays from the list
				return _.sampleSize(readableRelays, Math.min(2, readableRelays.length));
			}
		}
	}
	return [];
}
