import type { NostrEvent } from 'nostr-tools';

export type Kind17375Parsed = {
	mints: string[]; // List of mint URLs
	p2pkPrivKey?: string; // Private key for P2PK ecash (if decrypted)
	p2pkPubKey?: string;
	decrypted: boolean; // Whether content was successfully decrypted
};

// This function will be implemented separately
export async function parseKind17375(event: NostrEvent): Promise<Kind17375Parsed | null> {
	// Implementation will be provided separately
	return null;
}
