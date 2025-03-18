import _ from 'lodash';
import type { NostrEvent } from 'nostr-tools';
import { nostrDb, queryEvents } from 'src/db';
import type { Kind10002Parsed } from 'src/parsers';
import type { ParsedEvent } from 'src/workers/nipworker';

export function getRelaysFromNote(note: NostrEvent): string[] {
	let relays: string[] = [];
	// Check for relay tag
	if (note.tags) {
		const relayTags = note.tags.filter((tag) => tag[0] === 'relays');
		if (relayTags.length > 0 && relayTags[0].length > 1) {
			// Use relays from the tag, removing the first element which is 'relays'
			return relayTags[0].slice(1);
		}
	}
	return [];
}
