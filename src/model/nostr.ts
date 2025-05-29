import * as msgpack from '@msgpack/msgpack';
import type { EventTemplate, Filter, NostrEvent } from 'nostr-tools';
import type { AnyKind } from 'src/types';
import nostrWorker from 'src/model/nostr/index?worker';

import type { ParsedEvent } from 'src/types';
import { debug } from 'src/controller/debug';

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
	closeOnEOSE?: boolean;
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

interface Zap {
	id: string;
	callback: any;
}

export class NostrManager {
	private worker!: Worker;
	private subscriptions: Map<string, Subscription> = new Map();
	private zaps: Map<string, (result: string) => void> = new Map();
	private signers: Map<string, (result: string | NostrEvent) => void> = new Map();
	private publishes: Map<string, Publish> = new Map();

	constructor() {
		// check with vite if we are on the server
		if (import.meta.env.SSR) return;
		this.worker = new nostrWorker();
		this.setupWorkerHandlers();
	}

	private setupWorkerHandlers() {
		this.worker.onmessage = (event) => {
			if (!event.data) return;
			if (event.data.type === 'PUBLISH_STATUS') {
				this.onPublishEvent(event.data);
				return;
			} else if (event.data.type === 'ZAP') {
				const cb = this.zaps.get(event.data.zapId);
				if (cb) {
					cb(event.data.payload);
					this.zaps.delete(event.data.zapId);
				}
			} else if (event.data.type == 'SIGNED') {
				const payload = msgpack.decode(event.data.payload) as NostrEvent;
				const cb = this.signers.get(payload?.content);
				if (cb) {
					console.log(payload);
					cb(payload);
					this.signers.delete(payload.content);
				}
			} else if (event.data.type == 'DEBUG') {
				debug.set(event.data);
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
				console.debug('Received cached events batch');
				this.handleCachedEventsBatch(subscriptionId, eventData);
				break;
			case 'FETCHED_EVENT':
				console.debug('Received fetched events batch');
				this.handleFetchedEventsBatch(subscriptionId, eventData);
				break;
			case 'EOSE':
				console.debug(`End of stored events for subscription ${subscriptionId}`);
				this.handleEOSE(subscriptionId, eventData);
				if (subscription.options.closeOnEose) {
					this.unsubscribe(subscriptionId);
				}
				break;
			case 'EOCE':
				console.debug(`End of cached events for subscription ${subscriptionId}`);
				this.handleEOCE(subscriptionId);
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

	// get a zap invoice
	async zap(zapId: string, template: EventTemplate): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			// Register the callback
			this.zaps.set(zapId, (result: string) => {
				if (!result.startsWith('ln')) {
					reject(result);
				} else {
					resolve(result);
				}
			});

			// Call the wallet method via the global function
			try {
				this.worker.postMessage({
					action: 'ZAP',
					zapId,
					template: JSON.stringify(template)
				});
			} catch (err) {
				this.zaps.delete(zapId); // Clean up
				reject(new Error(`Failed to get zap invoice ${zapId}: ${err}`));
			}
		});
	}

	setSigner(type: string, pk: string): void {
		console.log('setsigner', type, pk);
		this.worker.postMessage({
			action: 'SET_SIGNER',
			type,
			pk
		});
	}

	async signEvent(event: EventTemplate): Promise<NostrEvent> {
		return new Promise<NostrEvent>((resolve, reject) => {
			// Register the callback
			this.signers.set(event.content, (result: NostrEvent | string) => {
				resolve(result as NostrEvent);
			});

			const binaryData = msgpack.encode(event);

			try {
				this.worker.postMessage({
					action: 'SIGN_EVENT',
					event: binaryData
				});
			} catch (err) {
				this.signers.delete(event.content); // Clean up
				reject(new Error(`Failed to get sign event ${event.content} ${err}`));
			}
		});
	}

	private handleCachedEventsBatch(subscriptionId: string, eventData: Uint8Array) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		// Decode the entire batch once
		const cachedEventsBatch = eventData ? (msgpack.decode(eventData) as ParsedEvent<AnyKind>[][]) : [];
		
		// Stream each event group one by one to the subscription
		for (const events of cachedEventsBatch) {
			subscription.callback(events, 'CACHED_EVENT');
		}
	}

	private handleFetchedEventsBatch(subscriptionId: string, eventData: Uint8Array) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		// Decode the entire batch once
		const fetchedEventsBatch = eventData ? (msgpack.decode(eventData) as ParsedEvent<AnyKind>[][]) : [];
		
		// Stream each event group one by one to the subscription
		for (const events of fetchedEventsBatch) {
			subscription.callback(events, 'FETCHED_EVENT');
		}
	}

	private handleEOSE(subscriptionId: string, eventData: Uint8Array) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;
		
		// EOSE contains EOSE data, not events
		const eoseData = eventData ? msgpack.decode(eventData) : null;
		subscription.callback([], 'EOSE');
	}

	private handleEOCE(subscriptionId: string) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;
		
		// EOCE doesn't contain data
		subscription.callback([], 'EOCE');
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
		subscribeAll && subscribeAll.callback?.(decodedEvent, eventKind);
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
