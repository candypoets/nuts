import { openDB } from 'idb';
import init, { NostrClient, WasmSignerManager, EOSE } from './pkg/nutscash_nostr.js';

export type SignerType = string;

// Enum-like object for SignerType
export const SignerTypes = {
	PK: 'privkey' as SignerType
	// SignerTypeNone: "none" as SignerType
} as const;

let signer: WasmSignerManager;
let client: NostrClient;

// Initialize WASM and export it as a promise
const initNostrWasm = async () => {
	self.openDB = openDB;

	try {
		await init();

		client = await new NostrClient();
		signer = new WasmSignerManager();

		console.log('WASM module initialized successfully');
	} catch (error) {
		console.error('Failed to initialize WASM module:', error);
		throw error;
	}
};

const initNostr = initNostrWasm();

// Handle messages from the main thread
self.onmessage = async function (e) {
	const { action, subscriptionId, publishId, requests, event, pk } = e.data;

	await initNostr;

	console.log('new message: ', action, client);
	if (!client) {
		console.error('Nostr client is undefined');
		throw new Error('Nostr client is undefined');
	}
	try {
		switch (action) {
			case 'PUBLISH':
				client.publishEvent(publishId, event);
				break;

			case 'SUBSCRIBE':
				console.log('SUBSCRIBE', subscriptionId, requests);
				client.openSubscription(subscriptionId, requests);
				break;

			case 'UNSUBSCRIBE':
				client.closeSubscription(subscriptionId);
				break;

			// case 'LOGIN':
			// 	if (pk) {
			// 		client.loginWithPrivateKey(pk);
			// 	}
			// 	break;
			case 'SET_SIGNER':
				const { type, pk } = e.data;
				console.log('SET_SIGNER', type, pk);
				signer.setSigner(type, pk);
				break;
			case 'SIGN_EVENT':
				console.log('SIGN_EVENT', e.data.event);
				signer.signEvent(e.data.event);
				break;
			case 'GET_PUBKEY':
				signer.getPublicKey();
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
