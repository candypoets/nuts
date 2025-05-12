import { openDB } from 'idb';
import type { EventTemplate } from 'nostr-tools';

import 'src/model/wasm_exec.js'; // Path to wasm_exec.js

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
					publishEvent: (publishId: string, event: BinaryData) => {
						return self.publishEvent(publishId, event);
					},
					zap: (zapId: string, template: EventTemplate) => {
						return self.zap(zapId, template);
					},
					loginWithPrivateKey: (privateKey: string) => {
						return self.loginWithPrivateKey(privateKey);
					}
				});
			};
			// Load the WebAssembly module
			const result = await WebAssembly.instantiateStreaming(
				fetch('/nostr.wasm'), // Path relative to the root of your site
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
	const { action, subscriptionId, publishId, requests, event, pk } = e.data;
	const nostr = await nostrWasm;
	try {
		switch (action) {
			case 'PUBLISH':
				nostr.publishEvent(publishId, event);
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
			case 'ZAP':
				const { zapId, template } = e.data;
				nostr.zap(zapId, template);
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
