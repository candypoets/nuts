import './wasm_exec.js'; // Path to wasm_exec.js
import { openDB } from 'idb';
// Initialize WASM and export it as a promise
export const initNostrWasm = async () => {
	const go = new Go();
	self.openDB = openDB;
	return await new Promise(async (resolve, reject) => {
		try {
			// Define the initialization callback
			self.nostrWasmInitialized = (info: any) => {
				console.log('WASM initialization complete:', info);

				// Return the API
				resolve({
					openSubscription: (subscriptionId: string, requests: BinaryData, callback: Function) => {
						console.log('openSubscription called', subscriptionId);
						return self.openSubscription(subscriptionId, requests, callback);
					},
					closeSubscription: (subscriptionId: string) => {
						return self.closeSubscription(subscriptionId);
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
	const { action, subscriptionId, requests } = e.data;
	const nostr = await nostrWasm;

	try {
		switch (action) {
			case 'SUBSCRIBE':
				nostr.openSubscription(
					subscriptionId,
					requests,
					function (eventType: string, eventData: any) {
						// Forward events back to the main thread
						self.postMessage({
							type: eventType,
							subscriptionId: subscriptionId,
							eventData: eventData
						});
					}
				);
				break;

			case 'UNSUBSCRIBE':
				nostr.closeSubscription(subscriptionId);
				break;

			default:
				nostr.openSubscription(
					subscriptionId,
					requests,
					function (eventType: string, eventData: any) {
						// Forward events back to the main thread
						self.postMessage({
							type: eventType,
							subscriptionId: subscriptionId,
							eventData: eventData
						});
					}
				);
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
