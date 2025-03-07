import { parseKind3, type Kind3Parsed } from 'src/parsers';
import { createNipWorker } from './nipworker';
import type { Event } from 'nostr-tools';

export type NIP02Parsed = Kind3Parsed;

// Input parameters for the worker
export interface NIP02Params {
	pubkey: string;
	relays?: string[];
}

/**
 * Create the NIP-03 worker for fetching contact lists
 */
createNipWorker<NIP02Parsed, NIP02Params>({
	// Create optimized subscriptions using the provided relays
	createSubscriptions: (params) => {
		const filter = { kinds: [3], authors: [params.pubkey], limit: 1 };

		// If user provided specific relays, use those
		if (params.relays && params.relays.length > 0) {
			return [
				{
					relays: params.relays,
					filters: [filter]
				}
			];
		}

		// Otherwise use default relays
		return [
			{
				relays: [], // Empty array will use default relays
				filters: [filter]
			}
		];
	},

	// Parse the event into a structured contact list
	parseEvent: parseKind3,

	// Only return the most recent contact list
	onlyNew: true
});

console.info('NIP-02 worker initialized');
