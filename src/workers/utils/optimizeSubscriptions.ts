import type { Filter } from 'nostr-tools';

export type Request = Filter & {
	relays: string[];
	cacheFirst: boolean; // if true, the request cancel if the response is in the cache
};

export type Subscription = {
	relays: string[];
	filters: Filter[];
};

export function optimizeSubscriptions(requests: Request[]): Subscription[] {
	if (requests.length === 0) return [];

	// Step 1: Group requests by their relay sets
	const relaySetToRequests = new Map<string, Request[]>();

	for (const request of requests) {
		if (!request.relays || !request.relays.length) continue; // ignore requests without relays
		const relayKey = JSON.stringify([...request.relays].sort());

		if (!relaySetToRequests.has(relayKey)) {
			relaySetToRequests.set(relayKey, []);
		}

		relaySetToRequests.get(relayKey)!.push(request);
	}

	// Step 2: For identical filters with different relay sets, merge the relay sets
	const filterToRelays = new Map<string, string[]>();
	const filterToFilter = new Map<string, Filter>();

	// First collect all unique filters and their relays
	for (const [relayKey, requests] of relaySetToRequests.entries()) {
		const relays = JSON.parse(relayKey);

		for (const request of requests) {
			const { relays: _, ...filter } = request;
			const filterKey = JSON.stringify(filter);

			if (!filterToRelays.has(filterKey)) {
				filterToRelays.set(filterKey, []);
				filterToFilter.set(filterKey, filter);
			}

			// Add these relays to this filter's relay list
			for (const relay of relays) {
				if (!filterToRelays.get(filterKey)!.includes(relay)) {
					filterToRelays.get(filterKey)!.push(relay);
				}
			}
		}
	}

	// Step 3: Group filters by their relay sets again
	const finalRelaySetToFilters = new Map<string, Filter[]>();

	for (const [filterKey, relays] of filterToRelays.entries()) {
		const filter = filterToFilter.get(filterKey)!;
		const relayKey = JSON.stringify([...relays].sort());

		if (!finalRelaySetToFilters.has(relayKey)) {
			finalRelaySetToFilters.set(relayKey, []);
		}

		finalRelaySetToFilters.get(relayKey)!.push(filter);
	}

	// Step 4: Create optimized subscriptions
	const subscriptions: Subscription[] = [];

	for (const [relayKey, filters] of finalRelaySetToFilters.entries()) {
		const relays = JSON.parse(relayKey);
		const optimizedFilters = mergeFilters(filters);

		subscriptions.push({
			relays,
			filters: optimizedFilters
		});
	}

	return subscriptions;
}

function mergeFilters(filters: Filter[]): Filter[] {
	const fieldsToMerge = ['ids', 'authors', 'kinds', '#e', '#p', '#d', '#a'];

	// Group filters by their structure (non-mergeable fields + which tags they have)
	const filterGroups = new Map<string, Filter[]>();

	for (const filter of filters) {
		const structureObj: Record<string, any> = {};
		const tagFields: string[] = [];

		// Copy non-mergeable fields
		for (const key in filter) {
			if (!fieldsToMerge.includes(key)) {
				structureObj[key] = filter[key];
			} else if (key.startsWith('#')) {
				// For tag fields, just note which ones are present
				tagFields.push(key);
			}
		}

		// Include which tag fields are present in the structure key
		structureObj.tagFields = tagFields.sort();

		const structureKey = JSON.stringify(structureObj);

		if (!filterGroups.has(structureKey)) {
			filterGroups.set(structureKey, []);
		}

		filterGroups.get(structureKey)!.push(filter);
	}

	// Merge each group of filters
	const result: Filter[] = [];

	for (const filtersGroup of filterGroups.values()) {
		const mergedFilter: Record<string, any> = {};

		// Copy non-mergeable fields from the first filter
		const firstFilter = filtersGroup[0];
		for (const key in firstFilter) {
			if (!fieldsToMerge.includes(key)) {
				mergedFilter[key] = firstFilter[key];
			}
		}

		// Merge the mergeable fields
		for (const field of fieldsToMerge) {
			const values = new Set<string | number>();
			let hasField = false;

			for (const filter of filtersGroup) {
				if (filter[field] !== undefined) {
					hasField = true;
					if (Array.isArray(filter[field])) {
						for (const value of filter[field]) {
							values.add(value);
						}
					} else {
						values.add(filter[field] as string | number);
					}
				}
			}

			if (hasField) {
				mergedFilter[field] = Array.from(values);
			}
		}

		result.push(mergedFilter as Filter);
	}

	return result;
}
