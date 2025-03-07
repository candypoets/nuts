import _ from 'lodash';
import { type Filter, parseReferences } from 'nostr-tools';
import { createNipWorker } from 'src/workers/nipworker';
import { parseKind1, type Kind1Parsed } from 'src/parsers/kind1';

type Reference = ReturnType<typeof parseReferences>[0];

export type NIP10Parsed = Kind1Parsed;

export interface PubkeyWithRelays {
	pubkey: string;
	relays?: string[];
}

// Extending Filter type from nostr-tools with our pubkeys array
export type Nip10Params = Omit<Filter, 'kinds' | 'authors'> & {
	pubkeys?: PubkeyWithRelays[];
	parse?: boolean; // should you parse the content or not default true
	relays?: string[];
};

// Parse a kind 1 event according to NIP-10 rules

// Helper function to group pubkeys by relays for optimized subscriptions
export function groupPubkeysByRelays(
	pubkeysWithRelays: PubkeyWithRelays[],
	defaultRelays: string[]
): Map<string, string[]> {
	// First, expand each pubkey with its relays
	const relayToPubkeysMap = new Map<string, Set<string>>();

	for (const { pubkey, relays } of pubkeysWithRelays) {
		// Use provided relays or default relays
		const pubkeyRelays = relays && relays.length > 0 ? relays : defaultRelays;

		// Add this pubkey to each of its relays
		for (const relay of pubkeyRelays) {
			if (!relayToPubkeysMap.has(relay)) {
				relayToPubkeysMap.set(relay, new Set<string>());
			}
			relayToPubkeysMap.get(relay)!.add(pubkey);
		}
	}

	return new Map(
		Array.from(relayToPubkeysMap.entries()).map(([relay, pubkeysSet]) => [
			relay,
			Array.from(pubkeysSet)
		])
	);
}

// Create optimized subscription configs with max 2 relays per subscription
export function createOptimizedSubscriptions(
	relayToPubkeysMap: Map<string, string[]>,
	baseFilter: Filter
): Array<{ relays: string[]; filters: Filter[] }> {
	const subscriptions: Array<{ relays: string[]; filters: Filter[] }> = [];

	// Sort relays by number of pubkeys (descending) to optimize coverage
	const sortedRelays = Array.from(relayToPubkeysMap.entries()).sort(
		(a, b) => b[1].length - a[1].length
	);

	// Track which pubkeys have been covered
	const coveredPubkeys = new Set<string>();

	// Process relays and create optimized subscriptions
	while (sortedRelays.length > 0) {
		// Start with the relay that covers the most pubkeys
		const [firstRelay, firstPubkeys] = sortedRelays.shift()!;
		let currentRelays = [firstRelay];
		let currentPubkeys = [...firstPubkeys];

		// If we have relays left, try to find a complementary relay
		if (sortedRelays.length > 0) {
			// Find the relay that adds the most uncovered pubkeys
			let bestIndex = -1;
			let bestAdditionalCoverage = 0;

			for (let i = 0; i < sortedRelays.length; i++) {
				const [, pubkeys] = sortedRelays[i];
				// Count pubkeys not already in currentPubkeys
				const newPubkeys = pubkeys.filter((pk) => !currentPubkeys.includes(pk));
				if (newPubkeys.length > bestAdditionalCoverage) {
					bestAdditionalCoverage = newPubkeys.length;
					bestIndex = i;
				}
			}

			// If we found a good complementary relay, add it
			if (bestIndex >= 0) {
				const [secondRelay, secondPubkeys] = sortedRelays.splice(bestIndex, 1)[0];
				currentRelays.push(secondRelay);
				// Add new pubkeys to our current set
				for (const pk of secondPubkeys) {
					if (!currentPubkeys.includes(pk)) {
						currentPubkeys.push(pk);
					}
				}
			}
		}

		// Mark these pubkeys as covered
		for (const pk of currentPubkeys) {
			coveredPubkeys.add(pk);
		}

		// Create a filter with these pubkeys
		const filter = { ...baseFilter, kinds: [1], authors: currentPubkeys };

		// Add this subscription
		subscriptions.push({
			relays: currentRelays,
			filters: [filter]
		});

		// Update the remaining relays' pubkey lists to remove already covered pubkeys
		for (let i = 0; i < sortedRelays.length; i++) {
			const [relay, pubkeys] = sortedRelays[i];
			const remainingPubkeys = pubkeys.filter((pk) => !coveredPubkeys.has(pk));
			if (remainingPubkeys.length === 0) {
				// Remove this relay if all its pubkeys are covered
				sortedRelays.splice(i, 1);
				i--;
			} else {
				// Update the pubkeys list
				sortedRelays[i] = [relay, remainingPubkeys];
			}
		}
	}

	return subscriptions;
}

// Create the NIP-10 worker for text notes and threads
createNipWorker<NIP10Parsed, Nip10Params>({
	// Optimized subscription creation
	createSubscriptions: (params) => {
		// Base filter (excluding pubkeys/authors which will be added per subscription)
		const baseFilter = { ...params };
		delete (baseFilter as any).pubkeys; // Remove pubkeys property

		if (!params.pubkeys || params.pubkeys.length === 0) {
			return [
				{
					relays: params.relays || [],
					filters: [{ kinds: [1], ...baseFilter }]
				}
			];
		}

		// Get default relays (will be used if no specific relays provided for a pubkey)
		const defaultRelays: string[] = import.meta.env.VITE_INDEXER_RELAYS.split(',');

		// Group pubkeys by relays
		const relayToPubkeysMap = groupPubkeysByRelays(params.pubkeys, defaultRelays);

		// Create optimized subscriptions
		const optimizedSubscriptions = createOptimizedSubscriptions(relayToPubkeysMap, baseFilter);

		return optimizedSubscriptions;
	},

	// Parse the event according to NIP-10 rules
	parseEvent: parseKind1,

	// For text notes, we usually want all events, not just the newest
	onlyNew: false
});

console.info('NIP-10 worker initialised');
