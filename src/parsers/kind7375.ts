import type { NostrEvent } from 'nostr-tools';
import type { ProofUnion, TokenContent } from './proof';


export type Kind7375Parsed = {
	mintUrl: string;
	proofs: ProofUnion[];
	deletedIds?: string[]; // IDs of token events that were deleted
	decrypted: boolean; // Whether the content was successfully decrypted
};

// This function will be implemented separately
export async function parseKind7375(event: NostrEvent): Promise<Kind7375Parsed | null> {
	// Implementation will be provided separately
	return null;
}