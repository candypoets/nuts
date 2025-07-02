import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

	try {
		// Get range header for video streaming
		const range = request.headers.get('range');

		// Prepare headers for the upstream request
		const fetchHeaders: HeadersInit = {
			'User-Agent': 'NutsCash/1.0'
		};

		// Forward range header for video streaming
		if (range) {
			fetchHeaders['Range'] = range;
		}

		// Also forward other important headers
		const userAgent = request.headers.get('user-agent');
		if (userAgent) {
			fetchHeaders['User-Agent'] = `NutsCash/1.0 (${userAgent})`;
		}

		const response = await fetch(targetUrl, {
			headers: fetchHeaders,
			// Longer timeout for videos
			signal: AbortSignal.timeout(60000) // 60 seconds for large videos
		});

		if (!response.ok) {
			throw error(response.status, `Failed to fetch video: ${response.statusText}`);
		}

		const contentType = response.headers.get('content-type') || 'application/octet-stream';

		// Ensure it's actually a video
		if (!contentType.startsWith('video/')) {
			throw error(400, 'URL does not point to a video');
		}

		// Prepare response headers for video streaming
		const responseHeaders: HeadersInit = {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=3600',
			'Accept-Ranges': 'bytes'
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
		if (response.headers.get('last-modified')) {
			responseHeaders['Last-Modified'] = response.headers.get('last-modified')!;
		}
		if (response.headers.get('etag')) {
			responseHeaders['ETag'] = response.headers.get('etag')!;
		}

		setHeaders(responseHeaders);

		// Stream the video response
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText
		});

	} catch (err) {
		console.error('Video proxy error:', err);
		if (err instanceof Error && err.name === 'TimeoutError') {
			throw error(504, 'Video fetch timeout');
		}
		throw error(500, 'Failed to proxy video');
	}
};
