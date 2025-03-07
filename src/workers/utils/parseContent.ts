import { nip19 } from 'nostr-tools';
import { getLinkPreview } from 'link-preview-js';

export type ContentBlock = {
	type:
		| 'text'
		| 'image'
		| 'video'
		| 'mediaGrid'
		| 'code'
		| 'link'
		| 'npub'
		| 'nprofile'
		| 'note'
		| 'nevent'
		| 'naddr'
		| 'hashtag'
		| 'cashu';
	text: string;
	data?: Record<string, any>;
};

export async function parseContent(content: string): Promise<ContentBlock[]> {
	const blocks: ContentBlock[] = [];

	// Define all the patterns we want to match
	const patterns = [
		{
			type: 'code',
			regex: /```([\s\S]*?)```/g,
			processMatch: (match: RegExpExecArray) => ({
				type: 'code' as const,
				text: match[0],
				data: { code: match[1] }
			})
		},
		{
			type: 'cashu',
			regex: /(cashuA[A-Za-z0-9_-]+)/g,
			processMatch: (match: RegExpExecArray) => ({
				type: 'cashu' as const,
				text: match[0],
				data: { token: match[0] }
			})
		},
		{
			type: 'hashtag',
			// Match hashtags that are not part of a URL
			regex: /(?<![^\s"'(])(#[a-zA-Z0-9_]+)(?![a-zA-Z0-9_])/g,
			processMatch: (match: RegExpExecArray) => ({
				type: 'hashtag' as const,
				text: match[0],
				data: { tag: match[0].substring(1) } // Remove the # symbol
			})
		},
		{
			type: 'image',
			regex: /(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|svg|ico)(?:\?\S*)?)/gi,
			processMatch: (match: RegExpExecArray) => ({
				type: 'image' as const,
				text: match[0],
				data: { src: match[0] }
			})
		},
		{
			type: 'video',
			regex: /(https?:\/\/\S+\.(?:mp4|mov|avi|mkv|webm|m4v)(?:\?\S*)?)/gi,
			processMatch: (match: RegExpExecArray) => ({
				type: 'video' as const,
				text: match[0],
				data: { src: match[0] }
			})
		},
		{
			type: 'nostr',
			regex: /nostr:([a-z0-9]+)/gi,
			processMatch: (match: RegExpExecArray) => {
				const entity = match[1];
				try {
					const decoded = nip19.decode(entity);
					const type = decoded.type as 'npub' | 'nprofile' | 'note' | 'nevent' | 'naddr';

					return {
						type,
						text: match[0],
						data: {
							decoded: decoded.data,
							bech32: entity
						}
					};
				} catch (e) {
					// If we can't decode, treat as text
					return {
						type: 'text' as const,
						text: match[0]
					};
				}
			}
		},
		{
			type: 'link',
			regex: /(https?:\/\/\S+)(?![\)])/gi,
			processMatch: async (match: RegExpExecArray) => {
				const preview = await getLinkPreview(
					'https://proxy.nuts.cash/?url=' +
						(match[0]?.startsWith('http') ? match[0] : 'https://' + match[0])
				);
				return {
					type: 'link' as const,
					text: match[0],
					data: { href: match[0], preview }
				};
			}
		}
	];

	// Find all matches with their positions
	const allMatches: Array<{
		start: number;
		end: number;
		block: ContentBlock;
	}> = [];

	// First, find all matches for all patterns
	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		pattern.regex.lastIndex = 0;

		while ((match = pattern.regex.exec(content)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			const block = await pattern.processMatch(match);

			allMatches.push({ start, end, block });
		}
	}

	// Sort matches by start position
	allMatches.sort((a, b) => a.start - b.start);

	// Remove overlapping matches (prioritize earlier patterns in the array)
	const filteredMatches: typeof allMatches = [];

	for (const match of allMatches) {
		// Check if this match overlaps with any already accepted match
		const overlaps = filteredMatches.some(
			(existing) =>
				(match.start >= existing.start && match.start < existing.end) ||
				(match.end > existing.start && match.end <= existing.end) ||
				(match.start <= existing.start && match.end >= existing.end)
		);

		if (!overlaps) {
			filteredMatches.push(match);
		}
	}

	// Re-sort filtered matches
	filteredMatches.sort((a, b) => a.start - b.start);

	// Build the final result, including text between matches
	let lastIndex = 0;

	for (const { start, end, block } of filteredMatches) {
		// Add text before this match
		if (start > lastIndex) {
			blocks.push({
				type: 'text',
				text: content.substring(lastIndex, start)
			});
		}

		// Add the match
		blocks.push(block);

		lastIndex = end;
	}

	// Add any remaining text after the last match
	if (lastIndex < content.length) {
		blocks.push({
			type: 'text',
			text: content.substring(lastIndex)
		});
	}

	// Post-processing: group consecutive media into grids
	const processedBlocks: ContentBlock[] = [];
	let mediaGroup: ContentBlock[] = [];

	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];

		// If this is an image or video
		if (block.type === 'image' || block.type === 'video') {
			mediaGroup.push(block);
			continue;
		}

		// If this is whitespace or newlines between media, check what follows
		if (block.type === 'text' && /^\s+$/.test(block.text)) {
			// If we have media before and media after, continue collecting
			if (
				mediaGroup.length > 0 &&
				i + 1 < blocks.length &&
				(blocks[i + 1].type === 'image' || blocks[i + 1].type === 'video')
			) {
				continue;
			}
		}

		// If we have collected media and the current block breaks the sequence
		if (mediaGroup.length > 0) {
			// Add media group if it contains more than one item
			if (mediaGroup.length > 1) {
				processedBlocks.push({
					type: 'mediaGrid',
					text: mediaGroup.map((m) => m.text).join('\n'),
					data: {
						items: mediaGroup.map((m) => ({
							type: m.type,
							src: m.data?.src
						}))
					}
				});
			} else {
				// Just add the single media item
				processedBlocks.push(mediaGroup[0]);
			}
			mediaGroup = [];
		}

		// Add the current non-media block
		processedBlocks.push(block);
	}

	// Don't forget any remaining media
	if (mediaGroup.length > 0) {
		if (mediaGroup.length > 1) {
			processedBlocks.push({
				type: 'mediaGrid',
				text: mediaGroup.map((m) => m.text).join('\n'),
				data: {
					items: mediaGroup.map((m) => ({
						type: m.type,
						src: m.data?.src
					}))
				}
			});
		} else {
			processedBlocks.push(mediaGroup[0]);
		}
	}

	return processedBlocks;
}
