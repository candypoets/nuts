import type { NostrEvent } from 'nostr-tools';
import { parseEmojiContent } from './utils';

export enum ReactionType {
	LIKE = '+',
	DISLIKE = '-',
	EMOJI = 'emoji',
	CUSTOM = 'custom'
}

export type Kind7Parsed = {
	type: ReactionType;
	eventId: string; // The id of the event being reacted to
	pubkey: string; // The pubkey of the author of the reacted event
	eventKind?: number; // The kind of the event being reacted to (from k tag)
	emoji?: {
		shortcode: string;
		url: string;
	};
	targetCoordinates?: string; // For addressable events (from a tag)
};

export const parseKind7 = async (event: NostrEvent): Promise<Kind7Parsed | null> => {
	// Find the e tag for the target event (should be the last one if multiple)
	const eTags = event.tags.filter((tag) => tag[0] === 'e' && tag.length >= 2);
	if (eTags.length === 0) return null; // Must have at least one e tag

	const targetEvent = eTags[eTags.length - 1];
	const eventId = targetEvent[1];

	// Find pubkey tag (last p tag)
	const pTags = event.tags.filter((tag) => tag[0] === 'p' && tag.length >= 2);
	const pubkey = pTags.length > 0 ? pTags[pTags.length - 1][1] : '';

	// Find kind tag
	const kTag = event.tags.find((tag) => tag[0] === 'k' && tag.length >= 2);
	const eventKind = kTag ? parseInt(kTag[1], 10) : undefined;

	// Find addressable coordinates
	const aTag = event.tags.find((tag) => tag[0] === 'a' && tag.length >= 2);
	const targetCoordinates = aTag ? aTag[1] : undefined;

	// Parse reaction type
	let type: ReactionType;
	if (event.content === '+' || event.content === '') {
		type = ReactionType.LIKE;
	} else if (event.content === '-') {
		type = ReactionType.DISLIKE;
	} else if (event.content.startsWith(':') && event.content.endsWith(':')) {
		type = ReactionType.EMOJI;
	} else {
		type = ReactionType.CUSTOM;
	}

	// Parse emoji if present
	const emoji = parseEmojiContent(event);

	return {
		type,
		eventId,
		pubkey,
		eventKind,
		targetCoordinates,
		emoji
	};
};
