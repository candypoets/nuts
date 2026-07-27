import { describe, expect, it } from 'vitest';
import {
	extractPostImage,
	isPublicIpAddress,
	neventFromPath,
	postDescription,
	renderPostPreviewHead
} from './postPreview';

describe('post preview', () => {
	it('accepts public addresses and rejects internal address ranges', () => {
		expect(isPublicIpAddress('8.8.8.8')).toBe(true);
		expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
		expect(isPublicIpAddress('127.0.0.1')).toBe(false);
		expect(isPublicIpAddress('192.168.1.5')).toBe(false);
		expect(isPublicIpAddress('169.254.169.254')).toBe(false);
		expect(isPublicIpAddress('::1')).toBe(false);
		expect(isPublicIpAddress('::ffff:127.0.0.1')).toBe(false);
		expect(isPublicIpAddress('fd00::1')).toBe(false);
	});

	it('prefers NIP-92 image metadata and falls back to image URLs in content', () => {
		expect(
			extractPostImage({
				content: 'https://example.com/fallback.jpg',
				tags: [['imeta', 'url https://cdn.example.com/post.webp', 'm image/webp']]
			})
		).toBe('https://cdn.example.com/post.webp');
		expect(
			extractPostImage({
				content: 'Look https://example.com/photo.png?size=large',
				tags: []
			})
		).toBe('https://example.com/photo.png?size=large');
	});

	it('only extracts nevents from post detail paths', () => {
		expect(neventFromPath('/explore/nevent:nevent1abc')).toBe('nevent1abc');
		expect(neventFromPath('/explore/reply:nevent1abc')).toBeNull();
		expect(neventFromPath('/explore/nevent:nevent1abc/extra')).toBeNull();
	});

	it('uses short note content as its description', () => {
		expect(postDescription('GN 🐔')).toBe('GN 🐔');
	});

	it('escapes metadata rendered into the initial document head', () => {
		const head = renderPostPreviewHead(
			{
				title: 'Alice & "Bob"',
				description: '<hello> and more',
				image: 'https://cdn.example.com/post.jpg?a=1&b=2',
				publishedTime: '2026-07-27T12:00:00.000Z'
			},
			new URL('https://nuts.example/explore/nevent:nevent1abc')
		);

		expect(head).toContain('content="Alice &amp; &quot;Bob&quot;"');
		expect(head).toContain('content="&lt;hello&gt; and more"');
		expect(head).toContain('name="twitter:card" content="summary_large_image"');
		expect(head).not.toContain('<hello>');
	});

	it('renders a social note title and its short content', () => {
		const head = renderPostPreviewHead(
			{
				title: 'Note from Sync',
				description: 'GN 🐔',
				image: 'https://cdn.example.com/post.jpg',
				publishedTime: '2026-07-27T12:00:00.000Z'
			},
			new URL('https://nuts.example/explore/nevent:nevent1abc')
		);

		expect(head).toContain('property="og:title" content="Note from Sync"');
		expect(head).toContain('property="og:description" content="GN 🐔"');
		expect(head).toContain('name="twitter:description" content="GN 🐔"');
	});
});
