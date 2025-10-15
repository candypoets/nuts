import { useRelayStatus } from '@candypoets/nipworker/hooks';
import { normalizeURL } from 'nostr-tools/utils';
import { proxyUrl } from 'src/lib/proxy';
import { writable, get } from 'svelte/store';

// NIP-11 relay information type
export type RelayInfo = {
	name?: string;
	description?: string;
	icon?: string;
	pubkey?: string;
	contact?: string;
	supported_nips?: number[];
	software?: string;
	version?: string;
};

// Svelte stores
export const relayInfos = writable<Map<string, RelayInfo>>(new Map());
export const relayStatusMap = writable<Map<string, string>>(new Map());

// Track fetch attempts to avoid duplicate requests
const fetchAttempts = new Set<string>();

function setRelayInfo(key: string, info: RelayInfo) {
	relayInfos.update((m) => {
		const n = new Map(m);
		n.set(key, info);
		return n;
	});
}

function setRelayStatus(key: string, status: string) {
	relayStatusMap.update((m) => {
		const n = new Map(m);
		n.set(key, status);
		return n;
	});
}

async function fetchRelayInfo(relayUrl: string): Promise<RelayInfo | null> {
	const key = normalizeURL(relayUrl);

	try {
		// Cache hit
		const cache = get(relayInfos);
		if (cache.has(key)) return cache.get(key) || null;

		// Debounce in-flight
		if (fetchAttempts.has(key)) return null;
		fetchAttempts.add(key);

		// Build candidates:
		// 1) same path with http(s)
		// 2) origin root
		// 3) well-known path
		const httpBase = key.replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'));
		const origin = new URL(httpBase).origin;

		const candidates = Array.from(
			new Set<string>([
				httpBase,
				new URL('/', httpBase).toString(),
				new URL('/.well-known/nostr/relay.json', origin).toString()
			])
		);

		for (const url of candidates) {
			const proxied = proxyUrl(url, 'resource');

			// Timeout controller
			const controller = new AbortController();
			const t = setTimeout(() => controller.abort(), 7000);

			try {
				const response = await fetch(proxied, {
					headers: {
						Accept: 'application/nostr+json, application/json'
					},
					signal: controller.signal
				});

				if (response.ok) {
					const relayInfo: RelayInfo = await response.json();
					setRelayInfo(key, relayInfo);
					return relayInfo;
				}
			} catch (_e) {
				// continue to next candidate
			} finally {
				clearTimeout(t);
			}
		}
	} catch (error) {
		console.log('Failed to fetch relay info for', relayUrl, error);
	} finally {
		fetchAttempts.delete(key);
	}

	// No permanent negative cache; allow retries later
	return null;
}

export function initRelayTracking() {
	useRelayStatus((status, url) => {
		const key = normalizeURL(url);
		console.log(key, status);
		setRelayStatus(key, status);
		fetchRelayInfo(key);
	});
}
