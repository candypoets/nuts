import { describe, expect, it } from 'vitest';
import type { ParsedEvent } from '@candypoets/nipworker';

import {
	PURCHASE_RELAY_SET_D,
	buildRelayRoleSetTags,
	createRelayEoseTracker,
	mergeRelayFeedIndexTags,
	nextReplaceableCreatedAt,
	relayRoleFromSet,
	relaySetAddress
} from './adminRelays';

function stubEvent(tags: string[][], createdAt = 0): ParsedEvent {
	return {
		createdAt: () => createdAt,
		tagsLength: () => tags.length,
		tags: (tagIndex: number) => {
			const tag = tags[tagIndex];
			return tag
				? {
						itemsLength: () => tag.length,
						items: (itemIndex: number) => tag[itemIndex]
					}
				: null;
		}
	} as unknown as ParsedEvent;
}

describe('purchase relay relationship', () => {
	it('uses a dedicated addressable relay set', () => {
		const pubkey = 'a'.repeat(64);

		expect(PURCHASE_RELAY_SET_D).toBe('nuts-relays-purchases');
		expect(relaySetAddress(pubkey, 'purchase')).toBe(`30002:${pubkey}:nuts-relays-purchases`);
		expect(relayRoleFromSet(stubEvent([['d', PURCHASE_RELAY_SET_D]]))).toBe('purchase');
	});

	it('adds and deduplicates normalized purchase relays', () => {
		const existing = stubEvent([
			['d', PURCHASE_RELAY_SET_D],
			['title', 'Nuts relays I purchased from'],
			['description', 'Relays where this Nuts account has purchases or active orders'],
			['relay', 'wss://shop.example']
		]);

		expect(buildRelayRoleSetTags('purchase', existing, 'wss://shop.example/')).toEqual([
			['d', PURCHASE_RELAY_SET_D],
			['title', 'Nuts relays I purchased from'],
			['description', 'Relays where this Nuts account has purchases or active orders'],
			['relay', 'wss://shop.example/']
		]);
	});

	it('indexes the purchase set once while preserving existing relationships', () => {
		const pubkey = 'b'.repeat(64);
		const existing = stubEvent([
			['a', relaySetAddress(pubkey, 'member')],
			['a', relaySetAddress(pubkey, 'purchase')]
		]);

		expect(mergeRelayFeedIndexTags(existing, pubkey, ['purchase'])).toEqual([
			['a', relaySetAddress(pubkey, 'member')],
			['a', relaySetAddress(pubkey, 'purchase')]
		]);
	});
});

describe('relay query completion', () => {
	it('waits for EOSE from every requested relay', () => {
		const trackEose = createRelayEoseTracker([
			'wss://one.example',
			'wss://two.example',
			'wss://three.example'
		]);

		expect(trackEose('EOSE', 'wss://one.example/')).toEqual({
			completed: 1,
			settled: false
		});
		expect(trackEose('NOTICE', 'wss://two.example/')).toEqual({
			completed: 1,
			settled: false
		});
		expect(trackEose('EOSE', 'wss://two.example/')).toEqual({
			completed: 2,
			settled: false
		});
		expect(trackEose('EOSE', 'wss://three.example/')).toEqual({
			completed: 3,
			settled: true
		});
	});

	it('publishes replaceable updates after the observed event timestamp', () => {
		expect(nextReplaceableCreatedAt(stubEvent([], 100), 90)).toBe(101);
		expect(nextReplaceableCreatedAt(stubEvent([], 100), 120)).toBe(120);
		expect(nextReplaceableCreatedAt(undefined, 120)).toBe(120);
	});
});
