import type { NostrEvent } from 'nostr-tools';
import { createNipWorker } from './nipworker';
import { parseKind0, type Kind0Parsed } from 'src/parsers/kind0';

export type NIP01Parsed = Kind0Parsed;

export type Nip01Params = {
	pubkey: string;
};

// Create a specialized NIP-01 worker
createNipWorker<NIP01Parsed, Nip01Params>({
	// Create filters from a pubkey
	createFilters: (params) => [{ kinds: [0], authors: [params.pubkey] }],

	// Parse event to profile data
	parseEvent: parseKind0,
	onlyNew: true
});

console.info('NIP-01 worker initialized');
