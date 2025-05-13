import type { IDBPDatabase } from 'idb';
import _ from 'lodash';
import type { Filter, Event, NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools';
import { addEvent, hasEvent, nostrDb, queryEvents } from 'src/db';
import type { WorkerMessage, WorkerMessageKind } from 'src/handlers';
import type { Request, Subscription } from 'src/workers/utils';

import { optimizeSubscriptions } from './utils/optimizeSubscriptions';
import { parseEvent } from 'src/types';

// Define a subscription configuration
export type SubscriptionConfig = {
	relays: string[];
	filters: Filter[];
};

export type WorkerConfig<T, P = any> = {
	// Function to create optimized subscriptions from parameters
	createSubscriptions?: (params: P) => SubscriptionConfig[];

	// Function to create filters from parameters, ignored if createSubscriptions is provided
	createFilters?: (params: P) => Filter[];

	// Function to transform events before sending to main thread
	// Optional EOSEFilter argument, used to fetch all missing events on EOSE, (ie, Nevent, NProfile etc)
	parseEvent:
		| ((event: Event, EOSERequests?: Request[]) => Promise<T | null>)
		| ((event: Event) => T | null);

	// Optional function to get cached events from DB
	getCachedEvents?: (db: IDBPDatabase, params: P, filters?: Filter[]) => Promise<Event[]>;

	// Optional option, if true only send back events that are newer than the cache
	onlyNew?: boolean;

	// Optional relay list (defaults to env var)
	defaultRelays?: string[];
};



export function createNipWorker<T, P = any>(config: WorkerConfig<T, P>) {
	// Initialize state
	const pool = new SimplePool();
	pool.trackRelays = true;
	let subscriptions: { close: () => void }[] = [];

	// Get relays from config or environment variables
	const INDEX_RELAYS =
		config.defaultRelays || (import.meta.env.VITE_INDEXER_RELAYS || '').split(',').filter(Boolean);

	if (INDEX_RELAYS.length === 0) {
		console.warn('No relays defined for worker');
	}

	function extractAllFilters(params: P): Filter[] {
		if (config.createSubscriptions) {
			const subscriptionConfigs = config.createSubscriptions(params);
			return subscriptionConfigs.flatMap((config) => config.filters);
		} else if (config.createFilters) {
			return config.createFilters(params);
		}

		console.warn('Neither createSubscriptions nor createFilters provided in config');
		return [];
	}

	// Get cached events using the provided function or a default implementation
	async function getCachedEvents(
		db: IDBPDatabase,
		params: P,
		filters?: Filter[]
	): Promise<ParsedEvent<T>[]> {
		if (config.getCachedEvents) {
			return config.getCachedEvents(db, params);
		}

		// Use provided filters or extract all filters
		const filtersToQuery = filters || extractAllFilters(params);

		if (filtersToQuery.length === 0) {
			return [];
		}

		// Execute all queries in parallel
		const queryPromises = filtersToQuery.map((filter) => queryEvents(db, filter));
		const queryResults = await Promise.all(queryPromises);

		// Combine all results and remove duplicates
		const allEvents = queryResults.flat();

		return _.uniqBy(allEvents, 'id');
	}

	// Process events and send to main thread
	async function processAndSendEvents(
		db: IDBPDatabase,
		events: ParsedEvent<T>[],
		type: WorkerMessageKind,
		parse: boolean = true,
		EOSERequests?: Request[]
	) {
		if (!events || events.length === 0) return;

		if (!parse) console.log('SKIPPING PARSING');

		for (const event of events) {
			// treat event one by one, no rush
			await (async () => {
				if (!event.parsed && parse) {
					try {
						event.parsed = await config.parseEvent(event, EOSERequests);
						// update the event in storage with the parsed result
						await addEvent(db, event);
					} catch (error) {
						console.error('Error parsing event:', error);
					}
				}
				// if parse is not needed, delete the parsed property to save bandwidth
				if (!parse) delete event.parsed;
				self.postMessage({
					type,
					data: [event]
				} as WorkerMessage<ParsedEvent<T>>);
			})();
		}
	}

	// Close all active subscriptions
	function closeAllSubscriptions() {
		console.info('Closing all subscriptions', subscriptions);
		try {
			pool.destroy();
		} catch (error) {
			console.error('Error closing subscriptions:', error);
		}
	}

	// Message handler
	self.addEventListener(
		'message',
		async (
			event: MessageEvent<
				P & { type: 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'FETCH_LATEST'; parse?: boolean }
			>
		) => {
			if (event.type === 'UNSUBSCRIBE') {
				console.log('UNSUBSCRIBING');
				closeAllSubscriptions();
				return;
			}
			// Wait for DB initialization
			const db = await nostrDb;
			if (!db) {
				self.postMessage({
					type: 'ERROR',
					error: 'Failed to initialize database'
				} as WorkerMessage<T>);
				return;
			}

			const { type = 'SUBSCRIBE', parse = true } = event.data;

			const params = event.data;

			let cachedEvents: Event[] = [];
			let lastEvent: Event | undefined;

			if (type === 'SUBSCRIBE') {
				// Close existing subscriptions if any
				closeAllSubscriptions();

				try {
					// Get cached events from DB
					cachedEvents = await getCachedEvents(db, params);
					lastEvent = cachedEvents.sort((a, b) => b.created_at - a.created_at)[0];

					// Send cached events to main thread
					await processAndSendEvents(db, cachedEvents, 'CACHED_EVENTS');
					let EOSERequests: Request[] | undefined = [];
					let subscriptionConfigs: SubscriptionConfig[] = [];
					// Create subscriptions using optimized grouping if available
					if (config.createSubscriptions) {
						subscriptionConfigs = config.createSubscriptions(params);
					} else if (config.createFilters) {
						subscriptionConfigs = [
							{ relays: config.defaultRelays || [], filters: config.createFilters(params) }
						];
					} else {
						console.warn('neither createSubscriptions or createFilters configuration');
						return;
					}
					// Create all subscriptions in parallel
					for (const { relays, filters } of subscriptionConfigs) {
						const actualRelays = relays.length > 0 ? relays : INDEX_RELAYS;

						if (actualRelays.length === 0) {
							console.warn('No relays specified for subscription');
							continue;
						}

						const sub = pool.subscribeMany(actualRelays, filters, {
							onevent: async (newEvent: ParsedEvent<any>) => {
								try {
									// Check if we already have this event
									const exists = await hasEvent(db, newEvent.id);

									if (!exists) {
										newEvent.relays = Array.from(pool.seenOn.get(newEvent.id) || []).map(
											(r) => r.url
										);

										if (config.onlyNew) {
											// If we only want new events, check if this is newer than cached ones
											if (newEvent.created_at > (lastEvent?.created_at || 0)) {
												await processAndSendEvents(
													db,
													[newEvent],
													'FETCH_EVENTS',
													parse,
													EOSERequests
												);
											}
										} else {
											// Send all new events
											await processAndSendEvents(
												db,
												[newEvent],
												'FETCH_EVENTS',
												parse,
												EOSERequests
											);
										}
									}
								} catch (err) {
									console.error('Error processing event:', err);
								}
							},
							oneose: async () => {
								const subscriptions = optimizeSubscriptions(EOSERequests || []);
								let subClosed = 0;
								if (subscriptions.length) {
									subscriptions.map((sub) =>
										pool.subscribeManyEose(sub.relays, sub.filters, {
											onevent: async (newEvent: ParsedEvent<any>) => {
												newEvent.relays = Array.from(pool.seenOn.get(newEvent.id) || []).map(
													(r) => r.url
												);
												const exists = await hasEvent(db, newEvent.id);
												if (!exists) {
													newEvent.parsed = await parseEvent(newEvent);
													await addEvent(db, newEvent);
												}
											},
											onclose: () => {
												subClosed++;
												if (subClosed == subscriptions.length) {
													// set EOSERequests to undefined so it can be used to identify if an event has arrived before or after EOSE
													EOSERequests = undefined;
													self.postMessage({
														type: 'EOSE',
														data: { relays: actualRelays }
													} as any);
												}
											}
										})
									);
								} else {
									// set EOSERequests to undefined so it can be used to identify if an event has arrived before or after EOSE
									EOSERequests = undefined;
									self.postMessage({
										type: 'EOSE',
										data: { relays: actualRelays }
									} as any);
								}
							}
						});
						subscriptions.push(sub);
					}
				} catch (error: any) {
					console.error('Error setting up subscription:', error);
					self.postMessage({
						type: 'ERROR',
						error: `Failed to subscribe to events: ${error.message}`
					} as WorkerMessage<T>);
				}
			} else if (type === 'UNSUBSCRIBE') {
				closeAllSubscriptions();
				self.postMessage({ type: 'UNSUBSCRIBED' } as WorkerMessage<T>);
			}
		}
	);
}
