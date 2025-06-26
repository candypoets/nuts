import type { AnyKind, ParsedEvent } from 'src/types';
import init, { NostrManager, get_nostr_manager } from 'src/model/nostr-main/pkg/nostr_main.js';
import nostrWorker from 'src/model/nostr-worker/index?worker';

// Initialize WASM and create NostrManager instance
export let nostrManager: NostrManager;

export type SubscribeKind = 'CACHED_EVENT' | 'FETCHED_EVENT' | 'COUNT' | 'EOSE' | 'EOCE';
export type PublishKind = 'PUBLISH_STATUS';

// Callback for subscription events
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

export const initNostr = async (): Promise<NostrManager | null> => {
	if (nostrManager) {
		return nostrManager;
	}

	if (import.meta.env.SSR) {
		return nostrManager;
	}

	try {
		// Initialize WASM module first
		// init_main() is called automatically via #[wasm_bindgen(start)]
		await init();

		// Create worker instance
		const worker = new nostrWorker();

		// Create NostrManager with the worker instance
		nostrManager = get_nostr_manager(worker);

		console.log('NostrManager initialized successfully');
		return nostrManager;
	} catch (error) {
		console.error('Failed to initialize NostrManager:', error);
		throw error;
	}
};

// Re-export types
export type { NostrManager };
