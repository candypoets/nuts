const FALLBACK_RELAYS = [
	'wss://relay.nuts.cash',
	'wss://relay.damus.io',
	'wss://relay.nostr.band',
	'wss://purplepag.es'
];
export const SAFE_RELAY = 'wss://relay.nuts.cash';

function parseRelayEnv(value: string | undefined, fallback = FALLBACK_RELAYS) {
	return (value || fallback.join(','))
		.split(',')
		.map((relay) => relay.trim())
		.filter(Boolean);
}

export const INDEXER_RELAYS = Array.from(
	new Set([...parseRelayEnv(import.meta.env.VITE_INDEXER_RELAYS), SAFE_RELAY])
);
export const SEARCH_RELAYS = parseRelayEnv(import.meta.env.VITE_SEARCH_RELAYS);
export const DEFAULT_RELAYS = parseRelayEnv(import.meta.env.VITE_DEFAULT_RELAYS);
