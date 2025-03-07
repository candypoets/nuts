import type { NostrEvent } from 'nostr-tools';
import { nostrDb } from 'src/db';
import { normalizeURL } from 'src/workers/utils';

// Define the structure of a NIP-65 relay record
export interface RelayInfo {
	url: string;
	read: boolean;
	write: boolean;
}

export type Kind10002Parsed = RelayInfo[];

export async function parseKind10002(event: NostrEvent): Promise<Kind10002Parsed | null> {
	const db = await nostrDb;
	if (!event || event.kind !== 10002 || !db) return null;

	try {
		// Extract relay info from the r tags
		const relays: RelayInfo[] = event.tags
			.filter((tag) => tag[0] === 'r' && tag.length >= 2 && tag[1])
			.map((tag) => {
				const url = normalizeURL(tag[1]);
				if (!url) return;
				const marker = tag.length >= 3 ? tag[2] : undefined;

				// If no marker is provided, the relay is used for both read and write
				// If a marker is provided, it should be either "read", "write", or both
				return {
					url,
					read: !marker || marker.toLowerCase() === 'read',
					write: !marker || marker.toLowerCase() === 'write'
				};
			})
			.filter(Boolean) as RelayInfo[];

		// Deduplicate relays by URL
		const uniqueRelays = new Map<string, RelayInfo>();
		for (const relay of relays) {
			uniqueRelays.set(relay.url, relay);
		}

		return Array.from(uniqueRelays.values());
	} catch (error) {
		console.error('Failed to parse relay list:', error);
		return null;
	}
}
