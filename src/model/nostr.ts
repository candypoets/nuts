import * as msgpack from '@msgpack/msgpack';
import type { EventTemplate, Filter, NostrEvent } from 'nostr-tools';
import type { AnyKind } from 'src/types';
import nostrWorker from 'src/model/nostr-rust/index?worker';

import type { ParsedEvent } from 'src/types';
import { debug } from 'src/controller/debug';
import { wasmMsgpack } from 'src/lib/wasm-msgpack-decoder';

export type SubscribeKind = 'CACHED_EVENT' | 'FETCHED_EVENT' | 'COUNT' | 'EOSE' | 'EOCE';
export type PublishKind = 'PUBLISH_STATUS';
// Callback for subscription events
// - For 'CACHED_EVENT' and 'FETCHED_EVENT': data is ParsedEvent[] (only the first event is from the request, others are contextual)
// - For 'COUNT': data is number representing the count of matching events
// - For 'EOSE' and 'EOCE': data format varies
type SubscriptionCallback = (data: ParsedEvent<AnyKind>[] | number, type: SubscribeKind) => void;

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
	count?: boolean;
	noContext?: boolean;
};

interface SubscriptionOptions {
	closeOnEose?: boolean;
	skipCache?: boolean;
	force?: boolean; // force a new subscription if one already exists
}

interface SubscriptionMessage {
	type: SubscribeKind;
	subscriptionId: string;
	eventData: any;
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
		this.worker.onmessage = async (event) => {
			console.log('event', event);
			if (!event.data) return;
			let decodedMessage = event.data;
			if (event.data instanceof Uint8Array) {
				try {
					// Decode the MessagePack data
					decodedMessage = await wasmMsgpack.decode(event.data);
				} catch (error) {
					console.error('Failed to decode transferable message:', error);
					return;
				}
			}
			if (decodedMessage.type === 'PUBLISH_STATUS') {
				await this.onPublishEvent(decodedMessage);
				return;
			} else if (decodedMessage.type === 'ZAP') {
				const cb = this.zaps.get(decodedMessage.zapId);
				if (cb) {
					cb(decodedMessage.payload);
					this.zaps.delete(decodedMessage.zapId);
				}
			} else if (decodedMessage.type == 'SIGNED') {
				const payload = (await wasmMsgpack.decode(decodedMessage.payload)) as NostrEvent;
				const cb = this.signers.get(payload?.content);
				if (cb) {
					cb(payload);
					this.signers.delete(payload.content);
				}
			} else if (decodedMessage.type == 'DEBUG') {
				debug.set(decodedMessage);
			}

			await this.onSubscribeEvent(decodedMessage);
		};
	}

	private async onPublishEvent(data: PublishMessage) {
		const { type, publishId, eventData } = data;

		const publish = this.publishes.get(publishId);
		if (!publish) return;

		switch (type) {
			case 'PUBLISH_STATUS':
				await this.handlePublishEvent(publishId, eventData, type);
				break;
		}
	}

	private async onSubscribeEvent(data: SubscriptionMessage) {
		const { type, subscriptionId, eventData } = data as SubscriptionMessage;

		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		switch (type) {
			case 'CACHED_EVENT':
				await this.handleCachedEventsBatch(subscriptionId, eventData);
				break;
			case 'FETCHED_EVENT':
				await this.handleFetchedEventsBatch(subscriptionId, eventData);
				break;
			case 'COUNT':
				await this.handleCount(subscriptionId, eventData);
				break;
			case 'EOSE':
				await this.handleEOSE(subscriptionId, eventData);
				if (subscription.options.closeOnEose) {
					this.unsubscribe(subscriptionId);
				}
				break;
			case 'EOCE':
				this.handleEOCE(subscriptionId);
				break;
		}
	}

	async publish(publishId: string, event: EventTemplate, callback?: (status: RelayStatus) => void) {
		this.publishes.set(publishId, {
			callback
		});

		// Serialize to binary format using WASM
		const binaryData = await wasmMsgpack.encode(event);

		// Send the publish request to the worker using transferables
		this.worker.postMessage(
			{
				action: 'PUBLISH',
				publishId,
				event: binaryData
			},
			[binaryData.buffer]
		);
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

		if (subscriptionId.length > 64) {
			// console.error(`Subscription ID is too long: ${subscriptionId}`);
			// throw new Error(`Subscription ID is too long: ${subscriptionId}`);
			// If the subscription ID is too long, hash it to a shorter fixed length
			const shortenId = (id: string): string => {
				const encoder = new TextEncoder();
				const data = encoder.encode(id);

				// Simple FNV-1a hash implementation for string shortening
				let hash = 2166136261; // FNV offset basis
				for (let i = 0; i < data.length; i++) {
					hash ^= data[i];
					hash *= 16777619; // FNV prime
				}

				// Convert to hex string and take first 32 chars (128 bits)
				return hash.toString(16).padStart(16, '0').substring(0, 32);
			};

			const shorten = shortenId(subscriptionId);
			console.log(`Subscription ID ${subscriptionId} was too long. Using shortened ID: ${shorten}`);
			subscriptionId = shorten;
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

		// Serialize to binary format using WASM
		wasmMsgpack.encode(requests).then((binaryData) => {
			// Start the subscription in the worker using transferables
			this.worker.postMessage(
				{
					action: 'SUBSCRIBE',
					subscriptionId,
					requests: binaryData
				},
				[binaryData.buffer]
			);
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

	setSigner(type: string, pk: string): void {
		this.worker.postMessage({
			action: 'SET_SIGNER',
			type,
			pk
		});
	}

	async signEvent(event: EventTemplate): Promise<NostrEvent> {
		return new Promise<NostrEvent>(async (resolve, reject) => {
			// Register the callback
			this.signers.set(event.content, (result: NostrEvent | string) => {
				resolve(result as NostrEvent);
			});

			try {
				const binaryData = await wasmMsgpack.encode(event);

				this.worker.postMessage(
					{
						action: 'SIGN_EVENT',
						event: binaryData
					},
					[binaryData.buffer]
				);
			} catch (err) {
				this.signers.delete(event.content); // Clean up
				reject(new Error(`Failed to get sign event ${event.content} ${err}`));
			}
		});
	}

	private async handleCachedEventsBatch(subscriptionId: string, eventData: Uint8Array) {
		// console.log('cached event', subscriptionId, eventData);
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		// Stream each event group one by one to the subscription
		for (const events of eventData) {
			subscription.callback(events, 'CACHED_EVENT');
		}
	}

	private async handleFetchedEventsBatch(subscriptionId: string, eventData: any) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;
		// console.log('FETCHED_EVENT', subscriptionId, eventData[0]);
		subscription.callback(eventData, 'FETCHED_EVENT');
	}

	private async handleEOSE(subscriptionId: string, eventData: any) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		subscription.callback(eventData, 'EOSE');
	}

	private async handleCount(subscriptionId: string, eventData: Uint8Array) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		// COUNT contains a number, not events
		const count = eventData ? await wasmMsgpack.decode(eventData) : 0;
		subscription.callback(count, 'COUNT');
	}

	private handleEOCE(subscriptionId: string) {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		// EOCE doesn't contain data
		subscription.callback([], 'EOCE');
	}

	private async handlePublishEvent(
		publishId: string,
		eventData: Uint8Array,
		eventKind: PublishKind
	): Promise<void> {
		const subscribe = this.publishes.get(publishId);
		const subscribeAll = this.publishes.get('*');
		if (!subscribe || !subscribeAll || !eventData) return;

		const decodedEvent = (await wasmMsgpack.decode(eventData)) as RelayStatus;

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
