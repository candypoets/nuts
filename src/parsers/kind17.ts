import type { NostrEvent } from 'nostr-tools';
import { parseEmojiContent } from './utils';
import { ReactionType, type Kind7Parsed } from './kind7';

export type Kind17Parsed = Kind7Parsed;

export const parseKind17 = async (event: NostrEvent): Promise<Kind17Parsed | null> => {
	const rTag = event.tags.find((tag) => tag[0] === 'r' && tag.length >= 2);
	if (!rTag) return null; // Kind 17 must have an r tag

	return {
		type:
			event.content === '+'
				? ReactionType.LIKE
				: event.content === '-'
					? ReactionType.DISLIKE
					: event.content.startsWith(':')
						? ReactionType.EMOJI
						: ReactionType.CUSTOM,
		eventId: '', // No event ID for website reactions
		pubkey: '', // No pubkey for website reactions
		emoji: parseEmojiContent(event)
	};
};
