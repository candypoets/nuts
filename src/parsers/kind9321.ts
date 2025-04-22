import type { Proof } from '@cashu/cashu-ts';
import type { NostrEvent } from 'nostr-tools';
import type { Request } from 'src/workers/utils';

export type Kind9321Parsed = {
	amount: number;
	recipient: string;
	eventId?: string; // event being zapped if any
	mintUrl: string; // mint for the proofs
	redeemed: false; // Default to not redeemed, will check later if needed
	proofs: Proof[];
};

export async function parseKind9321(
	event: NostrEvent,
	EOSERequests?: Request[]
): Promise<Kind9321Parsed | null> {
	// Extract required tags
	const proofTags = event.tags.filter((tag) => tag[0] === 'proof' && tag.length >= 2);
	const mintTag = event.tags.find((tag) => tag[0] === 'u' && tag.length >= 2);
	const recipientTag = event.tags.find((tag) => tag[0] === 'p' && tag.length >= 2);
	const eventTag = event.tags.find((tag) => tag[0] === 'e' && tag.length >= 2);

	// Validate essential tags are present
	if (!proofTags.length || !mintTag || !recipientTag) return null;
	let total = 0;

	// Parse nutzap information
	for (const proofTag of proofTags) {
		let amount = 0;

		// Try to extract amount from the proof
		try {
			const proofData = JSON.parse(proofTag[1]);
			amount = proofData.amount || 0;
		} catch (e) {
			console.error('Failed to parse proof JSON:', e);
		}
		total += amount;
	}

	if (EOSERequests) {
		EOSERequests.push({
			'#e': [event.id],
			authors: [recipientTag[1]],
			relays: event.relays
		});
	}

	return {
		amount: total,
		recipient: recipientTag[1],
		eventId: eventTag ? eventTag[1] : undefined,
		mintUrl: mintTag[1],
		proofs: proofTags.map((tag) => JSON.parse(tag[1])),
		redeemed: false // checking in the EOSE
	};
}
