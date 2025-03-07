import { type NostrEvent, type Event, type Filter } from 'nostr-tools';
import { createNipWorker } from './nipworker';

import { parseKind10002, type Kind10002Parsed } from 'src/parsers/kind10002';

// Structure of the NIP-65 parsed data
export type NIP65Parsed = Kind10002Parsed;

// Extending Filter type for any specific params we might need
export type Nip65Params = Filter;

// Default relays to use when querying
const DEFAULT_RELAYS = (import.meta.env.VITE_INDEXER_RELAYS || '').split(',').filter(Boolean);

// Create the NIP-65 worker
createNipWorker<NIP65Parsed, Nip65Params>({
	// Create subscriptions for fetching relay lists
	createSubscriptions: (params) => {
		// Just fetch kind:10002 events
		const filters = {
			...params,
			kinds: [10002]
		};
		console.log(filters);
		return [
			{
				relays: DEFAULT_RELAYS,
				filters: [filters]
			}
		];
	},

	// Parse the event according to NIP-65
	parseEvent: parseKind10002,

	// We only need the latest relay list for each user
	onlyNew: true
});

console.info('NIP-65 worker initialized');
