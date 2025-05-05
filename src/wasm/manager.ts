import * as msgpack from '@msgpack/msgpack';
import type { EventTemplate, Filter } from 'nostr-tools';
import type { AnyKind } from 'src/parsers';
import NostrWorker from 'src/wasm/nostr?worker';

import type { ParsedEvent } from 'src/workers/nipworker';

export type SubscribeKind = 'CACHED_EVENT' | 'FETCHED_EVENT' | 'EOSE' | 'EOCE';
export type PublishKind = 'PUBLISH_STATUS';
// only the first event is from the request, all others are contextuals
type SubscriptionCallback = (events: ParsedEvent<AnyKind>[], type: SubscribeKind) => void;

type PublishCallback = (data: RelayStatus, type: PublishKind) => void;

export enum PublishStatus {
	StatusPending = 'pending',
	StatusSent = 'sent',
	StatusSuccess = 'success',
	StatusFailed = 'failed',
	StatusRejected = 'rejected',
	StatusConnError = 'connection_error'
}

export type RelayStatus = {
	relay: string;
	status: PublishStatus;
	message: string;
	timestamp: number;
};

// type PublishSummary = {
// 	relayCount: number;
// 	successCount: number;
// 	relayStatuses: Record<string, PublishStatus>;
// 	durationMs: number;
// 	timestamp: number;
// };

export type Request = Filter & {
	relays: string[];
	cacheFirst?: boolean;
	noOptimize?: boolean;
	limit?: number;
};

interface SubscriptionOptions {
	closeOnEose?: boolean;
	skipCache?: boolean;
	force?: boolean; // force a new subscription if one already exists
}

interface SubscriptionMessage {
	type: SubscribeKind;
	subscriptionId: string;
	eventData: Uint8Array;
}

interface PublishMessage {
	type: PublishKind;
	publishId: string;
	eventData: Uint8Array;
}

interface Publish {
	callback?: PublishCallback;
}

interface Subscription {
	id: string;
	callback: SubscriptionCallback;
	options: SubscriptionOptions;
}

export class NostrManager {
	private worker: Worker;
	private subscriptions: Map<string, Subscription> = new Map();
	private publishes: Map<string, Publish> = new Map();

	constructor() {
		// check with vite if we are on the server
		if (import.meta.env.SSR) return;
		this.worker = new NostrWorker();
		this.setupWorkerHandlers();
	}

	private setupWorkerHandlers() {
		this.worker.onmessage = (event) => {
			if (!event.data) return;
			if (event.data.type === 'PUBLISH_STATUS') {
				this.onPublishEvent(event.data);
				return;
			}

			this.onSubscribeEvent(event.data);
		};
	}

	private onPublishEvent(data: PublishMessage) {
		const { type, publishId, eventData } = data;

		const publish = this.publishes.get(publishId);
		if (!publish) return;

		switch (type) {
			case 'PUBLISH_STATUS':
				this.handlePublishEvent(publishId, eventData, type);
				break;
		}
	}

	private onSubscribeEvent(data: SubscriptionMessage) {
		const { type, subscriptionId, eventData } = data as SubscriptionMessage;

		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		switch (type) {
			case 'CACHED_EVENT':
				console.debug('Received cached events');
				this.handleSubscriptionEvent(subscriptionId, eventData, 'CACHED_EVENT');
				break;
			case 'FETCHED_EVENT':
				console.debug('Received fetched events');
				this.handleSubscriptionEvent(subscriptionId, eventData, 'FETCHED_EVENT');
				break;
			case 'EOSE':
				console.debug(`End of stored events for subscription ${subscriptionId}`);
				this.handleSubscriptionEvent(subscriptionId, eventData, 'EOSE');
				if (subscription.options.closeOnEose) {
					this.unsubscribe(subscriptionId);
				}
				break;
			case 'EOCE':
				console.debug(`End of cached events for subscription ${subscriptionId}`);
				this.handleSubscriptionEvent(subscriptionId, eventData, 'EOCE');
				break;
		}
	}

	publish(publishId: string, event: EventTemplate, callback?: (status: RelayStatus) => void) {
		this.publishes.set(publishId, {
			callback
		});

		// Serialize to binary format
		const binaryData = msgpack.encode(event);

		// Send the publish request to the worker
		this.worker.postMessage({
			action: 'PUBLISH',
			publishId,
			event: binaryData
		});
	}
	// you can add a publish callback without publishing anything and just listen to an event update
	addPublishCallbackAll(callback: (status: RelayStatus) => void) {
		this.publishes.set('*', { callback });
	}

	subscribe(
		subscriptionId: string,
		requests: Request[],
		callback: SubscriptionCallback,
		options: SubscriptionOptions = {}
	): () => void {
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

	loginWithPrivateKey(pk: string): void {
		this.worker.postMessage({
			action: 'LOGIN',
			pk
		});
	}

	private async handleSubscriptionEvent(
		subscriptionId: string,
		eventData: Uint8Array,
		eventKind: SubscribeKind
	) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;
		const decodedEvent = eventData ? (msgpack.decode(eventData) as ParsedEvent<AnyKind>[]) : [];
		// Call the subscription callback with the fresh event
		subscription.callback(decodedEvent, eventKind);
	}

	private handlePublishEvent(
		publishId: string,
		eventData: Uint8Array,
		eventKind: PublishKind
	): void {
		const subscribe = this.publishes.get(publishId);
		const subscribeAll = this.publishes.get('*');
		if (!subscribe || !subscribeAll || !eventData) return;

		const decodedEvent = msgpack.decode(eventData) as RelayStatus;

		subscribe && subscribe.callback?.(decodedEvent, eventKind);
		subscribeAll && subscribeAll.callback?.(decodedEvent, publishId);
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
