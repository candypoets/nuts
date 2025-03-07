import type { NostrEvent } from 'nostr-tools';

export interface Contact {
	pubkey: string;
	relays?: string[];
	petname?: string;
}

export type Kind3Parsed = Contact[];

export async function parseKind3(event: NostrEvent): Promise<Kind3Parsed | null> {
	if (!event || event.kind !== 3) return null;

	try {
		// Extract contacts from p tags
		const contacts: Contact[] = event.tags
			.filter((tag) => tag[0] === 'p')
			.map((tag) => ({
				pubkey: tag[1],
				relays: tag[2] ? [tag[2]] : undefined,
				petname: tag[3] || undefined
			}));

		return contacts;
	} catch (error) {
		console.error('Failed to parse contact list:', error);
		return null;
	}
}
