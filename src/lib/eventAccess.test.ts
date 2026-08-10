import { describe, expect, it } from 'vitest';

import { buildPaidEventAccess } from './eventAccess';

const author = '21317a0b4045a4ce330c9463ccbd6c63b5df5a67718e05adc1270853b2e47f0e';

describe('paid event access', () => {
	it('builds a sellable one-use badge attached to its event in both directions', () => {
		const access = buildPaidEventAccess({
			eventKind: 31923,
			eventAuthor: author,
			eventD: 'summer-party',
			eventTitle: 'Summer party',
			eventImage: 'https://cdn.example/summer.jpg',
			price: '12.50',
			currency: 'eur',
			priceSats: 25_000,
			expiresAt: 1_800_000_000,
			relay: 'wss://community.example'
		});

		expect(access.eventAddress).toBe(`31923:${author}:summer-party`);
		expect(access.badgeAddress).toBe(`30402:${author}:event-summer-party-entrance`);
		expect(access.eventTags).toContainEqual(['entrance_badge', access.badgeAddress]);
		expect(access.eventTags).toContainEqual(['entrance_price', '12.50', 'EUR']);
		expect(access.eventTags).toContainEqual(['entrance_sats', '25000']);
		// NIP-97 ticket: a 30402 listing linked to its event - no type/topic markers.
		expect(access.definitionTags.some((tag) => tag[0] === 'type')).toBe(false);
		expect(access.definitionTags.some((tag) => tag[0] === 't')).toBe(false);
		expect(access.definitionTags).toContainEqual(['d', 'event-summer-party-entrance']);
		expect(access.definitionTags).toContainEqual(['title', 'Summer party entrance']);
		expect(access.definitionTags).toContainEqual(['a', access.eventAddress]);
		expect(access.definitionTags).toContainEqual(['price', '12.50', 'EUR']);
		expect(access.definitionTags).toContainEqual(['price_sats', '25000']);
		expect(access.definitionTags).toContainEqual(['max_uses', '1']);
		expect(access.definitionTags).toContainEqual(['availability', 'available']);
		expect(access.definitionTags).toContainEqual(['expiration', '1800000000']);
		expect(access.definitionTags).toContainEqual(['image', 'https://cdn.example/summer.jpg']);
		expect(access.definitionTags).toContainEqual(['r', 'wss://community.example']);
	});

	it('rejects invalid sale terms', () => {
		expect(() =>
			buildPaidEventAccess({
				eventKind: 31923,
				eventAuthor: author,
				eventD: 'free',
				eventTitle: 'Free',
				price: 0,
				currency: 'EUR',
				expiresAt: 1_800_000_000
			})
		).toThrow(/price/);
	});
});
