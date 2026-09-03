import { describe, expect, it } from 'vitest';
import {
	exploreFeedHref,
	exploreFeedKinds,
	exploreFeedPath,
	exploreFeedTabFromPath,
	isExploreFeedPath,
	withExploreRelayParams
} from './exploreFeedRoute';

describe('Explore feed routes', () => {
	it.each([
		['notes', '/explore'],
		['media', '/explore/media'],
		['events', '/explore/live'],
		['highlights', '/explore/highlights'],
		['polls', '/explore/polls'],
		['articles', '/explore/articles']
	] as const)('maps %s to %s', (tab, path) => {
		expect(exploreFeedPath(tab)).toBe(path);
		expect(exploreFeedTabFromPath(path)).toBe(tab);
	});

	it('keeps the feed route while a pushed screen is open', () => {
		expect(exploreFeedTabFromPath('/explore/highlights/nprofile:abc')).toBe('highlights');
	});

	it('uses notes for existing Explore sub-routes', () => {
		expect(exploreFeedTabFromPath('/explore/nevent:abc')).toBe('notes');
		expect(exploreFeedKinds('notes')).toEqual([]);
	});

	it('distinguishes feed roots from pushed screens', () => {
		expect(isExploreFeedPath('/explore')).toBe(true);
		expect(isExploreFeedPath('/explore/highlights')).toBe(true);
		expect(isExploreFeedPath('/explore/highlights/nprofile:abc')).toBe(false);
		expect(isExploreFeedPath('/explore/nevent:abc')).toBe(false);
	});

	it('adds repeatable, encoded relay parameters to a feed link', () => {
		expect(exploreFeedHref('highlights', ['wss://nostr.wine', 'wss://relay.nuts.cash'])).toBe(
			'/explore/highlights?relay=wss%3A%2F%2Fnostr.wine&relay=wss%3A%2F%2Frelay.nuts.cash'
		);
	});

	it('replaces relay parameters without dropping unrelated parameters or pushed screens', () => {
		expect(
			withExploreRelayParams('/explore/highlights/nprofile:abc?foo=bar&relay=wss%3Aold', [
				'wss://new.relay'
			])
		).toBe('/explore/highlights/nprofile:abc?foo=bar&relay=wss%3A%2F%2Fnew.relay');
	});

	it('deduplicates relay parameters', () => {
		expect(withExploreRelayParams('/explore', ['wss://nos.lol', 'wss://nos.lol'])).toBe(
			'/explore?relay=wss%3A%2F%2Fnos.lol'
		);
	});
});
