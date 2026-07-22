import type { ParsedEvent } from '@candypoets/nipworker';
import { describe, expect, it } from 'vitest';

import {
	buildCommunityProfileTags,
	COMMUNITY_PROFILE_D,
	COMMUNITY_PROFILE_KIND,
	parseCommunityProfile
} from './communityProfile';

const pubkey = '21317a0b4045a4ce330c9463ccbd6c63b5df5a67718e05adc1270853b2e47f0e';

function stubEvent(event: {
	kind: number;
	tags: string[][];
	pubkey?: string;
	createdAt?: number;
}): ParsedEvent {
	const tags = event.tags;
	return {
		kind: () => event.kind,
		pubkey: () => event.pubkey ?? pubkey,
		createdAt: () => event.createdAt ?? 1778502625,
		tagsLength: () => tags.length,
		tags: (index: number) => ({
			itemsLength: () => tags[index].length,
			items: (item: number) => tags[index][item]
		})
	} as unknown as ParsedEvent;
}

describe('buildCommunityProfileTags', () => {
	it('builds the d/type/description tags and omits empty optionals', () => {
		const tags = buildCommunityProfileTags({ type: 'sports', description: '  FC Avenir  ' });

		expect(tags).toContainEqual(['d', COMMUNITY_PROFILE_D]);
		expect(tags).toContainEqual(['type', 'sports']);
		expect(tags).toContainEqual(['description', 'FC Avenir']);
		expect(tags.find((tag) => tag[0] === 'image')).toBeUndefined();
		expect(tags.find((tag) => tag[0] === 'menu_url')).toBeUndefined();
		expect(tags.find((tag) => tag[0] === 'booking_url')).toBeUndefined();
	});

	it('keeps only http(s) URLs for image, menu and booking', () => {
		const tags = buildCommunityProfileTags({
			type: 'hospitality',
			description: '',
			image: 'data:image/png;base64,iVBORw0KGgo=',
			menuUrl: 'https://example.com/menu',
			bookingUrl: 'javascript:alert(1)'
		});

		expect(tags.find((tag) => tag[0] === 'image')).toBeUndefined();
		expect(tags).toContainEqual(['menu_url', 'https://example.com/menu']);
		expect(tags.find((tag) => tag[0] === 'booking_url')).toBeUndefined();
	});
});

describe('parseCommunityProfile', () => {
	it('round-trips a full profile event', () => {
		const tags = buildCommunityProfileTags({
			type: 'hospitality',
			description: 'Coolest café in town',
			image: 'https://example.com/cover.jpg',
			menuUrl: 'https://example.com/menu',
			bookingUrl: 'https://example.com/book'
		});
		const profile = parseCommunityProfile(stubEvent({ kind: COMMUNITY_PROFILE_KIND, tags }));

		expect(profile).toBeDefined();
		expect(profile?.type).toBe('hospitality');
		expect(profile?.description).toBe('Coolest café in town');
		expect(profile?.image).toBe('https://example.com/cover.jpg');
		expect(profile?.menuUrl).toBe('https://example.com/menu');
		expect(profile?.bookingUrl).toBe('https://example.com/book');
		expect(profile?.pubkey).toBe(pubkey);
		expect(profile?.createdAt).toBe(1778502625);
	});

	it('rejects other kinds and other d-tags', () => {
		const tags = buildCommunityProfileTags({ type: 'club', description: '' });

		expect(parseCommunityProfile(stubEvent({ kind: 30009, tags }))).toBeUndefined();
		expect(
			parseCommunityProfile(
				stubEvent({
					kind: COMMUNITY_PROFILE_KIND,
					tags: tags.map((tag) => (tag[0] === 'd' ? ['d', 'something-else'] : tag))
				})
			)
		).toBeUndefined();
	});

	it('falls back to the default type for unknown values', () => {
		const profile = parseCommunityProfile(
			stubEvent({
				kind: COMMUNITY_PROFILE_KIND,
				tags: [
					['d', COMMUNITY_PROFILE_D],
					['type', 'space-colony']
				]
			})
		);

		expect(profile?.type).toBe('other');
	});

	it('sanitizes non-http URLs coming from the relay', () => {
		const profile = parseCommunityProfile(
			stubEvent({
				kind: COMMUNITY_PROFILE_KIND,
				tags: [
					['d', COMMUNITY_PROFILE_D],
					['type', 'hospitality'],
					['image', 'data:image/png;base64,iVBORw0KGgo='],
					['menu_url', 'javascript:alert(1)']
				]
			})
		);

		expect(profile?.image).toBe('');
		expect(profile?.menuUrl).toBe('');
	});
});
