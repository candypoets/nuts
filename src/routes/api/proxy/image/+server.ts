import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import sharp from 'sharp';

// Enhanced cache that includes resize parameters in the key
const imageCache = new Map<string, { data: ArrayBuffer; contentType: string; timestamp: number }>();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

// Default image constraints
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const targetUrl = url.searchParams.get('url');
	const width = parseInt(url.searchParams.get('w') || '0') || undefined;
	const height = parseInt(url.searchParams.get('h') || '0') || undefined;
	const quality = parseInt(url.searchParams.get('q') || '85');
	const format = url.searchParams.get('f') as 'webp' | 'jpeg' | 'png' | undefined;
	const fit =
		(url.searchParams.get('fit') as 'cover' | 'contain' | 'fill' | 'inside' | 'outside') || 'cover';

	if (!targetUrl) {
		throw error(400, 'Missing url parameter');
	}

	// Create cache key that includes resize parameters
	const cacheKey = `${targetUrl}:${width || 'auto'}x${height || 'auto'}:${quality}:${
		format || 'auto'
	}:${fit}`;

	// Check cache first
	const cached = imageCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		setHeaders({
			'Content-Type': cached.contentType,
			'Cache-Control': 'public, max-age=3600',
			'X-Cache': 'HIT'
		});
		return new Response(cached.data);
	}

	// Validate the URL to prevent SSRF attacks
	try {
		const parsedUrl = new URL(targetUrl);
		if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
			throw error(400, 'Invalid URL protocol');
		}

		// Block internal/private IP ranges for security
		const hostname = parsedUrl.hostname;
		if (
			hostname === 'localhost' ||
			hostname.startsWith('127.') ||
			hostname.startsWith('10.') ||
			hostname.startsWith('192.168.') ||
			hostname.startsWith('172.')
		) {
			throw error(400, 'Access to internal IPs not allowed');
		}
	} catch {
		throw error(400, 'Invalid URL format');
	}

	try {
		const response = await fetch(targetUrl, {
			headers: {
				'User-Agent': 'NutsCash/1.0'
			},
			// Add timeout to prevent hanging requests
			signal: AbortSignal.timeout(15000) // 15 seconds for potentially large images
		});

		if (!response.ok) {
			throw error(response.status, `Failed to fetch image: ${response.statusText}`);
		}

		const contentType = response.headers.get('content-type');
		if (!contentType?.startsWith('image/')) {
			throw error(400, 'URL does not point to an image');
		}

		// Check file size before processing
		const contentLength = response.headers.get('content-length');
		if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
			throw error(413, 'Image too large');
		}

		const originalBuffer = await response.arrayBuffer();

		// Process image with Sharp
		let sharpInstance = sharp(originalBuffer);

		// Get image metadata
		const metadata = await sharpInstance.metadata();

		// Determine if resizing is needed
		const needsResize =
			(width && metadata.width && metadata.width > width) ||
			(height && metadata.height && metadata.height > height) ||
			(metadata.width && metadata.width > MAX_WIDTH) ||
			(metadata.height && metadata.height > MAX_HEIGHT);

		// Apply transformations
		if (needsResize || width || height) {
			const resizeWidth =
				width || (metadata.width && metadata.width > MAX_WIDTH ? MAX_WIDTH : undefined);
			const resizeHeight =
				height || (metadata.height && metadata.height > MAX_HEIGHT ? MAX_HEIGHT : undefined);

			sharpInstance = sharpInstance.resize(resizeWidth, resizeHeight, {
				fit: fit,
				withoutEnlargement: true
			});
		}

		// Apply format conversion and quality
		let outputFormat = format;
		let outputContentType = contentType;

		if (format === 'webp') {
			sharpInstance = sharpInstance.webp({ quality });
			outputContentType = 'image/webp';
		} else if (format === 'jpeg' || (!format && contentType === 'image/jpeg')) {
			sharpInstance = sharpInstance.jpeg({ quality });
			outputContentType = 'image/jpeg';
		} else if (format === 'png' || (!format && contentType === 'image/png')) {
			sharpInstance = sharpInstance.png({ quality: Math.round(quality / 10) }); // PNG quality is 0-9
			outputContentType = 'image/png';
		} else if (!format) {
			// Auto-optimize: convert to WebP for better compression if no format specified
			sharpInstance = sharpInstance.webp({ quality });
			outputContentType = 'image/webp';
		}

		const processedBuffer = await sharpInstance.toBuffer();

		// Cache the processed result
		imageCache.set(cacheKey, {
			data: processedBuffer,
			contentType: outputContentType,
			timestamp: Date.now()
		});

		setHeaders({
			'Content-Type': outputContentType,
			'Cache-Control': 'public, max-age=3600',
			'X-Cache': 'MISS',
			'X-Original-Size': originalBuffer.byteLength.toString(),
			'X-Processed-Size': processedBuffer.byteLength.toString()
		});

		return new Response(processedBuffer);
	} catch (err) {
		console.error('Proxy error:', err);
		if (
			err instanceof Error &&
			err.message.includes('Input buffer contains unsupported image format')
		) {
			throw error(400, 'Unsupported image format');
		}
		throw error(500, 'Failed to proxy image');
	}
};
