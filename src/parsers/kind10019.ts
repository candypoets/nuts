import type { NostrEvent } from 'nostr-tools';

export type Kind10019 = {
	trustedMints?: string[]; // Mints trusted by the user (from kind 10019)
	p2pkPubkey?: string; // P2PK pubkey for receiving nutzaps
};

export async function parseKind10019(event: NostrEvent): Promise<Kind10019 | null> {
	const mintTags = event.tags.filter((tag) => tag[0] === 'mint' && tag.length >= 2);
	const pubkeyTag = event.tags.find((tag) => tag[0] === 'pubkey' && tag.length >= 2);

	if (!mintTags.length || !pubkeyTag) return null;

	return {
		trustedMints: mintTags.map((tag) => tag[1]),
		p2pkPubkey: pubkeyTag[1]
	};
}
