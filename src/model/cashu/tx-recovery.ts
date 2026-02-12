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

// ============================================================================
// Core State Machine
// ============================================================================

/** Map of transaction IDs to their current execution promises (prevents duplicate execution) */
const pendingExecutions = new Map<string, Promise<void>>();

/**
 * Start a new transaction with the given type and parameters.
 * Creates the initial state, persists it, and sets the active transaction ID.
 * @returns The created transaction ID
 */
export async function startTransaction(type: TxType, params: TxParams): Promise<string> {
	const state = createTxState(type, params);
	
	// Save to IndexedDB
	await saveTxState(state.txId, state);
	
	// Set as active transaction in localStorage
	activeTxIdStore.set(state.txId);
	
	console.log(`[tx-recovery] Started ${type} transaction: ${state.txId}`);
	
	return state.txId;
}

/**
 * Advance a transaction by executing its next step.
 * Loads the transaction state, determines the next step, and executes it.
 * Each step updates the state and persists before/after execution.
 * @param txId The transaction ID to advance
 */
export async function advanceTransaction(txId: string): Promise<void> {
	// Prevent concurrent execution of the same transaction
	const existingExecution = pendingExecutions.get(txId);
	if (existingExecution) {
		console.log(`[tx-recovery] Transaction ${txId} is already being advanced, waiting...`);
		return existingExecution;
	}

	const executionPromise = executeAdvanceTransaction(txId);
	pendingExecutions.set(txId, executionPromise);
	
	try {
		await executionPromise;
	} finally {
		pendingExecutions.delete(txId);
	}
}

/**
 * Internal execution function for advancing a transaction
 */
async function executeAdvanceTransaction(txId: string): Promise<void> {
	const state = await loadTxState(txId);
	if (!state) {
		throw new Error(`Transaction ${txId} not found`);
	}

	// Don't advance if already finalized or aborted
	if (state.isFinalized) {
		console.log(`[tx-recovery] Transaction ${txId} is already finalized`);
		return;
	}
	if (state.isAborted) {
		console.log(`[tx-recovery] Transaction ${txId} is aborted`);
		return;
	}

	console.log(`[tx-recovery] Advancing transaction ${txId} from step: ${state.step}`);

	// Determine the step sequence based on transaction type
	const stepSequence = getStepSequence(state.type);
	
	// Find the current step index
	const currentIndex = stepSequence.indexOf(state.step);
	if (currentIndex === -1) {
		throw new Error(`Unknown step ${state.step} for transaction type ${state.type}`);
	}

	// Check if we've reached the end
	if (currentIndex >= stepSequence.length - 1) {
		console.log(`[tx-recovery] Transaction ${txId} reached end of step sequence`);
		await finalizeTransaction(txId);
		return;
	}

	// Get the next step
	const nextStep = stepSequence[currentIndex + 1];
	
	console.log(`[tx-recovery] Executing step: ${nextStep}`);

	try {
		// Update state to the next step before execution
		let updatedState = updateTxStep(state, nextStep);
		await saveTxState(txId, updatedState);

		// Execute the step
		await executeStep(txId, updatedState, nextStep);

		// After successful execution, continue advancing if not finalized
		const currentState = await loadTxState(txId);
		if (currentState && !currentState.isFinalized && !currentState.isAborted) {
			// Auto-advance to the next step
			await advanceTransaction(txId);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[tx-recovery] Step ${nextStep} failed for transaction ${txId}:`, error);
		
		// Add error to state
		const errorState = addTxError(state, nextStep, errorMessage, isRetryableError(error));
		await saveTxState(txId, errorState);
		
		throw error;
	}
}

/**
 * Get the step sequence for a transaction type
 */
function getStepSequence(type: TxType): TxStep[] {
	switch (type) {
		case 'nutszap':
			return [
				NUTSZAP_STEPS.INIT,
				NUTSZAP_STEPS.RESERVE_PROOFS,
				NUTSZAP_STEPS.BUILD_NUTSZAP_EVENT,
				NUTSZAP_STEPS.PUBLISH_NUTSZAP_EVENT,
				NUTSZAP_STEPS.FINALIZE
			];
		case 'nutszap-melt':
			return [
				NUTSZAP_MELT_STEPS.INIT,
				NUTSZAP_MELT_STEPS.RESERVE_PROOFS,
				NUTSZAP_MELT_STEPS.GET_MELT_QUOTE,
				NUTSZAP_MELT_STEPS.PERFORM_MELT,
				NUTSZAP_MELT_STEPS.GET_MINT_QUOTE,
				NUTSZAP_MELT_STEPS.PERFORM_MINT,
				NUTSZAP_MELT_STEPS.BUILD_NUTSZAP_EVENT,
				NUTSZAP_MELT_STEPS.PUBLISH_NUTSZAP_EVENT,
				NUTSZAP_MELT_STEPS.FINALIZE
			];
		case 'zap':
			return [
				ZAP_STEPS.INIT,
				ZAP_STEPS.RESERVE_PROOFS,
				ZAP_STEPS.BUILD_ZAP_REQUEST,
				ZAP_STEPS.FETCH_ZAP_INVOICE,
				ZAP_STEPS.GET_MELT_QUOTE,
				ZAP_STEPS.PERFORM_MELT,
				ZAP_STEPS.STORE_CHANGE_PROOFS,
				ZAP_STEPS.FINALIZE
			];
		default:
			throw new Error(`Unknown transaction type: ${type}`);
	}
}

/**
 * Execute a specific step of the transaction.
 * This is a placeholder that will be implemented in subsequent stories.
 * For now, it just logs the step execution.
 */
async function executeStep(txId: string, state: TxState, step: TxStep): Promise<void> {
	// Step execution will be implemented in US-004, US-005, US-006
	// For now, we just log that the step was "executed"
	console.log(`[tx-recovery] Executed step ${step} for transaction ${txId}`);
	
	// Special handling for finalize step
	if (step === 'finalize') {
		await finalizeTransaction(txId);
	}
}

/**
 * Finalize a transaction by marking it as complete and clearing the active transaction ID.
 * @param txId The transaction ID to finalize
 */
export async function finalizeTransaction(txId: string): Promise<void> {
	const state = await loadTxState(txId);
	if (!state) {
		throw new Error(`Transaction ${txId} not found`);
	}

	if (state.isFinalized) {
		console.log(`[tx-recovery] Transaction ${txId} is already finalized`);
		return;
	}

	// Update state to finalized
	const finalizedState: TxState = {
		...state,
		step: 'finalize',
		isFinalized: true,
		updatedAt: Date.now()
	};

	await saveTxState(txId, finalizedState);

	// Clear active transaction
	const currentActiveTxId = getActiveTxId();
	if (currentActiveTxId === txId) {
		activeTxIdStore.set(null);
		console.log(`[tx-recovery] Cleared active transaction ID`);
	}

	console.log(`[tx-recovery] Finalized transaction ${txId}`);
}

/**
 * Get the currently active transaction ID from localStorage
 */
export function getActiveTxId(): string | null {
	// Get value from the persistent store
	// We need to access localStorage directly since persistentWritable is a Svelte store
	if (typeof localStorage !== 'undefined') {
		const stored = localStorage.getItem('activeTxId');
		return stored ? JSON.parse(stored) : null;
	}
	return null;
}

/**
 * Check if an error is potentially retryable
 */
function isRetryableError(error: unknown): boolean {
	if (error instanceof Error) {
		// Network errors are typically retryable
		if (error.message.includes('network') || error.message.includes('fetch')) {
			return true;
		}
		// Timeout errors are retryable
		if (error.message.includes('timeout')) {
			return true;
		}
		// Mint temporarily unavailable
		if (error.message.includes('unavailable') || error.message.includes('503')) {
			return true;
		}
	}
	return false;
}
