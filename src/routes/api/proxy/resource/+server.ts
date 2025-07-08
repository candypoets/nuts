import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Cache for smaller resources only (not videos)
const resourceCache = new Map<
	string,
	{ data: ArrayBuffer; contentType: string; timestamp: number }
>();
const CACHE_TTL = 3600000; // 1 hour in milliseconds
const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB max for caching

export const GET: RequestHandler = async ({ url, setHeaders, request }) => {
	const targetUrl = url.searchParams.get('url');

	if (!targetUrl) {
		throw error(400, 'Missing url parameter');
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

	// Get range header for video streaming
	const range = request.headers.get('range');

	// Check cache first (only for small non-video resources)
	if (!range) {
		const cached = resourceCache.get(targetUrl);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			setHeaders({
				'Content-Type': cached.contentType,
				'Cache-Control': 'public, max-age=3600',
				'X-Cache': 'HIT'
			});
			return new Response(cached.data);
		}
	}

	try {
		// Prepare headers for the upstream request
		const fetchHeaders: HeadersInit = {
			'User-Agent': 'NutsCash/1.0'
		};

		// Forward Accept header for content negotiation (e.g., NIP-11)
		const acceptHeader = request.headers.get('accept');
		if (acceptHeader) {
			fetchHeaders['Accept'] = acceptHeader;
		}

		// Forward range header for video streaming
		if (range) {
			fetchHeaders['Range'] = range;
		}

		const response = await fetch(targetUrl, {
			headers: fetchHeaders,
			// Longer timeout for videos
			signal: AbortSignal.timeout(30000) // 30 seconds
		});

		if (!response.ok) {
			throw error(response.status, `Failed to fetch resource: ${response.statusText}`);
		}

		const contentType = response.headers.get('content-type') || 'application/octet-stream';

		// Allow common media types
		const allowedTypes = [
			'video/',
			'audio/',
			'image/',
			'application/pdf',
			'text/',
			'application/json',
			'application/nostr+json'
		];
		const isAllowed = allowedTypes.some((type) => contentType.startsWith(type));
		if (!isAllowed) {
			throw error(400, 'Resource type not allowed');
		}

		const isVideo = contentType.startsWith('video/');
		const contentLength = response.headers.get('content-length');
		const isLargeFile = contentLength && parseInt(contentLength) > MAX_CACHE_SIZE;

		// For videos or large files, stream directly without caching
		if (isVideo || isLargeFile || range) {
			// Set appropriate headers for streaming
			const responseHeaders: HeadersInit = {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=3600'
			};

			// Forward important headers for video streaming
			if (response.headers.get('content-length')) {
				responseHeaders['Content-Length'] = response.headers.get('content-length')!;
			}
			if (response.headers.get('content-range')) {
				responseHeaders['Content-Range'] = response.headers.get('content-range')!;
			}
			if (response.headers.get('accept-ranges')) {
				responseHeaders['Accept-Ranges'] = response.headers.get('accept-ranges')!;
			}

			setHeaders(responseHeaders);

			// Return the response body as a stream
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText
			});
		}

		// For small non-video resources, cache them
		const resourceBuffer = await response.arrayBuffer();

		// Cache only small resources
		if (resourceBuffer.byteLength <= MAX_CACHE_SIZE) {
			resourceCache.set(targetUrl, {
				data: resourceBuffer,
				contentType,
				timestamp: Date.now()
			});
		}

		setHeaders({
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=3600',
			'X-Cache': 'MISS'
		});

		return new Response(resourceBuffer);
	} catch (err) {
		console.error('Proxy error:', err);
		throw error(500, 'Failed to proxy resource');
	}
};
