import type { AnyKind, ParsedEvent } from 'src/types';
import init, {
	encodeAndPostMessage,
	type MainToWorkerMessage,
	type WorkerToMainMessage,
	type RelayStatusUpdate,
	type Request
} from 'src/model/nostr-main/pkg/nostr_main.js';
import nostrWorker from 'src/model/nostr-worker/index?worker';

import { decode, encode } from '@msgpack/msgpack';
import type { EOSE } from './pkg/nutscash_nostr_main';
import type { NostrEvent } from 'nostr-tools';

// Re-export types for external use
export type SubscribeKind = 'CACHED_EVENT' | 'FETCHED_EVENT' | 'COUNT' | 'EOSE' | 'EOCE';
export type PublishKind = 'PUBLISH_STATUS';

// export type Request = Filter & {
// 	relays: string[];
// 	closeOnEOSE?: boolean;
// 	cacheFirst?: boolean;
// 	noOptimize?: boolean;
// 	limit?: number;
// 	count?: boolean;
// 	noContext?: boolean;
// };

// Callback for subscription events
type SubscriptionCallback = (data: ParsedEvent<AnyKind>[] | number, type: SubscribeKind) => void;
type PublishCallback = (data: RelayStatusUpdate, type: PublishKind) => void;

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

export interface SubscriptionOptions {
	closeOnEose?: boolean;
	skipCache?: boolean;
	force?: boolean;
}

const wasmReady = init();

/**
 * Pure TypeScript NostrClient that manages worker communication and state.
 * Uses WASM utilities for heavy lifting (encoding, decoding, crypto).
 */
class NostrManager {
	private worker: Worker = new nostrWorker();
	private subscriptions = new Map<
		string,
		{ callback: SubscriptionCallback; options: SubscriptionOptions }
	>();
	private publishes = new Map<string, PublishCallback>();
	private signers = new Map<string, string>(); // name -> secret key hex

	constructor() {
		this.setupWorkerListener();
	}

	private setupWorkerListener() {
		this.worker.onmessage = async (event) => {
			await wasmReady;
			// console.log('new message received', event.data);
			if (event.data instanceof Uint8Array) {
				let uint8Array = event.data;
				try {
					const message: any = decode(uint8Array);
					this.handleWorkerMessage(message);
				} catch (error) {
					console.error('Failed to decode worker message:', error);
				} finally {
					// Aggressively clear memory references
					if (uint8Array) {
						uint8Array.fill(0);
						uint8Array = null;
					}
				}
			} else {
				console.log('Received non-arrayBuffer message:', event.data);
			}
		};

		this.worker.onerror = (error) => {
			console.error('Worker error:', error);
		};
	}

	private handleWorkerMessage(message: WorkerToMainMessage) {
		if ('SubscriptionEvent' in message) {
			console.log('Received message:', message);
			this.handleSubscriptionEvent(
				message.SubscriptionEvent.subscription_id,
				message.SubscriptionEvent.event_data,
				message.SubscriptionEvent.event_type
			);
		} else if ('PublishStatus' in message) {
			this.handlePublishStatus(message.PublishStatus.publish_id, message.PublishStatus.status);
		} else if ('Count' in message) {
			this.handleSubscriptionCount(message.Count.subscription_id, message.Count.count);
		} else if ('Eose' in message) {
			console.log('Eose received:', message.Eose.subscription_id, message.Eose.data);
			this.handleSubscriptionEose(message.Eose.subscription_id, message.Eose.data);
		} else if ('Eoce' in message) {
			this.handleSubscriptionEoce(message.Eoce.subscription_id);
		} else if ('SignedEvent' in message) {
			this.handleSignedEvent(message.SignedEvent.content, message.SignedEvent.signed_event);
		} else if ('PublicKey' in message) {
			this.handlePublicKey(message.PublicKey.public_key);
		} else if ('Debug' in message) {
			console.debug('Worker debug:', message.Debug.message, message.Debug.data);
		} else {
			console.warn('Unknown message type from worker:', message);
		}
	}

	private handleSubscriptionEvent(
		subId: string,
		eventData: ParsedEvent<AnyKind>[][],
		eventType: SubscribeKind
	) {
		const subscription = this.subscriptions.get(subId);
		if (!subscription) return;
		try {
			for (const events of eventData) {
				subscription.callback(events, eventType);
			}
		} catch (error) {
			console.error('Failed to parse events:', error);
		}
	}

	private handlePublishStatus(publishId: string, statuses: RelayStatusUpdate[]) {
		const publishCallback = this.publishes.get(publishId);
		if (!publishCallback) return;

		// Handle the first status for now
		if (statuses.length > 0) {
			publishCallback(statuses[0], 'PUBLISH_STATUS');
		}
	}

	private handleSubscriptionEose(subId: string, data: EOSE) {
		const subscription = this.subscriptions.get(subId);
		if (!subscription) return;

		subscription.callback(data, 'EOSE');

		// Auto-close subscription if requested
		if (subscription.options.closeOnEose) {
			this.unsubscribe(subId);
		}
	}

	private handleSubscriptionEoce(subId: string) {
		const subscription = this.subscriptions.get(subId);
		if (!subscription) return;

		subscription.callback([], 'EOCE');
	}

	private handleSubscriptionCount(subId: string, count: number) {
		const subscription = this.subscriptions.get(subId);
		if (!subscription) return;

		subscription.callback(count, 'COUNT');
	}

	private handleSignedEvent(content: string, signedEvent: any) {
		console.log('Signed event received:', content, signedEvent);
	}

	private handlePublicKey(publicKey: string) {
		console.log('Public key received:', publicKey);
	}

	/**
	 * Create a deterministic short string (< 64 chars) from input using hash
	 */
	private createShortId(input: string): string {
		// Simple hash function for deterministic short IDs
		let hash = 0;
		for (let i = 0; i < input.length; i++) {
			const char = input.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}

		// Convert to base36 and ensure it's under 64 characters
		const shortId = Math.abs(hash).toString(36);
		return shortId.substring(0, 63); // Ensure max 63 characters
	}

	/**
	 * Subscribe to events matching the given filters
	 */
	subscribe(
		subscriptionId: string,
		requests: Request[],
		callback: SubscriptionCallback,
		options: SubscriptionOptions = {}
	): () => void {
		const subId = subscriptionId.length < 64 ? subscriptionId : this.createShortId(subscriptionId);
		const defaultOptions: SubscriptionOptions = {
			closeOnEose: false,
			skipCache: false,
			force: false,
			...options
		};

		this.subscriptions.set(subId, { callback, options: defaultOptions });

		const message: MainToWorkerMessage = {
			Subscribe: {
				subscription_id: subId,
				requests: requests
			}
		};

		try {
			const pack = encode(message);
			this.worker.postMessage(pack);
			return () => this.unsubscribe(subId);
		} catch (error) {
			this.subscriptions.delete(subId);
			throw error;
		}
	}

	/**
	 * Unsubscribe from a subscription
	 */
	private unsubscribe(subId: string): void {
		this.subscriptions.delete(subId);

		const message: MainToWorkerMessage = {
			Unsubscribe: {
				subscription_id: subId
			}
		};
		const pack = encode(message);
		this.worker.postMessage(pack);
	}

	/**
	 * Publish an event
	 */
	publish(eventJson: string, callback?: PublishCallback) {
		try {
			const event = JSON.parse(eventJson);
			const eventId = event.id;

			if (callback) {
				this.publishes.set(eventId, callback);
			}

			const message: MainToWorkerMessage = {
				Publish: {
					publish_id: eventId,
					event: JSON.parse(eventJson)
				}
			};

			encode(this.worker, message);
			this.worker.postMessage(pack);
		} catch (error) {
			console.error('Failed to publish event:', error);
			throw error;
		}
	}

	/**
	 * Set a signer for signing events
	 */
	setSigner(name: string, secretKeyHex: string): void {
		const message: MainToWorkerMessage = {
			SetSigner: {
				signer_type: name,
				private_key: secretKeyHex
			}
		};

		const pack = encode(this.worker, message);
		this.worker.postMessage(pack);
		this.signers.set(name, secretKeyHex);
	}

	/**
	 * Sign an event using a stored signer
	 */
	signEvent(event: NostrEvent) {
		const message: MainToWorkerMessage = {
			SignEvent: {
				event: event
			}
		};
		const pack = encode(this.worker, message);
		this.worker.postMessage(pack);
	}

	/**
	 * Get public key for a stored signer
	 */
	getPublicKey(signerName: string) {
		const message: MainToWorkerMessage = {
			GetPublicKey: {}
		};
		const pack = encode(this.worker, message);
		this.worker.postMessage(pack);
	}

	addPublishCallbackAll() {}
}

// Re-export the client class for direct instantiation if needed
export const nostrManager = new NostrManager();
