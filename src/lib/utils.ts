import { isEqual } from 'lodash';
import type { NostrEvent } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';

/**
 * Extract emoji information from event
 */
export function parseEmojiContent(
	event: NostrEvent
): { shortcode: string; url: string } | undefined {
	// Check if content is a shortcode format :emoji:
	const shortcodeMatch = event.content.match(/^:([a-zA-Z0-9_\-]+):$/);
	if (!shortcodeMatch) return undefined;

	const shortcode = shortcodeMatch[1];

	// Find matching emoji tag
	const emojiTag = event.tags.find(
		(tag) => tag[0] === 'emoji' && tag.length >= 3 && tag[1] === shortcode
	);

	if (emojiTag) {
		return {
			shortcode,
			url: emojiTag[2]
		};
	}

	return undefined;
}

export function areStringListEqual(list1: string[], list2: string[]): boolean {
	const sorted1 = [...list1].sort();
	const sorted2 = [...list2].sort();
	return isEqual(sorted1, sorted2);
}

export function normalizeMintURL(mintUrl: string) {
	return normalizeURL(mintUrl).replace(/\/$/, '');
}
