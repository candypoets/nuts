import { describe, it, expect, vi, beforeEach } from 'vitest';
import { groupPubkeysByRelays, createOptimizedSubscriptions } from 'src/workers/nip10';
// Or import from your test-utils file if using approach 2

// Mock dependencies
vi.mock('src/db', () => ({
	nostrDb: Promise.resolve({}),
	getProfile: vi.fn(),
	queryEvents: vi.fn(),
	addEvent: vi.fn()
}));

vi.mock('nostr-tools', () => ({
	parseReferences: vi.fn(() => []),
	SimplePool: vi.fn(() => ({
		querySync: vi.fn(() => Promise.resolve([]))
	}))
}));

vi.mock('nostr-tools/nip10', () => ({
	parse: vi.fn(() => ({
		mentions: [],
		profiles: [],
		reply: undefined,
		root: undefined
	}))
}));

describe('nip10 worker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('groupPubkeysByRelays', () => {
		it('should correctly group pubkeys by relays', () => {
			const pubkeysWithRelays = [
				{ pubkey: 'pubkey1', relays: ['relay1', 'relay2'] },
				{ pubkey: 'pubkey2', relays: ['relay2', 'relay3'] },
				{ pubkey: 'pubkey3', relays: ['relay1'] }
			];
			const defaultRelays = ['default1', 'default2'];

			const result = groupPubkeysByRelays(pubkeysWithRelays, defaultRelays);

			// Check the resulting map
			expect(result.get('relay1')).toContain('pubkey1');
			expect(result.get('relay1')).toContain('pubkey3');
			expect(result.get('relay2')).toContain('pubkey1');
			expect(result.get('relay2')).toContain('pubkey2');
			expect(result.get('relay3')).toContain('pubkey2');

			// Check sizes
			expect(result.get('relay1')?.length).toBe(2);
			expect(result.get('relay2')?.length).toBe(2);
			expect(result.get('relay3')?.length).toBe(1);
		});

		it('should use default relays when no relays provided for pubkey', () => {
			const pubkeysWithRelays = [{ pubkey: 'pubkey1', relays: [] }, { pubkey: 'pubkey2' }];
			const defaultRelays = ['default1', 'default2'];

			const result = groupPubkeysByRelays(pubkeysWithRelays, defaultRelays);

			expect(result.get('default1')).toContain('pubkey1');
			expect(result.get('default1')).toContain('pubkey2');
			expect(result.get('default2')).toContain('pubkey1');
			expect(result.get('default2')).toContain('pubkey2');
		});
	});

	describe('createOptimizedSubscriptions', () => {
		it('should create optimized subscriptions with max 2 relays per subscription', () => {
			const relayToPubkeysMap = new Map<string, string[]>([
				['relay1', ['pubkey1', 'pubkey3', 'pubkey4']],
				['relay2', ['pubkey1', 'pubkey2']],
				['relay3', ['pubkey2', 'pubkey5']]
			]);
			const baseFilter = { limit: 100 };

			const subscriptions = createOptimizedSubscriptions(relayToPubkeysMap, baseFilter);

			// Check we have the right number of subscriptions
			expect(subscriptions.length).toBeGreaterThan(0);

			// Check each subscription has max 2 relays
			subscriptions.forEach((sub) => {
				expect(sub.relays.length).toBeLessThanOrEqual(2);
			});

			// Check all pubkeys are covered
			const allPubkeys = new Set<string>();
			subscriptions.forEach((sub) => {
				sub.filters.forEach((filter) => {
					filter.authors?.forEach((author) => allPubkeys.add(author));
				});
			});

			expect(allPubkeys.size).toBe(5); // All 5 pubkeys should be covered
			expect(allPubkeys.has('pubkey1')).toBe(true);
			expect(allPubkeys.has('pubkey2')).toBe(true);
			expect(allPubkeys.has('pubkey3')).toBe(true);
			expect(allPubkeys.has('pubkey4')).toBe(true);
			expect(allPubkeys.has('pubkey5')).toBe(true);
		});

		it('should prioritize relays with more pubkeys', () => {
			const relayToPubkeysMap = new Map<string, string[]>([
				['relay1', ['pubkey1']],
				['relay2', ['pubkey1', 'pubkey2', 'pubkey3']],
				['relay3', ['pubkey4']]
			]);
			const baseFilter = {};

			const subscriptions = createOptimizedSubscriptions(relayToPubkeysMap, baseFilter);

			// First subscription should include relay2 as it has the most pubkeys
			expect(subscriptions[0].relays).toContain('relay2');
		});
	});
});
