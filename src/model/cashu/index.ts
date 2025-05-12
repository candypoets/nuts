import { openDB } from 'idb';

import 'src/model/wasm_exec.js'; // Path to wasm_exec.js

// Initialize WASM and export it as a promise
export const initCashuWasm = async () => {
	const go = new Go();
	self.openDB = openDB;

	return await new Promise(async (resolve, reject) => {
		try {
			// Define the initialization callback
			self.cashuWasmInitialized = (info: any) => {
				console.log('cashu WASM initialization complete:', info, self);

				// Return the API
				resolve({
					callWallet: (requestId: string, walletKey: string, method: string, params: any[]) => {
						return self.callWalletMethod(requestId, walletKey, method, ...params);
					},
					createWallet: (secret: string, mintURL: string) => {
						return self.createCashuWallet(secret, mintURL);
					}
				});
			};
			// Load the WebAssembly module
			const result = await WebAssembly.instantiateStreaming(
				fetch('/cashu.wasm'), // Path relative to the root of your site
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
const cashuWasm = initCashuWasm();

// Handle messages from the main thread
self.onmessage = async function (e) {
	const { action, subscriptionId } = e.data;
	const cashu = await cashuWasm;
	try {
		switch (action) {
			case 'WALLET':
				const { requestId, params, walletKey, method } = e.data;
				cashu.callWallet(requestId, walletKey, method, params);
				break;
			case 'CREATE_WALLET':
				const { secret, mintURLs } = e.data;
				cashu.createWallet(secret, mintURLs);
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
