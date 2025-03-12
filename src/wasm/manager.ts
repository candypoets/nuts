import * as msgpack from '@msgpack/msgpack';
import NostrWorker from 'src/wasm/nostr?worker';
import { type IDBPDatabase } from 'idb';
import type { Filter, NostrEvent } from 'nostr-tools';
import { addEvent, nostrDb, type ProcessedNostrEvent } from 'src/db';
import type { ParsedEvent } from 'src/workers/nipworker';

type SubscriptionCallback = (events: ParsedEvent<unknown>) => void;

export type Request = Filter & {
	relays: string[];
};

interface SubscriptionOptions {
	closeOnEose?: boolean;
	skipCache?: boolean;
}

interface Subscription {
	id: string;
	callback: SubscriptionCallback;
	options: SubscriptionOptions;
}

export class NostrManager {
	private worker: Worker;
	private subscriptions: Map<string, Subscription>;
	private db: IDBPDatabase<unknown> | undefined; // IDBPDatabase type
	private eventsById: Map<string, ProcessedNostrEvent> = new Map();
	private profilesByPubkey: Map<string, ProcessedNostrEvent> = new Map();

	constructor() {
		// check with vite if we are on the server
		if (import.meta.env.SSR) return;
		this.worker = new NostrWorker();
		this.subscriptions = new Map();
		nostrDb.then((db) => (this.db = db));
		this.setupWorkerHandlers();
	}

	private setupWorkerHandlers() {
		this.worker.onmessage = (event) => {
			if (!event.data) return;
			const { type, subscriptionId, eventData } = event.data;

			const subscription = this.subscriptions.get(subscriptionId);
			if (!subscription) return;

			switch (type) {
				case 'CACHED_EVENTS':
					console.log('Received cached events');
					this.handleEvent(subscriptionId, eventData, true);
					break;
				case 'FETCHED_EVENTS':
					console.log('Received fetched events');
					this.handleEvent(subscriptionId, eventData);
					break;
				case 'EOSE':
					console.log(`End of stored events for subscription ${subscriptionId}`);
					if (subscription.options.closeOnEose) {
						this.unsubscribe(subscriptionId);
					}
					break;
				case 'error':
					console.error(`Error in subscription ${subscriptionId}:`, eventData);
					break;
			}
		};
	}

	subscribe(
		subscriptionId: string,
		requests: Request[],
		callback: SubscriptionCallback,
		options: SubscriptionOptions = {}
	): Function {
		if (!subscriptionId) {
			throw new Error('Subscription ID is required');
		}

		// Store the subscription
		this.subscriptions.set(subscriptionId, {
			id: subscriptionId,
			callback,
			options: {
				closeOnEose: options?.closeOnEose ?? false,
				skipCache: options?.skipCache ?? false
			}
		});

		// Serialize to binary format
		const binaryData = msgpack.encode(requests);

		// Start the subscription in the worker
		this.worker.postMessage({
			action: 'SUBSCRIBE',
			subscriptionId,
			requests: binaryData
		});

		return () => this.unsubscribe(subscriptionId);
	}

	unsubscribe(subscriptionId: string): void {
		if (!this.subscriptions.has(subscriptionId)) {
			return;
		}

		// Notify the worker
		this.worker.postMessage({
			action: 'UNSUBSCRIBE',
			subscriptionId
		});

		// Remove from our subscriptions
		this.subscriptions.delete(subscriptionId);
	}

	private async handleEvent(subscriptionId: string, eventData: Uint8Array, fromCache?: boolean) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		const decodedEvent = msgpack.decode(eventData) as ParsedEvent<unknown>;

		// Process and cache the event
		await this.processAndCacheEvent(decodedEvent, fromCache);

		// Call the subscription callback with the fresh event
		subscription.callback(decodedEvent);
	}

	private async processAndCacheEvent(event: NostrEvent, fromCache?: boolean): Promise<void> {
		if (!event || !event.id || !this.db) return;

		try {
			// if the event was sent from the cache, it is already in the database
			if (fromCache) {
				// Add to IndexedDB
				await addEvent(this.db, event);
			}

			// Add to in-memory cache
			const processedEvent = event as ProcessedNostrEvent;

			// Cache by ID for all events
			this.eventsById.set(processedEvent.id, processedEvent);

			// Cache kind 0 events by pubkey (profile metadata)
			if (processedEvent.kind === 0) {
				this.profilesByPubkey.set(processedEvent.pubkey, processedEvent);
			}
		} catch (error) {
			console.error('Error processing event:', error, event);
		}
	}

	// Helper methods to access cached data
	getEventById(id: string): ProcessedNostrEvent | undefined {
		return this.eventsById.get(id);
	}

	getProfileByPubkey(pubkey: string): ProcessedNostrEvent | undefined {
		return this.profilesByPubkey.get(pubkey);
	}

	// Clean up resources
	destroy(): void {
		// Unsubscribe from all subscriptions
		for (const subscriptionId of this.subscriptions.keys()) {
			this.unsubscribe(subscriptionId);
		}

		// Terminate the worker
		this.worker.terminate();
	}
}

// Export a singleton instance
export const nostrManager = new NostrManager();
