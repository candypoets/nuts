import { openDB } from 'idb';
import type { EventTemplate } from 'nostr-tools';

import 'src/model/wasm_exec.js'; // Path to wasm_exec.js

export type SignerType = string;

// Enum-like object for SignerType
export const SignerTypes = {
	PK: 'privkey' as SignerType
	// SignerTypeNone: "none" as SignerType
} as const;

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
					setSigner: (type: SignerType, privateKey: string) => {
						return self.setSigner(type, privateKey);
					},
					signEvent: (event: EventTemplate) => {
						return self.signEvent(event);
					},
					getPublicKey: () => {
						return self.getPublicKey();
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
			case 'SET_SIGNER':
				const { type, pk } = e.data;
				console.log('SET_SIGNER', type, pk);
				nostr.setSigner(type, pk);
				break;
			case 'SIGN_EVENT':
				console.log('SIGN_EVENT', e.data.event);
				nostr.signEvent(e.data.event);
				break;
			case 'GET_PUBKEY':
				nostr.getPublicKey();
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
