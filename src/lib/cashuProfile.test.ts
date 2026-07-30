import { describe, expect, it } from 'vitest';
import { buildCashuProfile, cashuP2pkPublicKey, isCashuP2pkPublicKey } from './cashuProfile';

describe('Cashu payment profile', () => {
	it('derives a compressed NUT-11 key', () => {
		const pubkey = cashuP2pkPublicKey(Uint8Array.from({ length: 32 }, () => 1));

		expect(pubkey).toHaveLength(66);
		expect(isCashuP2pkPublicKey(pubkey)).toBe(true);
	});

	it('does not accept an x-only Nostr pubkey', () => {
		expect(isCashuP2pkPublicKey('ab'.repeat(32))).toBe(false);
	});

	it('builds the organizer kind 10019 used by wallet and event setup', () => {
		const profile = buildCashuProfile(
			Uint8Array.from({ length: 32 }, () => 1),
			['https://mint.example'],
			123
		);

		expect(profile).toMatchObject({ kind: 10019, created_at: 123, content: '' });
		expect(profile.tags).toContainEqual(['mint', 'https://mint.example']);
		expect(isCashuP2pkPublicKey(profile.tags.find((tag) => tag[0] === 'pubkey')?.[1])).toBe(true);
	});
});
