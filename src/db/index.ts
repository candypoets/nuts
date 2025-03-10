import { openDB, type IDBPDatabase } from 'idb';
import type { Filter, NostrEvent } from 'nostr-tools';
import { get, writable, type Writable } from 'svelte/store';

export type ProcessedNostrEvent = NostrEvent & {
	e_tags: string[];
	a_tags: string[];
	p_tags: string[];
	d_tags: string[];
};

// Cache structures
interface NostrCache {
	eventsById: Map<string, ProcessedNostrEvent>;
	profilesByPubkey: Map<string, ProcessedNostrEvent>;
	isInitialized: Writable<boolean>;
}

// Initialize cache
const cache: NostrCache = {
	eventsById: new Map(),
	profilesByPubkey: new Map(),
	isInitialized: writable(false)
};

export const isInitialized = cache.isInitialized;

export const nostrDb = initNostrDB();

export async function initNostrDB() {
	if (import.meta.env.SSR) return;
	return openDB('nostr-local-relay', 1, {
		upgrade(db, oldVersion, _newVersion, transaction) {
			// Create or upgrade the events store
			const eventStore = db.objectStoreNames.contains('events')
				? transaction.objectStore('events')
				: db.createObjectStore('events', { keyPath: 'id' });

			// Create indexes if they don't already exist
			if (!eventStore.indexNames.contains('kind')) {
				eventStore.createIndex('kind', 'kind', { unique: false });
			}

			if (!eventStore.indexNames.contains('pubkey')) {
				eventStore.createIndex('pubkey', 'pubkey', { unique: false });
			}

			if (!eventStore.indexNames.contains('created_at')) {
				eventStore.createIndex('created_at', 'created_at', { unique: false });
			}

			// Create tag-related indexes with multiEntry for array values
			if (!eventStore.indexNames.contains('e_tags')) {
				eventStore.createIndex('e_tags', 'e_tags', {
					unique: false,
					multiEntry: true
				});
			}

			if (!eventStore.indexNames.contains('p_tags')) {
				eventStore.createIndex('p_tags', 'p_tags', {
					unique: false,
					multiEntry: true
				});
			}

			if (!eventStore.indexNames.contains('a_tags')) {
				eventStore.createIndex('a_tags', 'a_tags', {
					unique: false,
					multiEntry: true
				});
			}

			if (!eventStore.indexNames.contains('d_tags')) {
				eventStore.createIndex('d_tags', 'd_tags', {
					unique: false,
					multiEntry: true
				});
			}

			console.log('Nostr database setup complete');
		}
	});
}

/**
 * Initialize the cache by loading all events from IndexedDB
 */
async function initCache(db: IDBPDatabase) {
	if (get(cache.isInitialized)) return;

	try {
		console.log('Initializing cache from IndexedDB...');
		const allEvents = await db.getAll('events');

		// Clear existing cache
		cache.eventsById.clear();
		cache.profilesByPubkey.clear();

		// Populate cache
		for (const event of allEvents) {
			const processedEvent = event as ProcessedNostrEvent;

			// Cache by ID for all events
			cache.eventsById.set(processedEvent.id, processedEvent);

			// Cache kind 0 events by pubkey
			if (processedEvent.kind === 0) {
				cache.profilesByPubkey.set(processedEvent.pubkey, processedEvent);
			}
		}

		cache.isInitialized.set(true);
		console.log(
			`Cache initialized with ${cache.eventsById.size} events and ${cache.profilesByPubkey.size} profiles`
		);
	} catch (error) {
		console.error('Failed to initialize cache:', error);
		// Don't set isInitialized to true if there was an error
	}
}

function processEventForStorage(event: NostrEvent) {
	// Create a copy of the event to avoid modifying the original
	const processedEvent = { ...event } as ProcessedNostrEvent;

	// Extract e tags (event references)
	processedEvent.e_tags = event.tags
		.filter((tag) => tag[0] === 'e' && tag.length > 1)
		.map((tag) => tag[1]);

	// Extract p tags (pubkey references)
	processedEvent.p_tags = event.tags
		.filter((tag) => tag[0] === 'p' && tag.length > 1)
		.map((tag) => tag[1]);

	// Extract a tags (parametrized replaceable event references)
	processedEvent.a_tags = event.tags
		.filter((tag) => tag[0] === 'a' && tag.length > 1)
		.map((tag) => tag[1]);

	// Extract d tags (direct message references)
	processedEvent.d_tags = event.tags
		.filter((tag) => tag[0] === 'd' && tag.length > 1)
		.map((tag) => tag[1]);

	return processedEvent;
}

export async function addEvent(db: IDBPDatabase, event: NostrEvent) {
	if (!event) return;
	const processedEvent = processEventForStorage(event);
	return db.put('events', processedEvent);
}

export async function addEvents(db: IDBPDatabase, events: NostrEvent[]) {
	if (!events || events.length === 0) {
		return;
	}

	// Process all events before storing them
	const processedEvents = events.map((event) => processEventForStorage(event));

	// Use a single transaction for the bulk operation
	const tx = db.transaction('events', 'readwrite');
	const store = tx.objectStore('events');

	// Add all events individually in the same transaction
	const putPromises = processedEvents.map((event) => store.put(event));

	// Wait for all operations and transaction to complete
	await Promise.all([...putPromises, tx.done]);

	return processedEvents.map((event) => event.id);
}

export async function queryEvents(db: IDBPDatabase, filter: Filter, limit = undefined) {
	try {
		// Create a single transaction for the entire operation
		const tx = db.transaction('events', 'readonly');
		const store = tx.store;

		// Track matching event IDs across all filters
		let matchingEventIds: string[] | null = null;

		// Helper function to intersect IDs or initialize if null
		function intersectIds(current: string[] | null, newIds: string[]) {
			if (current === null) return newIds;
			return current.filter((id) => newIds.includes(id));
		}

		// Apply filter conditions, all using the same transaction

		// Filter by IDs
		if (filter.ids && filter.ids.length > 0) {
			const events = await Promise.all(filter.ids.map((id) => store.get(id)));
			const ids = events.filter(Boolean).map((event) => event.id);
			matchingEventIds = intersectIds(matchingEventIds, ids);
			if (matchingEventIds && matchingEventIds.length === 0) return [];
		}

		// Filter by kinds (event types)
		if (filter.kinds && filter.kinds.length > 0) {
			const kindIndex = store.index('kind');
			const events = [];

			const kindResults = await Promise.all(filter.kinds.map((kind) => kindIndex.getAll(kind)));

			for (const result of kindResults) {
				events.push(...result);
			}

			const ids = [...new Set(events.map((event) => event.id))];
			matchingEventIds = intersectIds(matchingEventIds, ids);
			if (matchingEventIds && matchingEventIds.length === 0) return [];
		}

		// Filter by authors (pubkeys)
		if (filter.authors && filter.authors.length > 0) {
			const pubkeyIndex = store.index('pubkey');
			const events = [];

			const authorResults = await Promise.all(
				filter.authors.map((author) => pubkeyIndex.getAll(author))
			);

			for (const result of authorResults) {
				events.push(...result);
			}

			const ids = [...new Set(events.map((event) => event.id))];
			matchingEventIds = intersectIds(matchingEventIds, ids);
			if (matchingEventIds && matchingEventIds.length === 0) return [];
		}

		// Filter by e tags
		if (filter['#e'] && filter['#e'].length > 0) {
			const eTagsIndex = store.index('e_tags');
			const events = [];

			const eTagResults = await Promise.all(filter['#e'].map((tag) => eTagsIndex.getAll(tag)));

			for (const result of eTagResults) {
				events.push(...result);
			}

			const ids = [...new Set(events.map((event) => event.id))];
			matchingEventIds = intersectIds(matchingEventIds, ids);
			if (matchingEventIds && matchingEventIds.length === 0) return [];
		}

		// Filter by p tags
		if (filter['#p'] && filter['#p'].length > 0) {
			const pTagsIndex = store.index('p_tags');
			const events = [];

			const pTagResults = await Promise.all(filter['#p'].map((tag) => pTagsIndex.getAll(tag)));

			for (const result of pTagResults) {
				events.push(...result);
			}

			const ids = [...new Set(events.map((event) => event.id))];
			matchingEventIds = intersectIds(matchingEventIds, ids);
			if (matchingEventIds && matchingEventIds.length === 0) return [];
		}

		// Filter by a tags
		if (filter['#a'] && filter['#a'].length > 0) {
			const aTagsIndex = store.index('a_tags');
			const events = [];

			const aTagResults = await Promise.all(filter['#a'].map((tag) => aTagsIndex.getAll(tag)));

			for (const result of aTagResults) {
				events.push(...result);
			}

			const ids = [...new Set(events.map((event) => event.id))];
			matchingEventIds = intersectIds(matchingEventIds, ids);
			if (matchingEventIds && matchingEventIds.length === 0) return [];
		}

		// Filter by d tags
		if (filter['#d'] && filter['#d'].length > 0) {
			const dTagsIndex = store.index('d_tags');
			const events = [];

			const dTagResults = await Promise.all(filter['#d'].map((tag) => dTagsIndex.getAll(tag)));

			for (const result of dTagResults) {
				events.push(...result);
			}

			const ids = [...new Set(events.map((event) => event.id))];
			matchingEventIds = intersectIds(matchingEventIds, ids);
			if (matchingEventIds && matchingEventIds.length === 0) return [];
		}

		// If no filters were applied, get all events
		if (matchingEventIds === null) {
			const allEvents = await store.getAll();
			// Wait for transaction to complete
			await tx.done;
			return limit !== undefined ? allEvents.slice(0, limit) : allEvents;
		}

		// Apply limit if specified
		if (limit !== undefined && matchingEventIds.length > limit) {
			matchingEventIds = matchingEventIds.slice(0, limit);
		}

		// Get all matching events in a single batch operation
		const events = await Promise.all(matchingEventIds.map((id) => store.get(id)));

		// Wait for transaction to complete
		await tx.done;

		// Filter out any null results and return the events
		return events.filter(Boolean);
	} catch (error) {
		console.error('Error querying events:', error);
		throw error;
	}
}

export async function getEvent(db: IDBPDatabase, id: string) {
	// Check cache first
	const cachedEvent = cache.eventsById.get(id);
	if (cachedEvent) {
		return cachedEvent;
	}

	// Fetch from DB if not in cache
	const event = (await db.get('events', id)) as ProcessedNostrEvent | undefined;

	// Update cache if found
	if (event) {
		cache.eventsById.set(id, event);
	}

	return event;
}

export async function hasEvent(db: IDBPDatabase, id: string) {
	// Check cache first
	if (cache.eventsById.has(id)) {
		return true;
	}

	// Fall back to DB
	const event = await db.get('events', id);

	// Update cache if found
	if (event) {
		cache.eventsById.set(id, event as ProcessedNostrEvent);
	}

	return !!event;
}

export function cachedEvent(id: string): ProcessedNostrEvent | undefined {
	// Check cache first
	const cachedEvent = cache.eventsById.get(id);
	if (cachedEvent) {
		return cachedEvent;
	}
	return undefined;
}

export async function getProfile(
	db: IDBPDatabase,
	pubkey: string
): Promise<NostrEvent | undefined> {
	// Check cache first
	const cachedProfile = cache.profilesByPubkey.get(pubkey);
	if (cachedProfile) {
		return cachedProfile;
	}

	// Fetch from DB if not in cache
	const profile = await queryEvents(db, { authors: [pubkey], kinds: [0] });
	const profileEvent = profile?.[0] as ProcessedNostrEvent | undefined;

	// Update cache if found
	if (profileEvent) {
		cache.profilesByPubkey.set(pubkey, profileEvent);
	}

	return profileEvent;
}

export function cachedProfile(pubkey: string): ProcessedNostrEvent | undefined {
	// Check cache first
	const cachedProfile = cache.profilesByPubkey.get(pubkey);
	if (cachedProfile) {
		return cachedProfile;
	}
	return undefined;
}

/**
 * Update or refresh the cache from the database
 * Useful if you suspect the cache might be out of sync
 */
export async function refreshCache(db: IDBPDatabase) {
	cache.isInitialized.set(false);
	await initCache(db);
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
	return {
		eventsCount: cache.eventsById.size,
		profilesCount: cache.profilesByPubkey.size,
		initialized: cache.isInitialized
	};
}
