import { describe, it, expect } from 'vitest';
import { optimizeSubscriptions } from 'src/workers/utils/optimizeSubscriptions';
import type { Request, Subscription } from 'src/workers/utils/optimizeSubscriptions';
import type { Filter } from 'nostr-tools';

describe('optimizeSubscriptions', () => {
	it('should return an empty array for empty input', () => {
		expect(optimizeSubscriptions([])).toEqual([]);
	});

	it('should handle a single request properly', () => {
		const requests = [
			{
				kinds: [1],
				authors: ['author1'],
				relays: ['relay1', 'relay2']
			}
		];

		const result = optimizeSubscriptions(requests);

		expect(result).toHaveLength(1);
		expect(result[0].relays).toEqual(['relay1', 'relay2']);
		expect(result[0].filters).toHaveLength(1);
		expect(result[0].filters[0]).toEqual({
			kinds: [1],
			authors: ['author1']
		});
	});

	it('should group identical filters across different relays', () => {
		const requests = [
			{
				kinds: [1],
				authors: ['author1'],
				relays: ['relay1', 'relay2']
			},
			{
				kinds: [1],
				authors: ['author1'],
				relays: ['relay2', 'relay3']
			}
		];

		const result = optimizeSubscriptions(requests);

		// We expect one subscription since all filters are identical
		// failed to concatenate all the relays with the same filters into the same subscription
		expect(result).toHaveLength(1);
		expect(result[0].relays).toEqual(expect.arrayContaining(['relay1', 'relay2', 'relay3']));
		expect(result[0].filters).toHaveLength(1);
		expect(result[0].filters[0]).toEqual({
			kinds: [1],
			authors: ['author1']
		});
	});

	it('should merge mergeable fields when relays share filters', () => {
		const requests = [
			{
				kinds: [1],
				authors: ['author1'],
				relays: ['relay1']
			},
			{
				kinds: [1],
				authors: ['author2'],
				relays: ['relay1']
			}
		];

		const result = optimizeSubscriptions(requests);

		expect(result).toHaveLength(1);
		expect(result[0].relays).toEqual(['relay1']);
		// fails, filters are not merged correctly but kept separated, the authors are not merged
		expect(result[0].filters).toHaveLength(1);
		expect(result[0].filters[0].kinds).toEqual([1]);
		expect(result[0].filters[0].authors).toEqual(expect.arrayContaining(['author1', 'author2']));
	});

	it('should handle different filter structures properly', () => {
		const requests = [
			{
				kinds: [1],
				authors: ['author1'],
				relays: ['relay1', 'relay2']
			},
			{
				kinds: [2],
				'#e': ['event1'],
				relays: ['relay1', 'relay2']
			}
		];

		const result = optimizeSubscriptions(requests);

		expect(result).toHaveLength(1);
		expect(result[0].relays).toEqual(['relay1', 'relay2']);
		expect(result[0].filters).toHaveLength(2);

		// Check that both filters are present
		const filterKind1 = result[0].filters.find((f) => f.kinds && f.kinds.includes(1));
		const filterKind2 = result[0].filters.find((f) => f.kinds && f.kinds.includes(2));

		expect(filterKind1).toBeDefined();
		expect(filterKind1?.authors).toEqual(['author1']);

		expect(filterKind2).toBeDefined();
		expect(filterKind2?.['#e']).toEqual(['event1']);
	});

	it('should keep separate filter objects for non-mergeable field differences', () => {
		const requests = [
			{
				kinds: [1],
				limit: 10,
				relays: ['relay1']
			},
			{
				kinds: [1],
				limit: 20,
				relays: ['relay1']
			}
		];

		const result = optimizeSubscriptions(requests);

		expect(result).toHaveLength(1);
		expect(result[0].relays).toEqual(['relay1']);
		expect(result[0].filters).toHaveLength(2);

		// Check that both limit values are preserved in separate filters
		const limits = result[0].filters.map((f) => f.limit);
		expect(limits).toContain(10);
		expect(limits).toContain(20);
	});

	it('should create separate subscriptions for completely different relay groups', () => {
		const requests = [
			{
				kinds: [1],
				authors: ['author1'],
				relays: ['relay1', 'relay2']
			},
			{
				kinds: [2],
				authors: ['author2'],
				relays: ['relay3', 'relay4']
			}
		];

		const result = optimizeSubscriptions(requests);

		expect(result).toHaveLength(2);

		// Find the subscription for relay1/relay2
		const sub1 = result.find(
			(sub) => sub.relays.includes('relay1') && sub.relays.includes('relay2')
		);
		expect(sub1).toBeDefined();
		expect(sub1?.relays).toEqual(expect.arrayContaining(['relay1', 'relay2']));
		expect(sub1?.filters[0].kinds).toEqual([1]);
		expect(sub1?.filters[0].authors).toEqual(['author1']);

		// Find the subscription for relay3/relay4
		const sub2 = result.find(
			(sub) => sub.relays.includes('relay3') && sub.relays.includes('relay4')
		);
		expect(sub2).toBeDefined();
		expect(sub2?.relays).toEqual(expect.arrayContaining(['relay3', 'relay4']));
		expect(sub2?.filters[0].kinds).toEqual([2]);
		expect(sub2?.filters[0].authors).toEqual(['author2']);
	});

	it('should handle complex merging of tag filters', () => {
		const requests = [
			{
				kinds: [1],
				'#p': ['profile1'],
				relays: ['relay1']
			},
			{
				kinds: [1],
				'#p': ['profile2'],
				relays: ['relay1']
			},
			{
				kinds: [1],
				'#e': ['event1'],
				relays: ['relay1']
			}
		];

		const result = optimizeSubscriptions(requests);

		expect(result).toHaveLength(1);
		expect(result[0].relays).toEqual(['relay1']);

		// Should have two filters: one with #p and one with #e
		expect(result[0].filters).toHaveLength(2);

		const pTagFilter = result[0].filters.find((f) => f['#p']);
		const eTagFilter = result[0].filters.find((f) => f['#e']);

		expect(pTagFilter).toBeDefined();
		expect(pTagFilter?.['#p']).toEqual(expect.arrayContaining(['profile1', 'profile2']));

		expect(eTagFilter).toBeDefined();
		expect(eTagFilter?.['#e']).toEqual(['event1']);
	});

	it('should handle overlapping relay sets', () => {
		const requests = [
			{
				kinds: [1],
				authors: ['author1'],
				relays: ['relay1', 'relay2']
			},
			{
				kinds: [1],
				authors: ['author1'],
				relays: ['relay2', 'relay3']
			}
		];

		const result = optimizeSubscriptions(requests);

		// This is a tricky case - both relays have identical filters but overlap
		expect(result.length).toBeGreaterThan(0);

		// Find all relays in the result
		const allRelays = new Set<string>();
		result.forEach((sub) => sub.relays.forEach((r) => allRelays.add(r)));

		// All original relays should be included
		expect(allRelays.has('relay1')).toBe(true);
		expect(allRelays.has('relay2')).toBe(true);
		expect(allRelays.has('relay3')).toBe(true);

		// All filters should include the original filter content
		result.forEach((sub) => {
			sub.filters.forEach((filter) => {
				expect(filter.kinds).toEqual([1]);
				expect(filter.authors).toContain('author1');
			});
		});
	});

	it('should merge arrays and scalar values correctly', () => {
		const requests: Request[] = [
			{
				kinds: 1, // scalar
				authors: ['author1'],
				relays: ['relay1']
			},
			{
				kinds: [1, 2], // array
				authors: ['author2'],
				relays: ['relay1']
			}
		];

		const result = optimizeSubscriptions(requests);

		expect(result).toHaveLength(1);
		expect(result[0].relays).toEqual(['relay1']);
		expect(result[0].filters).toHaveLength(1);

		// The kinds field should be merged correctly
		expect(result[0].filters[0].kinds).toEqual(expect.arrayContaining([1, 2]));
		expect(result[0].filters[0].authors).toEqual(expect.arrayContaining(['author1', 'author2']));
	});

	it('should handle complex relay grouping with partial filter overlaps', () => {
		const requests = [
			{ kinds: [0], authors: ['a1'], relays: ['r1', 'r2'] },
			{ kinds: [1], authors: ['a1'], relays: ['r1', 'r2'] },
			{ kinds: [0], authors: ['a1'], relays: ['r2', 'r3'] },
			{ kinds: [2], authors: ['a2'], relays: ['r3', 'r4'] }
		];

		const result = optimizeSubscriptions(requests);

		// We should optimize these into appropriate groupings
		expect(result.length).toBeGreaterThan(0);

		// Verification strategy: Check that each relay gets all the filters it needs

		// r1 needs kinds 0,1 with author a1
		const r1Subs = result.filter((sub) => sub.relays.includes('r1'));
		const r1Filters = r1Subs.flatMap((sub) => sub.filters);

		expect(
			r1Filters.some((f) => f.kinds && f.kinds.includes(0) && f.authors && f.authors.includes('a1'))
		).toBe(true);

		expect(
			r1Filters.some((f) => f.kinds && f.kinds.includes(1) && f.authors && f.authors.includes('a1'))
		).toBe(true);

		// r3 needs kind 0 with author a1 and kind 2 with author a2
		const r3Subs = result.filter((sub) => sub.relays.includes('r3'));
		const r3Filters = r3Subs.flatMap((sub) => sub.filters);

		expect(
			r3Filters.some((f) => f.kinds && f.kinds.includes(0) && f.authors && f.authors.includes('a1'))
		).toBe(true);

		expect(
			r3Filters.some((f) => f.kinds && f.kinds.includes(2) && f.authors && f.authors.includes('a2'))
		).toBe(true);
	});

	it('should handle requests with empty or undefined relays', () => {
		const requests: Request[] = [
			{
				kinds: [1],
				authors: ['author1'],
				relays: [] // Empty relays array
			},
			{
				kinds: [2],
				authors: ['author2'],
				relays: undefined as unknown as string[] // Undefined relays
			},
			{
				kinds: [3],
				authors: ['author3'],
				relays: ['relay1']
			}
		];

		const result = optimizeSubscriptions(requests);

		// We should still have a subscription for relay1
		expect(result.some((sub) => sub.relays.includes('relay1'))).toBe(true);

		// Check if empty relays are handled correctly
		const emptyRelaysSubscription = result.find((sub) => sub.relays.length === 0);
		if (emptyRelaysSubscription) {
			expect(
				emptyRelaysSubscription.filters.some(
					(f) => f.kinds && f.kinds.includes(1) && f.authors && f.authors.includes('author1')
				)
			).toBe(true);
		}

		// Make sure no undefined values made it into any relay arrays
		result.forEach((sub) => {
			expect(sub.relays.includes(undefined as unknown as string)).toBe(false);
		});

		// Make sure the relay1 subscription has the correct filter
		const relay1Sub = result.find((sub) => sub.relays.includes('relay1'));
		expect(relay1Sub).toBeDefined();
		expect(
			relay1Sub?.filters.some(
				(f) => f.kinds && f.kinds.includes(3) && f.authors && f.authors.includes('author3')
			)
		).toBe(true);
	});
});
