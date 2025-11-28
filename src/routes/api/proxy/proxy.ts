import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function proxyRequest({ url, request }: RequestEvent): Promise<Response> {
	let proxyUrl = process.env.MEDIA_PROXY_URL;
	if (!proxyUrl) {
		throw error(500, 'MEDIA_PROXY_URL not set');
	}

	// Ensure the proxy URL has a protocol
	if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
		proxyUrl = 'http://' + proxyUrl;
	}

	// Extract the actual URL to proxy from the query parameters
	const urlParam = url.searchParams.get('url');
	if (!urlParam) {
		throw error(400, 'Missing url parameter');
	}

	// Construct the target URL for the media proxy
	// Remove /api/proxy from the pathname to get the endpoint (e.g., /image)
	const endpoint = url.pathname;

	let targetUrl: URL;
	try {
		// Build the full target URL
		targetUrl = new URL(endpoint + url.search, proxyUrl);
	} catch (err) {
		throw error(500, `Invalid URL construction: ${err.message}`);
	}

	try {
		const response = await fetch(targetUrl, {
			method: request.method,
			headers: request.headers,
			body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
			signal: AbortSignal.timeout(30000) // 30 seconds timeout
		});

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	} catch (err) {
		throw error(500, 'Failed to proxy request');
	}
}
