const FALLBACK_RELAYS = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es'];

function parseRelayEnv(value: string | undefined, fallback = FALLBACK_RELAYS) {
	return (value || fallback.join(','))
		.split(',')
		.map((relay) => relay.trim())
		.filter(Boolean);
}

export const INDEXER_RELAYS = parseRelayEnv(import.meta.env.VITE_INDEXER_RELAYS);
export const SEARCH_RELAYS = parseRelayEnv(import.meta.env.VITE_SEARCH_RELAYS);
export const DEFAULT_RELAYS = parseRelayEnv(import.meta.env.VITE_DEFAULT_RELAYS);
