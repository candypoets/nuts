import { normalizeURL } from 'nostr-tools/utils';
import { proxyUrl } from 'src/lib/proxy';

// NIP-11 relay information type
type RelayInfo = {
	name?: string;
	description?: string;
	icon?: string;
	pubkey?: string;
	contact?: string;
	supported_nips?: number[];
	software?: string;
	version?: string;
};

// Cache for relay info to prevent duplicate fetches
const relayInfoCache = new Map<string, RelayInfo>();

// Track fetch attempts to avoid duplicate requests
const fetchAttempts = new Set<string>();

async function fetchRelayInfo(relayUrl: string): Promise<RelayInfo | null> {
	try {
		// Normalize and convert websocket URL to HTTP URL
		const normalizedUrl = normalizeURL(relayUrl);

		// Check cache first
		if (relayInfoCache.has(normalizedUrl)) {
			return relayInfoCache.get(normalizedUrl) || null;
		}

		// Check if we're already fetching this relay
		if (fetchAttempts.has(normalizedUrl)) {
			return null;
		}

		fetchAttempts.add(normalizedUrl);

		const httpUrl = normalizedUrl.replace('wss://', 'https://').replace('ws://', 'http://');

		// Use proxy to handle CORP policy
		const proxyedUrl = proxyUrl(httpUrl, 'resource');

		const response = await fetch(proxyedUrl, {
			headers: {
				Accept: 'application/nostr+json'
			}
		});

		if (response.ok) {
			const relayInfo: RelayInfo = await response.json();
			// Cache the result
			relayInfoCache.set(normalizedUrl, relayInfo);
			return relayInfo;
		} else {
			console.warn('Failed to fetch relay info - HTTP', response.status, response.statusText);
		}
	} catch (error) {
		console.log('Failed to fetch relay info for', relayUrl, error);
	} finally {
		fetchAttempts.delete(normalizeURL(relayUrl));
	}

	// Cache empty result to prevent retry
	relayInfoCache.set(normalizeURL(relayUrl), {});
	return null;
}
