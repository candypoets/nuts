import { describe, expect, it } from 'vitest';

import { buildHighlightEvent, cleanHighlightUrl, highlightSourceFromTags } from './highlights';

const articlePubkey = '11'.repeat(32);
const articleRelay = 'wss://relay.example.com';

describe('NIP-84 highlights', () => {
	it('removes tracking parameters and fragments from URL sources', () => {
		expect(
			cleanHighlightUrl(
				'https://example.com/article?utm_source=nostr&keep=yes&fbclid=tracking#section'
			)
		).toBe('https://example.com/article?keep=yes');
	});

	it('builds an article-sourced kind 9802 event', () => {
		const event = buildHighlightEvent({
			content: '  A passage worth keeping.  ',
			createdAt: 1_700_000_000,
			source: {
				address: `30023:${articlePubkey}:a-good-article`,
				relay: articleRelay,
				author: articlePubkey
			}
		});

		expect(event).toMatchObject({
			kind: 9802,
			content: 'A passage worth keeping.',
			created_at: 1_700_000_000
		});
		expect(event.tags).toContainEqual(['a', `30023:${articlePubkey}:a-good-article`, articleRelay]);
		expect(event.tags).toContainEqual(['p', articlePubkey, articleRelay, 'author']);

		const source = highlightSourceFromTags(event.tags);
		expect(source).toMatchObject({
			type: 'address',
			address: `30023:${articlePubkey}:a-good-article`,
			relay: articleRelay
		});
		if (source?.type === 'address') {
			expect(source.path).toMatch(/^naddr:naddr1/);
		}
	});

	it('prefers a marked URL source when several r tags exist', () => {
		const source = highlightSourceFromTags([
			['r', 'https://example.com/related'],
			['r', 'https://example.com/article?utm_campaign=launch', '', 'source']
		]);

		expect(source).toMatchObject({
			type: 'url',
			url: 'https://example.com/article'
		});
	});

	it('does not turn non-web r tags into clickable sources', () => {
		expect(highlightSourceFromTags([['r', 'javascript:alert(1)']])).toBeUndefined();
	});
});
