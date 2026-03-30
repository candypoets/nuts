import { prepare, layout } from '@chenglou/pretext';
import {
	ContentBlock,
	ContentData,
	type Kind1Parsed,
	type ParsedEvent
} from '@candypoets/nipworker';
import {
	asKind1,
	asImageData,
	asVideoData,
	asMediaGroupData,
	fbArray,
	asNostrData,
	asLinkPreview
} from '@candypoets/nipworker/utils';

// Fixed layout constants (in pixels)
export const LAYOUT = {
	headerHeight: 60, // Avatar + name + time
	footerHeight: 50, // Action buttons
	textLineHeight: 20, // Text line height
	maxImageHeight: 384, // max-h-96
	imageGridHeight: 192, // h-48
	defaultImageHeight: 0, // Uses square aspect ratio (container width)
	defaultVideoHeight: 384, // Default video height when no dim
	quoteEstimateHeight: 100, // Initial estimate for quote notes
	linkPreviewHeight: 100, // Link preview card
	skeletonHeight: 96 // Fixed skeleton/loading state height (header + 2 content lines)
} as const;

// Composite ID for note height tracking
// Format: baseId:hasRoot:hasReplies:depth
export function getNoteCompositeId(
	noteId: string,
	hasRoot: boolean,
	hasReplies: boolean,
	depth: number
): string {
	return `${noteId}:${hasRoot}:${hasReplies}:${depth}`;
}

// Font settings (must match CSS)
const FONT = '16px Inter, system-ui, sans-serif';

// Cache for prepared text (performance optimization)
const textCache = new Map<string, ReturnType<typeof prepare>>();

// Clear text cache (call when window resized or font changes)
export function clearTextCache() {
	textCache.clear();
}

/**
 * Calculate feed content width based on viewport and depth
 */
export function getContentWidth(viewportWidth: number, depth: number = 0): number {
	// Match CSS breakpoints and widths
	let baseWidth: number;

	if (viewportWidth >= 1280) {
		baseWidth = 31.5 * 16; // 31.5rem in px (assuming 16px base)
	} else if (viewportWidth >= 1024) {
		baseWidth = 50 * 16; // 50rem
	} else if (viewportWidth >= 768) {
		baseWidth = 40 * 16; // 40rem
	} else if (viewportWidth >= 640) {
		baseWidth = 30 * 16; // 30rem
	} else {
		baseWidth = viewportWidth - 32; // Full width minus padding
	}

	// Account for depth indentation
	const depthOffset = depth * 32; // var(--depth-offset) roughly
	const postOffset = depth > 0 ? 32 : 0; // var(--post-offset)

	return Math.max(baseWidth - depthOffset - postOffset - 32, 200); // Min 200px
}

/**
 * Calculate text block height using Pretext
 */
export function calculateTextHeight(
	text: string,
	maxWidth: number,
	lineHeight: number = LAYOUT.textLineHeight
): number {
	if (!text || text.trim().length === 0) return 0;

	// Normalize whitespace like CSS white-space: normal
	const normalizedText = text.replace(/\s+/g, ' ').trim();

	// Check cache
	const cacheKey = `${normalizedText}|${maxWidth}`;
	let prepared = textCache.get(cacheKey);

	if (!prepared) {
		prepared = prepare(normalizedText, FONT);
		textCache.set(cacheKey, prepared);
	}

	const { height, lineCount } = layout(prepared, maxWidth, lineHeight);
	return height;
}

/**
 * Parse dimension string "1920x1080" into numbers
 */
function parseDim(dim: string | null | undefined): { width: number; height: number } | null {
	if (!dim) return null;
	const [w, h] = dim.split('x').map(Number);
	if (!w || !h || isNaN(w) || isNaN(h)) return null;
	return { width: w, height: h };
}

/**
 * Calculate image height respecting aspect ratio and max height
 */
export function calculateImageHeight(
	dim: string | null | undefined,
	containerWidth: number,
	isGrid: boolean = false,
	gridColumns: number = 1
): number {
	if (isGrid) {
		// Multiple images: fixed grid height
		return LAYOUT.imageGridHeight;
	}

	const parsed = parseDim(dim);
	if (!parsed) {
		// No dimensions: use square aspect ratio (1:1)
		return Math.min(containerWidth, LAYOUT.maxImageHeight);
	}

	const { width: imgWidth, height: imgHeight } = parsed;

	// If image is wider than container, scale proportionally
	if (imgWidth > containerWidth) {
		const scaledHeight = (imgHeight * containerWidth) / imgWidth;
		return Math.min(scaledHeight, LAYOUT.maxImageHeight);
	}

	// Otherwise use original height, capped at max
	return Math.min(imgHeight, LAYOUT.maxImageHeight);
}

/**
 * Calculate video height respecting aspect ratio
 */
export function calculateVideoHeight(
	dim: string | null | undefined,
	containerWidth: number
): number {
	const parsed = parseDim(dim);
	if (!parsed) {
		// No dimensions: default height
		return LAYOUT.defaultVideoHeight;
	}

	const { width: vidWidth, height: vidHeight } = parsed;

	// Scale proportionally if needed
	if (vidWidth > containerWidth) {
		const scaledHeight = (vidHeight * containerWidth) / vidWidth;
		return Math.min(scaledHeight, LAYOUT.maxImageHeight);
	}

	return Math.min(vidHeight, LAYOUT.maxImageHeight);
}

/**
 * Calculate media group (multiple images/videos) height
 */
export function calculateMediaGroupHeight(itemCount: number): number {
	if (itemCount <= 1) return LAYOUT.maxImageHeight;

	const columns = Math.ceil(Math.sqrt(itemCount));
	const rows = Math.ceil(itemCount / columns);
	return rows * LAYOUT.imageGridHeight;
}

/**
 * Content block height result
 */
export interface ContentBlockHeight {
	type: 'text' | 'image' | 'video' | 'mediaGroup' | 'quote' | 'link' | 'other';
	height: number;
	// For quotes: the quoted note ID
	quoteId?: string;
	// Whether this height is an estimate (will be updated)
	isEstimate: boolean;
}

/**
 * Calculate height for a single content block
 */
export function calculateBlockHeight(
	block: ContentBlock,
	containerWidth: number
): ContentBlockHeight {
	const blockType = block.type();
	const dataType = block.dataType();

	// Text block
	if (blockType === 'text') {
		const text = block.text() || '';
		// Account for HTML line breaks in text
		const lines = text.split(/\r\n|\r|\n/);
		let totalHeight = 0;
		for (const line of lines) {
			totalHeight += calculateTextHeight(line, containerWidth, LAYOUT.textLineHeight);
		}
		// Add spacing between lines
		totalHeight += (lines.length - 1) * 4;

		return { type: 'text', height: totalHeight, isEstimate: false };
	}

	// Image
	if (dataType === ContentData.ImageData) {
		const imageData = asImageData(block);
		const dim = imageData?.dim?.() || null;
		const height = calculateImageHeight(dim, containerWidth, false);
		return { type: 'image', height, isEstimate: false };
	}

	// Video
	if (dataType === ContentData.VideoData) {
		const videoData = asVideoData(block);
		const dim = videoData?.dim?.() || null;
		const height = calculateVideoHeight(dim, containerWidth);
		return { type: 'video', height, isEstimate: false };
	}

	// Media group (multiple images/videos)
	if (dataType === ContentData.MediaGroupData) {
		const mediaGroup = asMediaGroupData(block);
		if (mediaGroup) {
			const items = fbArray(mediaGroup, 'items') || [];
			const height = calculateMediaGroupHeight(items.length);
			return { type: 'mediaGroup', height, isEstimate: false };
		}
	}

	// Quote note (NostrData referencing another note)
	if (dataType === ContentData.NostrData) {
		const nostrData = asNostrData(block);
		const id = nostrData?.id?.() || nostrData?.entity?.();
		// if (id) {
		// 	const childHeight = getQuoteHeight?.(id);
		// 	if (childHeight) {
		// 		return { type: 'quote', height: childHeight, quoteId: id, isEstimate: false };
		// 	}
		// }
		// Estimate until child loads
		// return { type: 'quote', height: LAYOUT.quoteEstimateHeight, quoteId: id, isEstimate: true };
	}

	// Link preview (YouTube or regular link)
	if (dataType === ContentData.LinkPreviewData) {
		const preview = asLinkPreview(block);
		const url = preview?.url?.();
		if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
			// YouTube embeds are 16:9 aspect ratio (56.25% of width)
			const ytHeight = (containerWidth * 9) / 16;
			return { type: 'link', height: ytHeight, isEstimate: false };
		}
		// Regular link is just text
		return { type: 'link', height: 0, isEstimate: false };
	}

	// Other blocks (hashtags, cashu, etc.) - minimal height
	return { type: 'other', height: 0, isEstimate: false };
}

/**
 * Full note height calculation result
 */
export interface NoteHeightResult {
	totalHeight: number;
	blocks: ContentBlockHeight[];
}

/**
 * Calculate total note height from content blocks
 */
export function calculateNoteHeight(
	content: ContentBlock[],
	containerWidth: number,
	depth: number = 0
): NoteHeightResult {
	// Adjust width for depth indentation
	const adjustedWidth = getContentWidth(containerWidth, depth);

	let totalHeight = LAYOUT.headerHeight; // Start with header
	const blocks: ContentBlockHeight[] = [];

	// Calculate each content block
	for (const block of content) {
		const blockHeight = calculateBlockHeight(block, adjustedWidth);
		blocks.push(blockHeight);
		totalHeight += blockHeight.height;
	}

	// Add footer
	totalHeight += LAYOUT.footerHeight;

	return { totalHeight, blocks };
}

/**
 * Quick height estimate for initial render (no Pretext calculation)
 */
export function estimateNoteHeight(note: ParsedEvent): number {
	const kind1 = asKind1(note);
	if (!kind1) return 200;

	const parsedContent = fbArray(kind1, 'parsedContent') || [];

	let contentEstimate = 0;
	for (const block of parsedContent) {
		const dataType = block.dataType();
		const text = block.text?.() || '';

		if (block.type() === 'text') {
			// Rough estimate: ~50 chars per line, 20px per line
			const lines = Math.ceil(text.length / 50);
			contentEstimate += lines * LAYOUT.textLineHeight;
		} else if (dataType === ContentData.ImageData || dataType === ContentData.VideoData) {
			contentEstimate += LAYOUT.defaultImageHeight;
		} else if (dataType === ContentData.MediaGroupData) {
			const mediaGroup = asMediaGroupData(block);
			const items = fbArray(mediaGroup, 'items') || [];
			contentEstimate += calculateMediaGroupHeight(items.length);
		} else if (dataType === ContentData.NostrData) {
			contentEstimate += LAYOUT.quoteEstimateHeight;
		}
	}

	return LAYOUT.headerHeight + contentEstimate + LAYOUT.footerHeight;
}
