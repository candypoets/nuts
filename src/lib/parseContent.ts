import { nip19, nip27, type AddressPointer, type EventPointer, type ProfilePointer } from 'nostr-tools';
import { marked } from 'marked';

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

// Placeholder for markdown links to protect them from NIP-27 URL extraction
const MARKDOWN_LINK_PLACEHOLDER = '\x00LINK\x00';

/**
 * Parse content using NIP-27 to extract references, URLs, images, videos
 * Then apply additional parsing for code blocks, cashu, hashtags
 * 
 * This function protects markdown links `[text](url)` from being broken by NIP-27
 * URL extraction. Markdown links are preserved and will be rendered correctly
 * when passed through renderMarkdown().
 */
export async function parseContent(content: string): Promise<ContentBlock[]> {
	const blocks: ContentBlock[] = [];

	// Step 1: Extract and protect markdown links `[text](url)`
	// We replace them with placeholders, then restore after NIP-27 parsing
	const markdownLinks: Array<{ text: string; url: string; fullMatch: string }> = [];
	let protectedContent = content.replace(
		/\[([^\]]+)\]\(([^)]+)\)/g,
		(match, linkText, url) => {
			markdownLinks.push({ text: linkText, url, fullMatch: match });
			return MARKDOWN_LINK_PLACEHOLDER;
		}
	);

	// Step 2: Use NIP-27 to parse the protected content
	const nip27Blocks = Array.from(nip27.parse(protectedContent));

	let linkIndex = 0;
	for (const block of nip27Blocks) {
		switch (block.type) {
			case 'text': {
				// Restore markdown links within text blocks
				const textWithLinks = restoreMarkdownLinks(block.text, markdownLinks, linkIndex);
				linkIndex = textWithLinks.newIndex;

				// Parse the restored text for code blocks, cashu, hashtags
				const textBlocks = await parseTextBlock(textWithLinks.text);
				blocks.push(...textBlocks);
				break;
			}
			case 'reference': {
				// Nostr reference (npub, nprofile, note, nevent, naddr)
				const refBlock = parseReferenceBlock(block.pointer);
				if (refBlock) {
					blocks.push(refBlock);
				}
				break;
			}
			case 'url': {
				// Skip URLs that were part of markdown links (they were replaced with placeholder)
				if (block.url !== MARKDOWN_LINK_PLACEHOLDER) {
					blocks.push({
						type: 'link',
						text: block.url,
						data: { href: block.url }
					});
				}
				break;
			}
			case 'image': {
				blocks.push({
					type: 'image',
					text: block.url,
					data: { src: block.url }
				});
				break;
			}
			case 'video': {
				blocks.push({
					type: 'video',
					text: block.url,
					data: { src: block.url }
				});
				break;
			}
			case 'audio': {
				// Treat audio as link for now
				blocks.push({
					type: 'link',
					text: block.url,
					data: { href: block.url }
				});
				break;
			}
			case 'relay': {
				// Treat relay as link for now
				blocks.push({
					type: 'link',
					text: block.url,
					data: { href: block.url }
				});
				break;
			}
		}
	}

	// Post-processing: group consecutive media into grids
	return groupMediaIntoGrids(blocks);
}

/**
 * Restore markdown links from placeholders in text
 */
function restoreMarkdownLinks(
	text: string,
	links: Array<{ text: string; url: string; fullMatch: string }>,
	startIndex: number
): { text: string; newIndex: number } {
	let result = text;
	let currentIndex = startIndex;
	let replacedCount = 0;

	// Replace each placeholder with the actual markdown link
	while (result.includes(MARKDOWN_LINK_PLACEHOLDER) && currentIndex < links.length) {
		const link = links[currentIndex];
		result = result.replace(MARKDOWN_LINK_PLACEHOLDER, link.fullMatch);
		currentIndex++;
		replacedCount++;
	}

	return { text: result, newIndex: currentIndex };
}

/**
 * Parse a text block for code blocks, cashu tokens, and hashtags
 */
async function parseTextBlock(text: string): Promise<ContentBlock[]> {
	const blocks: ContentBlock[] = [];

	// Define patterns to match within text
	const patterns = [
		{
			type: 'code' as const,
			regex: /```([\s\S]*?)```/g,
			processMatch: (match: RegExpExecArray) => ({
				type: 'code' as const,
				text: match[0],
				data: { code: match[1] }
			})
		},
		{
			type: 'cashu' as const,
			regex: /(cashuA[A-Za-z0-9_-]+)/g,
			processMatch: (match: RegExpExecArray) => ({
				type: 'cashu' as const,
				text: match[0],
				data: { token: match[0] }
			})
		},
		{
			type: 'hashtag' as const,
			// Match hashtags that are not part of a URL
			regex: /(?<![^\s"'(])(#[a-zA-Z0-9_]+)(?![a-zA-Z0-9_])/g,
			processMatch: (match: RegExpExecArray) => ({
				type: 'hashtag' as const,
				text: match[0],
				data: { tag: match[0].substring(1) }
			})
		}
	];

	// Find all matches with their positions
	const allMatches: Array<{
		start: number;
		end: number;
		block: ContentBlock;
	}> = [];

	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		pattern.regex.lastIndex = 0;

		while ((match = pattern.regex.exec(text)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			const block = pattern.processMatch(match);
			allMatches.push({ start, end, block });
		}
	}

	// Sort matches by start position
	allMatches.sort((a, b) => a.start - b.start);

	// Remove overlapping matches
	const filteredMatches: typeof allMatches = [];
	for (const match of allMatches) {
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

	// Build the final result
	let lastIndex = 0;
	for (const { start, end, block } of filteredMatches) {
		// Add text before this match
		if (start > lastIndex) {
			blocks.push({
				type: 'text',
				text: text.substring(lastIndex, start)
			});
		}
		blocks.push(block);
		lastIndex = end;
	}

	// Add any remaining text
	if (lastIndex < text.length) {
		blocks.push({
			type: 'text',
			text: text.substring(lastIndex)
		});
	}

	// If no matches, return the whole text
	if (blocks.length === 0 && text) {
		blocks.push({ type: 'text', text });
	}

	return blocks;
}

/**
 * Parse a NIP-27 reference into a ContentBlock
 */
function parseReferenceBlock(
	pointer: ProfilePointer | AddressPointer | EventPointer
): ContentBlock | null {
	try {
		// Determine the type of reference
		if ('pubkey' in pointer && !('identifier' in pointer)) {
			// nprofile or npub
			const bech32 = nip19.npubEncode(pointer.pubkey);
			return {
				type: 'npub',
				text: `nostr:${bech32}`,
				data: {
					decoded: pointer,
					bech32
				}
			};
		} else if ('identifier' in pointer) {
			// naddr
			const addrPointer = pointer as AddressPointer;
			const bech32 = nip19.naddrEncode({
				kind: addrPointer.kind,
				pubkey: addrPointer.pubkey,
				identifier: addrPointer.identifier,
				relays: addrPointer.relays
			});
			return {
				type: 'naddr',
				text: `nostr:${bech32}`,
				data: {
					decoded: pointer,
					bech32
				}
			};
		} else if ('id' in pointer) {
			// nevent or note
			const eventPointer = pointer as EventPointer;
			const bech32 = nip19.noteEncode(eventPointer.id);
			return {
				type: 'note',
				text: `nostr:${bech32}`,
				data: {
					decoded: pointer,
					bech32
				}
			};
		}
	} catch (e) {
		console.error('Failed to parse reference:', e);
	}
	return null;
}

/**
 * Group consecutive media blocks into grids
 */
function groupMediaIntoGrids(blocks: ContentBlock[]): ContentBlock[] {
	const processedBlocks: ContentBlock[] = [];
	let mediaGroup: ContentBlock[] = [];

	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];

		if (block.type === 'image' || block.type === 'video') {
			mediaGroup.push(block);
			continue;
		}

		// If this is whitespace between media, check what follows
		if (block.type === 'text' && /^\s+$/.test(block.text)) {
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
			mediaGroup = [];
		}

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

/**
 * Render markdown text to HTML using marked
 * This should be used for text blocks in articles (kind 30023)
 */
export function renderMarkdown(content: string): string {
	return marked.parse(content, {
		breaks: true, // Convert \n to <br>
		gfm: true, // GitHub Flavored Markdown
		async: false // Return string synchronously
	}) as string;
}
