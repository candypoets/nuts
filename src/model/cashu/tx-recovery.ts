/**
 * Transaction Recovery Module
 * 
 * Provides durable, resumable transaction system for all eCash transfer flows
 * to ensure no funds are lost when the app crashes mid-flight.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { MeltQuoteResponse, MintQuoteResponse } from '@cashu/cashu-ts';
import { persistentWritable } from 'src/lib/persistentWritable';

// ============================================================================
// Types
// ============================================================================

/** Transaction types supported by the recovery system */
export type TxType = 'nutszap' | 'nutszap-melt' | 'zap';

/** Transaction step constants for Nutszap (same-mint) flow */
export const NUTSZAP_STEPS = {
	INIT: 'init',
	RESERVE_PROOFS: 'reserve_proofs',
	BUILD_NUTSZAP_EVENT: 'build_nutszap_event',
	PUBLISH_NUTSZAP_EVENT: 'publish_nutszap_event',
	FINALIZE: 'finalize'
} as const;

/** Transaction step constants for Nutszap+Melt (cross-mint swap) flow */
export const NUTSZAP_MELT_STEPS = {
	INIT: 'init',
	RESERVE_PROOFS: 'reserve_proofs',
	GET_MELT_QUOTE: 'get_melt_quote',
	PERFORM_MELT: 'perform_melt',
	GET_MINT_QUOTE: 'get_mint_quote',
	PERFORM_MINT: 'perform_mint',
	BUILD_NUTSZAP_EVENT: 'build_nutszap_event',
	PUBLISH_NUTSZAP_EVENT: 'publish_nutszap_event',
	FINALIZE: 'finalize'
} as const;

/** Transaction step constants for Zap (Lightning) flow */
export const ZAP_STEPS = {
	INIT: 'init',
	RESERVE_PROOFS: 'reserve_proofs',
	BUILD_ZAP_REQUEST: 'build_zap_request',
	FETCH_ZAP_INVOICE: 'fetch_zap_invoice',
	GET_MELT_QUOTE: 'get_melt_quote',
	PERFORM_MELT: 'perform_melt',
	STORE_CHANGE_PROOFS: 'store_change_proofs',
	FINALIZE: 'finalize'
} as const;

/** Union type of all possible transaction steps */
export type TxStep =
	| typeof NUTSZAP_STEPS[keyof typeof NUTSZAP_STEPS]
	| typeof NUTSZAP_MELT_STEPS[keyof typeof NUTSZAP_MELT_STEPS]
	| typeof ZAP_STEPS[keyof typeof ZAP_STEPS];

/** Step error with context for debugging */
export interface StepError {
	step: TxStep;
	message: string;
	timestamp: number;
	retryable: boolean;
}

/** Transaction state stored in IndexedDB */
export interface TxState {
	/** Unique transaction ID */
	txId: string;
	/** Transaction type */
	type: TxType;
	/** Creation timestamp */
	createdAt: number;
	/** Last update timestamp */
	updatedAt: number;
	/** Current step in the transaction flow */
	step: TxStep;
	/** Transaction parameters */
	params: TxParams;
	/** Proof sets for different stages */
	proofs: {
		/** Original proofs reserved for this transaction */
		reserved?: Proof[];
		/** Change proofs from melt operations */
		change?: Proof[];
		/** Newly minted proofs (for cross-mint swaps) */
		minted?: Proof[];
	};
	/** Quotes for idempotent operations */
	quotes: {
		/** Melt quote for Lightning/outgoing payments */
		meltQuote?: MeltQuoteResponse & { mintUrl: string };
		/** Mint quote for cross-mint swaps */
		mintQuote?: MintQuoteResponse & { mintUrl: string };
		/** Zap invoice for Lightning payments */
		zapInvoice?: string;
	};
	/** Nostr-related data */
	nostr: {
		/** Published event IDs */
		eventIds?: string[];
		/** Relay acknowledgments */
		relayAcks?: { relay: string; success: boolean }[];
		/** Signed zap request (for zap flows) */
		zapRequest?: string;
	};
	/** Error history for debugging and recovery */
	errors: StepError[];
	/** Whether transaction is finalized */
	isFinalized: boolean;
	/** Whether transaction was aborted */
	isAborted: boolean;
	/** Abort timestamp if applicable */
	abortedAt?: number;
}

/** Transaction parameters for initiating a transaction */
export interface TxParams {
	/** Source mint URL */
	fromMint: string;
	/** Target mint URL (for cross-mint swaps) */
	toMint?: string;
	/** Recipient pubkey */
	pubkey: string;
	/** Amount in sats */
	amount: number;
	/** Fee reserve amount */
	feeReserve?: number;
	/** Optional memo */
	memo?: string;
	/** Note ID being zapped (if applicable) */
	noteId?: string;
	/** LNURL for zap payments */
	lnurl?: string;
	/** P2PK pubkey for recipient */
	p2pkPubkey?: string;
	/** Receipt relays for zap requests */
	receiptRelays?: string[];
}

// ============================================================================
// IndexedDB Setup
// ============================================================================

const DB_NAME = 'nuts-cash-tx-recovery';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

let db: IDBDatabase | null = null;

/**
 * Initialize the IndexedDB database
 */
async function initDB(): Promise<IDBDatabase> {
	if (db) return db;

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			db = request.result;
			resolve(db);
		};

		request.onupgradeneeded = (event) => {
			const database = (event.target as IDBOpenDBRequest).result;
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				const store = database.createObjectStore(STORE_NAME, { keyPath: 'txId' });
				// Create indexes for querying
				store.createIndex('byType', 'type', { unique: false });
				store.createIndex('byStep', 'step', { unique: false });
				store.createIndex('byFinalized', 'isFinalized', { unique: false });
				store.createIndex('byAborted', 'isAborted', { unique: false });
				store.createIndex('byCreatedAt', 'createdAt', { unique: false });
			}
		};
	});
}

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * Save transaction state to IndexedDB
 */
export async function saveTxState(txId: string, state: TxState): Promise<void> {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.put({ ...state, txId });

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * Load transaction state from IndexedDB
 */
export async function loadTxState(txId: string): Promise<TxState | null> {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([STORE_NAME], 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.get(txId);

		request.onsuccess = () => resolve(request.result || null);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Delete transaction state from IndexedDB
 */
export async function deleteTxState(txId: string): Promise<void> {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.delete(txId);

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * List all pending (non-finalized, non-aborted) transactions
 */
export async function listPendingTransactions(): Promise<TxState[]> {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([STORE_NAME], 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.openCursor();

		const pending: TxState[] = [];

		request.onsuccess = (event) => {
			const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
			if (cursor) {
				const state: TxState = cursor.value;
				if (!state.isFinalized && !state.isAborted) {
					pending.push(state);
				}
				cursor.continue();
			} else {
				resolve(pending.sort((a, b) => b.createdAt - a.createdAt));
			}
		};

		request.onerror = () => reject(request.error);
	});
}

/**
 * List all transactions (including finalized and aborted)
 */
export async function listAllTransactions(): Promise<TxState[]> {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([STORE_NAME], 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.openCursor();

		const transactions: TxState[] = [];

		request.onsuccess = (event) => {
			const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
			if (cursor) {
				transactions.push(cursor.value);
				cursor.continue();
			} else {
				resolve(transactions.sort((a, b) => b.createdAt - a.createdAt));
			}
		};

		request.onerror = () => reject(request.error);
	});
}

// ============================================================================
// Active Transaction Tracking (localStorage)
// ============================================================================

/**
 * Store for the currently active transaction ID
 * Uses localStorage for immediate availability on app startup
 */
export const activeTxIdStore = persistentWritable<string | null>(
	'activeTxId',
	null,
	(storage) => storage,
	(value) => value
);

/**
 * Generate a unique transaction ID
 */
export function generateTxId(): string {
	return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Transaction State Helpers
// ============================================================================

/**
 * Create initial transaction state
 */
export function createTxState(type: TxType, params: TxParams): TxState {
	const now = Date.now();
	return {
		txId: generateTxId(),
		type,
		createdAt: now,
		updatedAt: now,
		step: 'init',
		params,
		proofs: {},
		quotes: {},
		nostr: {},
		errors: [],
		isFinalized: false,
		isAborted: false
	};
}

/**
 * Check if a transaction is in a final state
 */
export function isTxFinalized(state: TxState): boolean {
	return state.isFinalized || state.step === 'finalize';
}

/**
 * Add an error to the transaction state
 */
export function addTxError(
	state: TxState,
	step: TxStep,
	message: string,
	retryable = true
): TxState {
	return {
		...state,
		errors: [
			...state.errors,
			{
				step,
				message,
				timestamp: Date.now(),
				retryable
			}
		],
		updatedAt: Date.now()
	};
}

/**
 * Update transaction step
 */
export function updateTxStep(state: TxState, step: TxStep): TxState {
	return {
		...state,
		step,
		updatedAt: Date.now()
	};
}
