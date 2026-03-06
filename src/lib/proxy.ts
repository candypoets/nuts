/**
 * Options for image resizing and optimization
 * @deprecated No longer used - proxy functionality removed
 */
export interface ImageProxyOptions {
	width?: number;
	height?: number;
	quality?: number;
	format?: 'webp' | 'jpeg' | 'png';
	fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

/**
 * Returns the original URL without proxying
 * @deprecated Proxy functionality removed - returns original URL
 */
export function proxyUrl(originalUrl: string): string {
	return originalUrl || '';
}

/**
 * Returns the original image URL without proxying
 * @deprecated Proxy functionality removed - returns original URL
 */
export function proxyImageUrl(imageUrl: string): string {
	return imageUrl || '';
}

/**
 * Returns the original video URL without proxying
 * @deprecated Proxy functionality removed - returns original URL
 */
export function proxyVideoUrl(videoUrl: string): string {
	return videoUrl || '';
}

/**
 * Common presets - no longer used but kept for API compatibility
 * @deprecated No longer used
 */
export const ImagePresets = {
	avatar: {},
	thumbnail: {},
	preview: {},
	full: {},
	banner: {}
};

/**
 * Returns the original image URL without proxying
 * @deprecated Proxy functionality removed - returns original URL
 */
export function proxyAvatarUrl(imageUrl: string): string {
	return imageUrl || '';
}

/**
 * Returns the original image URL without proxying
 * @deprecated Proxy functionality removed - returns original URL
 */
export function proxyThumbnailUrl(imageUrl: string): string {
	return imageUrl || '';
}

/**
 * Returns the original image URL without proxying
 * @deprecated Proxy functionality removed - returns original URL
 */
export function proxyPreviewUrl(imageUrl: string): string {
	return imageUrl || '';
}

/**
 * Returns the original image URL without proxying
 * @deprecated Proxy functionality removed - returns original URL
 */
export function proxyBannerUrl(imageUrl: string): string {
	return imageUrl || '';
}

/**
 * Returns media links without modification
 * @deprecated Proxy functionality removed - returns original links
 */
export function proxyMediaLinks(
	links: { src: string; type?: 'image' | 'video' }[]
): { src: string; type?: 'image' | 'video' }[] {
	return links;
}
