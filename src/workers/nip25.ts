import { type NostrEvent, type Event, type Filter } from 'nostr-tools';
import { createNipWorker } from './nipworker';
import _ from 'lodash';
import { parseEvent, type Kind17Parsed, type Kind7Parsed } from 'src/parsers';

// Define the reaction types according to NIP-25
export enum ReactionType {
	LIKE = '+',
	DISLIKE = '-',
	EMOJI = 'emoji',
	CUSTOM = 'custom'
}

// Structure of a parsed reaction
export type NIP25Parsed = Kind7Parsed | Kind17Parsed;

// Parameters for reaction queries - simply pass through any filter properties
export type Nip25Params = Filter & {
	relays?: string[];
};

/**
 * Parse a reaction event according to NIP-25
 */
async function parseReaction(event: NostrEvent): Promise<NIP25Parsed | null> {
	return parseEvent(event) as unknown as Kind7Parsed | Kind17Parsed;
}

// Default relays for querying reactions
const DEFAULT_RELAYS = (import.meta.env.VITE_INDEXER_RELAYS || '').split(',').filter(Boolean);

// Create the NIP-25 worker
createNipWorker<NIP25Parsed, Nip25Params>({
	// Create subscriptions allowing filters to be passed directly
	createSubscriptions: (params) => {
		// Extract relays if provided, otherwise use defaults
		const { relays, ...filters } = params;
		const reactionRelays = relays && relays.length > 0 ? relays : DEFAULT_RELAYS;

		// Ensure kinds includes 7 and 17 for reactions
		const reactionFilters = {
			...filters,
			kinds: _.uniq([...(filters.kinds || []), 7, 17])
		};

		return [
			{
				relays: reactionRelays,
				filters: [reactionFilters]
			}
		];
	},

	// Parse the reaction events
	parseEvent: parseReaction,

	// We want to receive all reactions, not just the newest ones
	onlyNew: false,

	// Use default relays
	defaultRelays: DEFAULT_RELAYS
});

console.info('NIP-25 worker initialized');
