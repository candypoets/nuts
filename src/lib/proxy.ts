/**
 * Options for image resizing and optimization
 */
export interface ImageProxyOptions {
	width?: number;
	height?: number;
	quality?: number; // 1-100 for JPEG/WebP, 1-9 for PNG
	format?: 'webp' | 'jpeg' | 'png';
	fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

/**
 * Creates a proxied URL for external resources
 */
export function proxyUrl(
	originalUrl: string,
	type: 'image' | 'resource' = 'image',
	options?: ImageProxyOptions
): string {
	if (!originalUrl) return '';

	// Check if it's already a local URL, data URL, or blob URL
	if (
		originalUrl.startsWith('/') ||
		originalUrl.startsWith('data:') ||
		originalUrl.startsWith('blob:') ||
		(typeof window !== 'undefined' && originalUrl.startsWith(window.location.origin))
	) {
		return originalUrl;
	}

	// Build query parameters
	const params = new URLSearchParams();
	params.set('url', originalUrl);

	// Add image-specific parameters
	if (type === 'image' && options) {
		if (options.width) params.set('w', options.width.toString());
		if (options.height) params.set('h', options.height.toString());
		if (options.quality) params.set('q', options.quality.toString());
		if (options.format) params.set('f', options.format);
		if (options.fit) params.set('fit', options.fit);
	}

	// Use dedicated video proxy for better streaming
	const proxyType = type === 'image' ? 'image' : type === 'video' ? 'video' : 'resource';

	// Create proxied URL for external resources
	return `/api/proxy/${proxyType}?${params.toString()}`;
}

/**
 * Specifically for images - wrapper around proxyUrl for better semantics
 */
export function proxyImageUrl(imageUrl: string, options?: ImageProxyOptions): string {
	return proxyUrl(imageUrl, 'image', options);
}

/**
 * Specifically for videos - wrapper around proxyUrl for video streaming
 */
export function proxyVideoUrl(videoUrl: string): string {
	return proxyUrl(videoUrl, 'video');
}

/**
 * Common presets for different image use cases
 */
export const ImagePresets = {
	// Profile avatars - small, circular
	avatar: { quality: 50, format: 'webp' as const, fit: 'cover' as const },

	// Thumbnails for feeds
	thumbnail: {
		width: 400,
		height: 400,
		quality: 80,
		format: 'webp' as const,
		fit: 'cover' as const
	},

	// Medium size for cards/previews
	preview: { width: 800, height: 600, quality: 85, format: 'webp' as const, fit: 'cover' as const },

	// Full size but optimized
	full: { quality: 90 },

	// Banner images
	banner: { width: 1200, height: 400, quality: 85, format: 'webp' as const, fit: 'cover' as const }
};

/**
 * Quick helpers for common image sizes
 */
export function proxyAvatarUrl(imageUrl: string): string {
	return proxyImageUrl(imageUrl, ImagePresets.avatar);
}

export function proxyThumbnailUrl(imageUrl: string): string {
	return proxyImageUrl(imageUrl, ImagePresets.thumbnail);
}

export function proxyPreviewUrl(imageUrl: string): string {
	return proxyImageUrl(imageUrl, ImagePresets.preview);
}

export function proxyBannerUrl(imageUrl: string): string {
	return proxyImageUrl(imageUrl, ImagePresets.banner);
}

/**
 * Process an array of image/video links to use proxied URLs
 */
export function proxyMediaLinks(
	links: { src: string; type?: 'image' | 'video' }[],
	imageOptions?: ImageProxyOptions
): { src: string; type?: 'image' | 'video' }[] {
	return links.map((link) => ({
		...link,
		src:
			link.type === 'video'
				? proxyVideoUrl(link.src)
				: proxyImageUrl(link.src, imageOptions || ImagePresets.preview)
	}));
}
