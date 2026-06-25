import { useRelayStatus } from '@candypoets/nipworker/hooks';
import { normalizeURL } from 'nostr-tools/utils';
import { writable, get, type Readable, readable } from 'svelte/store';

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

// Per-key selector helper that only emits when the selected key's value actually changes
export function selectMapKey<K, V>(mapStore: Readable<Map<K, V>>, key: K): Readable<V | undefined> {
	return readable<V | undefined>(undefined, (set) => {
		let prev: V | undefined;
		const unsubscribe = mapStore.subscribe((m) => {
			const next = m.get(key);
			if (next !== prev) {
				prev = next;
				set(next);
			}
		});
		return unsubscribe;
	});
}

// Svelte stores
export const relayInfos = writable<Map<string, RelayInfo>>(new Map());
export const relayStatusMap = writable<Map<string, string>>(new Map());
export const relaySubs = writable<Map<string, string[]>>(new Map());

// Track fetch attempts to avoid duplicate requests
const fetchAttempts = new Set<string>();
// Track failed fetches to avoid retrying too often (simple negative cache)
const fetchFailures = new Map<string, number>();

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

export function setSubRelays(subId: string, relays: string[]) {
	relaySubs.update((m) => {
		const n = new Map(m);
		n.set(subId, relays);
		return n;
	});
}

// Per-key selector; emits only when that key's value actually changes
export function relaySub(sub: string): Readable<string[] | undefined> {
	return selectMapKey(relaySubs, sub);
}

export async function fetchRelayInfo(relayUrl: string): Promise<RelayInfo | null> {
	const key = normalizeURL(relayUrl);

	try {
		// Cache hit
		const cache = get(relayInfos);
		if (cache.has(key)) return cache.get(key) || null;

		// Debounce in-flight
		if (fetchAttempts.has(key)) return null;
		fetchAttempts.add(key);

		const response = await fetch(`/api/relay-info?relay=${encodeURIComponent(key)}`);
		if (response.ok) {
			const relayInfo: RelayInfo = await response.json();
			setRelayInfo(key, relayInfo);
			return relayInfo;
		}
	} catch (error) {
		console.log('Failed to fetch relay info for', relayUrl, error);
		// Track failure for negative cache (but allow retry after 5 min)
		fetchFailures.set(key, Date.now());
	} finally {
		fetchAttempts.delete(key);
	}

	return null;
}

export function initRelayTracking() {
	useRelayStatus((status, url) => {
		const key = normalizeURL(url);
		setRelayStatus(key, status);

		// Only fetch NIP-11 info when relay is connected.
		if (status === 'connected') {
			// Don't retry if failed recently (within 5 minutes)
			const lastFailure = fetchFailures.get(key);
			if (!lastFailure || Date.now() - lastFailure > 5 * 60 * 1000) {
				fetchRelayInfo(key);
			}
		}
	});
}
