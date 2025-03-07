import { type NostrEvent, type Event, type Filter } from 'nostr-tools';
import { createNipWorker, type SubscriptionConfig } from 'src/workers/nipworker';
import type { Request } from 'src/workers/utils';
import _ from 'lodash';
import { parseKind10019, parseKind9321, type Kind9321, type Kind10019 } from 'src/parsers';

// Structure for the NIP-61 parsed data
export type NIP61Parsed = Kind9321 | Kind10019 | null;

// Parameters for nutzap queries
export type Nip61Params = {
	zaps: Filter & { relays?: string[] };
	wallet?: Filter & { relays?: string[] };
};

// Default relays for querying nutzaps
const DEFAULT_RELAYS = (import.meta.env.VITE_INDEXER_RELAYS || '').split(',').filter(Boolean);

/**

/**
 * Verify proof validity (simplified - would need actual implementation)
 */
function verifyProof(proof: string, p2pkPubkey: string): boolean {
	// In a real implementation, this would:
	// 1. Verify the DLEQ proof
	// 2. Check that the token is locked to the correct pubkey
	// 3. Perform other validations

	// Simplified validation - just check if the proof contains the pubkey
	try {
		const proofObj = JSON.parse(proof);
		// Check if secret contains P2PK and the pubkey
		return (
			proofObj.secret?.includes('P2PK') &&
			proofObj.secret?.includes(p2pkPubkey.startsWith('02') ? p2pkPubkey : `02${p2pkPubkey}`)
		);
	} catch (e) {
		console.error('Failed to verify proof:', e);
		return false;
	}
}

// Create the NIP-61 worker
createNipWorker<NIP61Parsed, Nip61Params>({
	// Create subscriptions allowing filters to be passed directly
	createSubscriptions: (params: Nip61Params) => {
		const subscriptionFilters: SubscriptionConfig[] = [];

		// Extract relays if provided, otherwise use defaults
		const { relays, ...filters } = params.zaps;
		const nutzapRelays = relays && relays.length > 0 ? relays : DEFAULT_RELAYS;
		// Base filters array - we'll query for both kinds of events
		// Add filter for nutzap events (kind 9321)
		subscriptionFilters.push({
			filters: [{ ...filters, kinds: _.uniq([...(filters.kinds || []), 9321]) }],
			relays: nutzapRelays
		});

		if (params.wallet) {
			const { relays, ...filters } = params.wallet;

			// Add filter for nutzap info events (kind 10019)
			subscriptionFilters.push({
				filters: [{ ...filters, kinds: _.uniq([...(filters.kinds || []), 10019]) }],
				relays: relays || DEFAULT_RELAYS
			});
		}

		return subscriptionFilters;
	},

	// Parse the nutzap events
	parseEvent: async (event: NostrEvent, EOSERequests?: Request[]) => {
		switch (event.kind) {
			case 9321:
				return parseKind9321(event, EOSERequests);
			case 10019:
				return parseKind10019(event);
			default:
				return null;
		}
	},

	// We want to receive all nutzap events, not just the newest ones
	onlyNew: false,

	// Use default relays
	defaultRelays: DEFAULT_RELAYS
});

console.info('NIP-61 worker initialized');
