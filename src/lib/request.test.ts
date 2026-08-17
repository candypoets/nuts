import { describe, expect, it } from 'vitest';
import type { Request } from '@candypoets/nipworker';

import { toRequestObject } from './request';

describe('toRequestObject', () => {
	it('converts request filters without reading subscription-only options', () => {
		const request = {
			idsLength: () => 1,
			ids: () => 'event-id',
			authorsLength: () => 1,
			authors: () => 'author',
			kindsLength: () => 1,
			kinds: () => 1,
			tagsLength: () => 1,
			tags: () => ({
				itemsLength: () => 2,
				items: (index: number) => ['#p', 'mentioned-pubkey'][index]
			}),
			limit: () => 25,
			since: () => 10,
			until: () => 20,
			relaysLength: () => 1,
			relays: () => 'wss://relay.example',
			cacheFirst: () => true
		} as unknown as Request;

		expect(toRequestObject(request)).toEqual({
			ids: ['event-id'],
			authors: ['author'],
			kinds: [1],
			tags: { '#p': ['mentioned-pubkey'] },
			limit: 25,
			since: 10,
			until: 20,
			relays: ['wss://relay.example'],
			cacheFirst: true
		});
	});
});
