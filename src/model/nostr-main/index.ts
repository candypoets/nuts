import type { AnyKind, ParsedEvent } from 'src/types';
import init, {
	encodeAndPostMessage,
	type MainToWorkerMessage,
	type WorkerToMainMessage,
	type RelayStatusUpdate,
	type Request
} from 'src/model/nostr-main/pkg/nostr_main.js';
import nostrWorker from 'src/model/nostr-worker/index?worker';
import { SharedBufferReader } from 'src/lib/sharedBuffer';

import { decode, encode } from '@msgpack/msgpack';
import type { EOSE } from './pkg/nutscash_nostr_main';
import type { NostrEvent } from 'nostr-tools';
import { writable, type Writable } from 'svelte/store';
import { pack } from 'msgpackr';

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

// Callback for subscription events (kept for backwards compatibility)
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
		{ buffer: SharedArrayBuffer; options: SubscriptionOptions; refCount: number }
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
		if ('PublishStatus' in message) {
			console.log(
				'PublishStatus received:',
				message.PublishStatus.publish_id,
				message.PublishStatus.status
			);
			this.handlePublishStatus(message.PublishStatus.publish_id, message.PublishStatus.status);
		} else if ('Count' in message) {
			this.handleSubscriptionCount(message.Count.subscription_id, message.Count.count);
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

	private handlePublishStatus(publishId: string, statuses: RelayStatusUpdate[]) {
		const publishCallback = this.publishes.get(publishId);
		console.log('publishCallback', publishCallback);
		if (!publishCallback) {
			const publishAllCallback = this.publishes.get('*');
			return publishAllCallback && publishAllCallback(statuses[0], 'PUBLISH_STATUS');
		}

		// Handle the first status for now
		if (statuses.length > 0) {
			publishCallback(statuses[0], 'PUBLISH_STATUS');
		}
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
		options: SubscriptionOptions = {}
	): SharedArrayBuffer {
		const subId = subscriptionId.length < 64 ? subscriptionId : this.createShortId(subscriptionId);

		// Check if subscription already exists
		const existingSubscription = this.subscriptions.get(subId);
		if (existingSubscription) {
			// Increment reference count for existing subscription
			existingSubscription.refCount++;
			return existingSubscription.buffer;
		}

		const defaultOptions: SubscriptionOptions = {
			closeOnEose: false,
			skipCache: false,
			force: false,
			...options
		};

		// Calculate buffer size based on request limits
		const totalLimit = requests.reduce((sum, req) => sum + (req.limit || 100), 0);
		const bufferSize = SharedBufferReader.calculateBufferSize(totalLimit);

		// Create SharedArrayBuffer for this subscription
		const buffer = new SharedArrayBuffer(bufferSize);

		// Initialize header (write position = 4, meaning no data yet, just header)
		const view = new DataView(buffer);
		view.setUint32(0, 4, true); // Little endian

		this.subscriptions.set(subId, { buffer, options: defaultOptions, refCount: 1 });

		const message: MainToWorkerMessage = {
			Subscribe: {
				subscription_id: subId,
				requests: requests
			}
		};

		try {
			const pack = encode(message);
			// Pass SharedArrayBuffer as transferable object alongside the serialized message
			this.worker.postMessage({
				serializedMessage: pack,
				sharedBuffer: buffer
			});
			return buffer;
		} catch (error) {
			this.subscriptions.delete(subId);
			throw error;
		}
	}

	/**
	 * Unsubscribe from a subscription
	 */
	unsubscribe(subId: string): void {
		const subscription = this.subscriptions.get(subId);
		if (subscription) {
			subscription.refCount--;
		}
	}

	/**
	 * Publish an event
	 */
	publish(publish_id: string, event: NostrEvent, callback?: PublishCallback) {
		try {
			if (callback) {
				this.publishes.set(publish_id, callback);
			}

			const template = {
				kind: event.kind,
				content: event.content,
				tags: event.tags || []
			};

			console.log(template);

			const message: MainToWorkerMessage = {
				Publish: {
					publish_id: publish_id,
					template
				}
			};

			const p = encode(message);
			this.worker.postMessage(p);
		} catch (error) {
			console.error('Failed to publish event:', error);
			throw error;
		}
	}

	/**
	 * Set a signer for signing events
	 */
	setSigner(name: string, secretKeyHex: string): void {
		console.log('SET_SIGNER', name, secretKeyHex);
		const message: MainToWorkerMessage = {
			SetSigner: {
				signer_type: name,
				private_key: secretKeyHex
			}
		};

		const pack = encode(message);
		this.worker.postMessage(pack);
		this.signers.set(name, secretKeyHex);
	}

	/**
	 * Sign an event using a stored signer
	 */
	signEvent(event: NostrEvent) {
		const template = {
			kind: event.kind,
			content: event.content,
			tags: event.tags
		};

		const message: MainToWorkerMessage = {
			SignEvent: {
				template: template
			}
		};
		const pack = encode(message);
		this.worker.postMessage(pack);
	}

	/**
	 * Get public key for a stored signer
	 */
	getPublicKey(signerName: string) {
		const message: MainToWorkerMessage = {
			GetPublicKey: {}
		};
		const pack = encode(message);
		this.worker.postMessage(pack);
	}

	addPublishCallbackAll(callback: (status: RelayStatusUpdate, eventId: string) => void) {
		this.publishes.set('*', callback);
	}

	/**
	 * Clean up subscriptions with zero or negative reference counts
	 */
	cleanup(): void {
		const subscriptionsToDelete: string[] = [];

		// Find subscriptions with zero or negative reference counts
		for (const [subId, subscription] of this.subscriptions.entries()) {
			if (subscription.refCount <= 0) {
				subscriptionsToDelete.push(subId);
			}
		}

		// Clean up each subscription
		for (const subId of subscriptionsToDelete) {
			const subscription = this.subscriptions.get(subId);
			if (subscription) {
				// Send unsubscribe message to worker
				const message: MainToWorkerMessage = {
					Unsubscribe: {
						subscription_id: subId
					}
				};
				const pack = encode(message);
				this.worker.postMessage(pack);

				// Remove from subscriptions map (this removes main thread's reference)
				this.subscriptions.delete(subId);

				// Note: The SharedArrayBuffer will be garbage collected once both
				// the main thread (above) and worker thread (via Unsubscribe message)
				// drop their references to it
			}
		}
	}
}

// Re-export the client class for direct instantiation if needed
export const nostrManager = new NostrManager();

/**
 * Clean up subscriptions with zero or negative reference counts
 */
export function cleanup(): void {
	nostrManager.cleanup();
}

export function useSharedSubscription(
	subId: string,
	requests: Request[],
	callback: any = () => {},
	options = { closeOnEose: false }
) {
	if (!subId) {
		console.warn('useSharedSubscription: No subscription ID provided');
		return () => {};
	}
	let buffer: SharedArrayBuffer | null = null;
	let lastReadPos: number = 4;
	let timeoutId: number | null = null;
	let pollInterval: number = 15; // Start at 5ms - very aggressive
	const maxInterval: number = 4000; // Max 4 seconds
	let running: boolean = true;

	if (requests.length > 0) {
		buffer = nostrManager.subscribe(subId, requests, options);

		const processEvents = (): void => {
			console.log('processEvents');
			if (!running || !buffer) {
				if (timeoutId !== null) {
					clearTimeout(timeoutId);
				}
				return;
			}

			const result = SharedBufferReader.readMessages(buffer, lastReadPos);

			if (result.hasNewData) {
				// Found new data - reset to aggressive polling
				pollInterval = 5;

				result.messages.forEach((message: WorkerToMainMessage) => {
					if ('SubscriptionEvent' in message) {
						message.SubscriptionEvent.event_data.forEach((event) => {
							callback(event, message.SubscriptionEvent.event_type);
						});
					} else if ('Eose' in message) {
						if (options.closeOnEose) {
							console.log('close');
							running = false;
							timeoutId && clearTimeout(timeoutId);
						}
						callback(message.Eose.data, 'EOSE');
					} else if ('Eoce' in message) {
						callback([], 'EOCE');
					}
				});
				lastReadPos = result.newReadPosition;
			} else {
				// No new data - back off exponentially (faster backoff)
				pollInterval = Math.min(pollInterval * 2, maxInterval);
			}

			// Clear any existing timeout before scheduling a new one
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
			}

			// Schedule next poll
			timeoutId = window.setTimeout(processEvents, pollInterval);
		};

		// Start after a minimal delay to ensure the return function is available
		timeoutId = window.setTimeout(processEvents, 0);
	}

	return (): void => {
		console.log('kill', subId);
		running = false;
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
		nostrManager.unsubscribe(subId);
	};
}
