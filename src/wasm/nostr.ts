import { openDB } from 'idb';
import './wasm_exec.js'; // Path to wasm_exec.js

// Initialize WASM and export it as a promise
export const initNostrWasm = async () => {
	const go = new Go();
	self.openDB = openDB;

	// dbPromise.then((db) => console.log('wallet', db));
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
					callWallet: (requestId: string, walletKey: string, method: string, params: any[]) => {
						return self.callWalletMethod(requestId, walletKey, method, ...params);
					},
					createWallet: (secret: string, mintURL: string) => {
						return self.createCashuWallet(secret, mintURL);
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
			case 'WALLET':
				const { requestId, params, walletKey, method } = e.data;
				nostr.callWallet(requestId, walletKey, method, params);
				break;
			case 'CREATE_WALLET':
				const { secret, mintURLs } = e.data;
				nostr.createWallet(secret, mintURLs);
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
