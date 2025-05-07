import type { NostrEvent } from 'nostr-tools';

export type Kind10019Parsed = {
	trustedMints?: { url: string; baseUnits?: string[] }[]; // Mints trusted by the user (from kind 10019)
	p2pkPubkey?: string; // P2PK pubkey for receiving nutzaps
	readRelays?: string[]; // Relays trusted by the user (from kind 10019)
};

export async function parseKind10019(event: NostrEvent): Promise<Kind10019Parsed | null> {}
