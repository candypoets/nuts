import { describe, expect, it } from 'vitest';
import type { ParsedEvent } from '@candypoets/nipworker';

import {
	PURCHASE_RELAY_SET_D,
	buildRelayRoleSetTags,
	mergeRelayFeedIndexTags,
	relayRoleFromSet,
	relaySetAddress
} from './adminRelays';

function stubEvent(tags: string[][]): ParsedEvent {
	return {
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
