import type { NostrEvent } from 'nostr-tools';

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
