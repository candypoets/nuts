import { type NostrEvent, type Event, type Filter, SimplePool } from 'nostr-tools';
import { createNipWorker } from './nipworker';

import _ from 'lodash';
import { parseKind9735 } from 'src/parsers/kind9735';

// Define types for zap receipts
export interface ZapReceipt {
	id: string;
	amount: number; // Amount in sats
	content: string; // Content from the zap request
	bolt11: string; // Lightning invoice
	preimage?: string; // Payment preimage (optional)
	sender: string; // Pubkey of sender
	recipient: string; // Pubkey of recipient
	event?: string; // ID of the event being zapped (if any)
	eventCoordinate?: string; // Event coordinate for addressable events (if any)
	timestamp: number; // When the zap was created
	valid: boolean; // Whether the zap appears valid
	description: any; // The original zap request data
}

// Type for the parsed NIP-57 data
export type NIP57Parsed = ZapReceipt;

// Parameters for zap queries
export type Nip57Params = Filter & {
	relays?: string[];
};

// Default relays for querying zaps
const INDEXER_RELAYS = (import.meta.env.VITE_INDEXER_RELAYS || '').split(',').filter(Boolean);

// Create the NIP-57 worker
createNipWorker<NIP57Parsed, Nip57Params>({
	// Create subscriptions allowing filters to be passed directly
	createSubscriptions: (params) => {
		// Extract relays if provided, otherwise use defaults
		const { relays, ...filters } = params;
		const zapRelays = relays && relays.length > 0 ? relays : INDEXER_RELAYS;

		// Ensure kinds includes 9735 for zap receipts
		const zapFilters = {
			...filters,
			kinds: _.uniq([...(filters.kinds || []), 9735])
		};
		console.log('create zap sub', zapRelays, zapFilters);
		return [
			{
				relays: zapRelays,
				filters: [zapFilters]
			}
		];
	},

	// Parse the zap receipt events (9735)
	parseEvent: parseKind9735,

	// We want to receive all zap receipts, not just the newest ones
	onlyNew: false,

	// Use default relays
	defaultRelays: INDEXER_RELAYS
});

console.info('NIP-57 worker initialized');
