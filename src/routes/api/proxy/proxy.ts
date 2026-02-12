import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { Pool } from 'node:undici';

// Connection pool for media proxy - reused across requests
let mediaProxyPool: Pool | null = null;
let poolProxyUrl: string | null = null;

function getProxyPool(proxyUrl: string): Pool {
	// Use 127.0.0.1 to avoid IPv6 fallback delays
	const targetUrl = proxyUrl.replace('localhost', '127.0.0.1');
	
	// Create new pool if URL changed or pool doesn't exist
	if (!mediaProxyPool || poolProxyUrl !== targetUrl) {
		// Close existing pool if URL changed
		if (mediaProxyPool && poolProxyUrl !== targetUrl) {
			mediaProxyPool.close().catch(() => {});
		}
		
		poolProxyUrl = targetUrl;
		mediaProxyPool = new Pool(targetUrl, {
			connections: 50,           // Max concurrent connections
			keepAliveTimeout: 30000,   // Keep connections alive for 30s
			keepAliveMaxTimeout: 60000,
			pipelining: 10             // Allow request pipelining
		});
	}
	
	return mediaProxyPool;
}

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

	let targetPath: string;
	try {
		// Build just the path and query for the pool request
		const tempUrl = new URL(endpoint + url.search, 'http://localhost');
		targetPath = tempUrl.pathname + tempUrl.search;
	} catch (err) {
		throw error(500, `Invalid URL construction: ${err.message}`);
	}

	try {
		const pool = getProxyPool(proxyUrl);
		
		const response = await pool.request({
			path: targetPath,
			method: request.method,
			headers: Object.fromEntries(request.headers),
			signal: AbortSignal.timeout(30000)
		});

		// Convert undici response to web standard Response
		const body = response.body;
		const headers = new Headers();
		
		for (const [key, value] of Object.entries(response.headers)) {
			if (value !== undefined) {
				headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
			}
		}

		return new Response(body as ReadableStream, {
			status: response.statusCode,
			statusText: response.statusMessage,
			headers
		});
	} catch (err) {
		console.error('Proxy error:', err);
		throw error(500, 'Failed to proxy request');
	}
}
