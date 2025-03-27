import type { NostrEvent } from 'nostr-tools';
import { NIP05_REGEX } from 'nostr-tools/nip05';
import type { ProfilePointer } from 'nostr-tools/nip19';

export interface Kind0Parsed {
	pubkey?: string;
	name?: string;
	display_name?: string;
	picture?: string;
	banner?: string;
	about?: string;
	website?: string;
	nip05?: string; // NIP-05 verification (user@domain.com)
	lud06?: string; // Lightning Address (LNURL)
	lud16?: string; // Lightning Address (user@domain.com)

	// Contact information
	github?: string;
	twitter?: string;
	mastodon?: string;
	nostr?: string; // Preferred relay in NIP-05

	// Additional fields that may be present
	displayName?: string; // Alternative format
	username?: string; // Alternative to name
	bio?: string; // Alternative to about
	image?: string; // Alternative to picture
	avatar?: string; // Alternative to picture
	background?: string; // Alternative to banner

	// Any custom fields
	[key: string]: string | undefined;
}

export async function parseKind0(event: NostrEvent): Promise<Kind0Parsed | null> {
	if (!event || event.kind !== 0) return null;

	try {
		let profile = JSON.parse(event.content);
		try {
			if (profile.nip05) {
				const nip05 = await queryNIP05(profile.nip05);

				profile = { ...profile, ...nip05 };
			}
		} catch (e) {
			console.warn('Failed to query nip05: ', e);
		}
		return profile;
	} catch (error) {
		console.error('Failed to parse profile:', error);
		return null;
	}
}

export async function queryNIP05(nip05: string): Promise<ProfilePointer | null> {
	const match = nip05.match(NIP05_REGEX);
	if (!match) return null;

	const [, name = '_', domain] = match;

	try {
		const url = `https://proxy.nuts.cash/?url=${domain}/.well-known/nostr.json?name=${name}`;
		const res = await fetch(url);
		if (res.status !== 200) {
			throw Error('Wrong response code:' + res.status);
		}
		const json = await res.json();

		const pubkey = json.names[name];
		return pubkey ? { pubkey, relays: json.relays?.[pubkey] } : null;
	} catch (_e) {
		console.warn('Failed to query profile:', _e);
		return null;
	}
}
