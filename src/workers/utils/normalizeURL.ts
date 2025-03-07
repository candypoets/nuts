// normalize websocket relay url, return null if localhost, or local ip address

/**
 * Normalizes a WebSocket relay URL and returns null if it's localhost or a local IP address.
 *
 * @param url The WebSocket relay URL to normalize
 * @returns The normalized URL, or null if the URL points to localhost or a local IP address
 */
export function normalizeURL(url: string): string | null {
	if (!url) return null;

	let normalizedUrl = url.trim();

	// Add wss:// prefix if no protocol is specified
	if (!normalizedUrl.startsWith('ws://') && !normalizedUrl.startsWith('wss://')) {
		normalizedUrl = `wss://${normalizedUrl}`;
	}

	try {
		const parsedUrl = new URL(normalizedUrl);
		const hostname = parsedUrl.hostname.toLowerCase();

		// Check for localhost
		if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
			return null;
		}

		// Check for local IP addresses
		if (
			hostname.startsWith('10.') ||
			hostname.startsWith('192.168.') ||
			hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
			hostname === '0.0.0.0' ||
			hostname.startsWith('169.254.') || // Link-local addresses
			hostname.startsWith('fd') || // IPv6 local addresses
			hostname.startsWith('fe80:') // IPv6 link-local
		) {
			return null;
		}

		// Remove trailing slash
		if (normalizedUrl.endsWith('/')) {
			normalizedUrl = normalizedUrl.slice(0, -1);
		}

		// Ensure consistent port representation
		if (
			(parsedUrl.protocol === 'ws:' && parsedUrl.port === '80') ||
			(parsedUrl.protocol === 'wss:' && parsedUrl.port === '443')
		) {
			// Remove default ports
			const portSuffix = `:${parsedUrl.port}`;
			if (normalizedUrl.includes(portSuffix)) {
				normalizedUrl = normalizedUrl.replace(portSuffix, '');
			}
		}

		return normalizedUrl;
	} catch (error) {
		// If URL parsing fails, return null
		return null;
	}
}
