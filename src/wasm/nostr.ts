import './wasm_exec.js'; // Path to wasm_exec.js
import { openDB } from 'idb';
import * as msgpack from '@msgpack/msgpack';
import { get } from 'svelte/store';
import { signer } from 'src/stores/signer.js';
import type { NostrEvent } from 'nostr-tools';

// Initialize WASM and export it as a promise
export const initNostrWasm = async () => {
	const go = new Go();
	self.openDB = openDB;
	return await new Promise(async (resolve, reject) => {
		try {
			// Define the initialization callback
			self.nostrWasmInitialized = (info: any) => {
				console.log('WASM initialization complete:', info, self);

				// Return the API
				resolve({
					openSubscription: (subscriptionId: string, requests: BinaryData) => {
						return self.openSubscription(subscriptionId, requests);
					},
					closeSubscription: (subscriptionId: string) => {
						return self.closeSubscription(subscriptionId);
					},
					publishEvent: (event: BinaryData) => {
						return self.publishEvent(event);
					},
					loginWithPrivateKey: (privateKey: string) => {
						return self.loginWithPrivateKey(privateKey);
					}
				});
			};
			// Load the WebAssembly module
			const result = await WebAssembly.instantiateStreaming(
				fetch('/main.wasm'), // Path relative to the root of your site
				go.importObject
			);

			// Run the Go WASM instance
			go.run(result.instance);
		} catch (error) {
			console.error('Failed to initialize WASM:', error);
			throw error;
		}
	});
};

// Pre-initialize for top-level await usage
const nostrWasm = initNostrWasm();

// Handle messages from the main thread
self.onmessage = async function (e) {
	const { action, subscriptionId, requests, event, pk } = e.data;
	const nostr = await nostrWasm;

	try {
		switch (action) {
			case 'PUBLISH':
				console.log('nostr.publishEvent(event);');
				nostr.publishEvent(event);
				break;

			case 'SUBSCRIBE':
				nostr.openSubscription(subscriptionId, requests);
				break;

			case 'UNSUBSCRIBE':
				nostr.closeSubscription(subscriptionId);
				break;

			case 'LOGIN':
				if (pk) {
					nostr.loginWithPrivateKey(pk);
				}
				break;
		}
	} catch (err) {
		console.error(err);
		self.postMessage({
			type: 'error',
			error: err,
			action: action,
			subscriptionId: subscriptionId
		});
	}
};

self.signNostrEventSync = function (eventData: Uint8Array): Uint8Array | null {
	try {
		// Decode the event data from MessagePack
		const event = msgpack.decode(new Uint8Array(eventData)) as NostrEvent;

		const signedEvent = get(signer)?.signEvent(event);

		// Encode the signed event back to MessagePack
		const signedEventData = msgpack.encode(signedEvent);

		// Return the signed event data as a Uint8Array
		return new Uint8Array(signedEventData);
	} catch (error) {
		console.error('Error signing event:', error);
		// Return null to indicate an error
		return null;
	}
};
