/**
 * Transaction Recovery Module
 *
 * Provides durable, resumable transaction system for all eCash transfer flows
 * to ensure no funds are lost when the app crashes mid-flight.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { MeltQuoteResponse, MintQuoteResponse } from '@cashu/cashu-ts';
import { MeltQuoteState, MintQuoteState } from '@cashu/cashu-ts';
import { persistentWritable } from 'src/lib/persistentWritable';
import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { now } from 'src/lib/period';
import { get } from 'svelte/store';
import { nutsWallet } from 'src/controller/proofs';
import { validateP2pkPubkey } from 'src/controller/wallet';
import { usePublish, useSignEvent } from '@candypoets/nipworker/hooks';
import { isConnectionStatus } from '@candypoets/nipworker/utils';
import type { WorkerMessage } from '@candypoets/nipworker';
import { getZapInvoice } from 'src/lib/wallet';
import _ from 'lodash';

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
	| (typeof NUTSZAP_STEPS)[keyof typeof NUTSZAP_STEPS]
	| (typeof NUTSZAP_MELT_STEPS)[keyof typeof NUTSZAP_MELT_STEPS]
	| (typeof ZAP_STEPS)[keyof typeof ZAP_STEPS];

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
 * Dispatches to type-specific step handlers.
 */
async function executeStep(txId: string, state: TxState, step: TxStep): Promise<void> {
	console.log(`[tx-recovery] Executing step ${step} for transaction ${txId}`);

	switch (state.type) {
		case 'nutszap':
			await executeNutszapStep(txId, state, step);
			break;
		case 'nutszap-melt':
			await executeNutszapMeltStep(txId, state, step);
			break;
		case 'zap':
			await executeZapStep(txId, state, step);
			break;
		default:
			throw new Error(`Unknown transaction type: ${state.type}`);
	}
}

// ============================================================================
// Nutszap (Same-Mint) Step Implementation
// ============================================================================

/**
 * Execute a step for the nutszap (same-mint P2PK) flow
 */
async function executeNutszapStep(txId: string, state: TxState, step: TxStep): Promise<void> {
	switch (step) {
		case NUTSZAP_STEPS.RESERVE_PROOFS:
			await executeReserveProofsStep(txId, state);
			break;
		case NUTSZAP_STEPS.BUILD_NUTSZAP_EVENT:
			await executeBuildNutszapEventStep(txId, state);
			break;
		case NUTSZAP_STEPS.PUBLISH_NUTSZAP_EVENT:
			await executePublishNutszapEventStep(txId, state);
			break;
		case NUTSZAP_STEPS.FINALIZE:
			await executeFinalizeStep(txId, state);
			break;
		default:
			throw new Error(`Unknown step ${step} for nutszap transaction`);
	}
}

/**
 * RESERVE_PROOFS step: Reserve proofs from the wallet for this transaction
 * Idempotent: If proofs already reserved in state, skip
 */
async function executeReserveProofsStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.proofs.reserved && state.proofs.reserved.length > 0) {
		console.log(`[tx-recovery] Proofs already reserved for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint, amount, feeReserve = 0 } = state.params;
	const amountPlusFees = amount + feeReserve;

	// Get wallet for the mint
	const mintWallet = await wallet.getWallet(fromMint);

	// Get unspent proofs for this mint
	const unspentProofs = wallet.unspentProofs.get(fromMint);
	if (!unspentProofs || unspentProofs.length === 0) {
		throw new Error(`No unspent proofs available for mint ${fromMint}`);
	}

	// Use send() to select and prepare proofs
	const { keep: proofsToKeep, send: proofsToSend } = await mintWallet.send(
		amountPlusFees,
		unspentProofs
	);

	// Reserve the proofs
	const reserved = wallet.reserveProofs(fromMint, proofsToSend);
	if (!reserved) {
		throw new Error('Failed to reserve proofs - may already be reserved');
	}

	// Update wallet: replace unspent with change proofs
	// This effectively "consumes" the selected proofs
	wallet.unspentProofs.set(fromMint, proofsToKeep);
	wallet.updateBalanceByMint();

	// Update state with reserved proofs and change
	const updatedState: TxState = {
		...state,
		proofs: {
			...state.proofs,
			reserved: proofsToSend,
			change: proofsToKeep
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Reserved ${proofsToSend.length} proofs for ${txId}`);
}

/**
 * BUILD_NUTSZAP_EVENT step: Create and sign the kind 9321 nutszap event
 * Idempotent: If event already built (eventIds exist), skip
 */
async function executeBuildNutszapEventStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.nostr.eventIds && state.nostr.eventIds.length > 0) {
		console.log(`[tx-recovery] Nutszap event already built for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint, pubkey, noteId, memo = '', p2pkPubkey } = state.params;
	const { reserved } = state.proofs;

	if (!reserved || reserved.length === 0) {
		throw new Error('No reserved proofs available to build nutszap event');
	}

	// Get wallet for the mint
	const mintWallet = await wallet.getWallet(fromMint);

	// Create P2PK locked proofs for the recipient
	// Use the recipient's p2pkPubkey or derive from their pubkey
	const recipientP2pk = p2pkPubkey || validateP2pkPubkey(pubkey);

	// Lock the proofs to the recipient
	const lockedProofs = await mintWallet.receive(
		{ mint: fromMint, proofs: reserved, unit: 'sat' },
		{},
		{
			type: 'p2pk',
			options: { pubkey: recipientP2pk }
		}
	);

	// Build the kind 9321 nutszap event template
	const nutszapEvent: EventTemplate = {
		kind: 9321,
		content: memo,
		created_at: now(),
		tags: [
			...lockedProofs.map((proof) => ['proof', JSON.stringify(proof)]),
			['u', fromMint || ''],
			['e', noteId || ''],
			['p', pubkey]
		].filter((t) => !!t[1])
	};

	// Generate a deterministic event ID for tracking
	// The actual event ID will be set after signing by usePublish
	const eventId = `nutszap_${txId}_${Date.now()}`;

	// Update state with the built event and minted proofs (locked)
	const updatedState: TxState = {
		...state,
		proofs: {
			...state.proofs,
			minted: lockedProofs // Store the locked proofs as "minted"
		},
		nostr: {
			...state.nostr,
			eventIds: [eventId]
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Built nutszap event for ${txId} with ${lockedProofs.length} proofs`);
}

/**
 * PUBLISH_NUTSZAP_EVENT step: Publish the event via usePublish and track relay acks
 * Idempotent: If relay acks already received, skip
 */
async function executePublishNutszapEventStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.nostr.relayAcks && state.nostr.relayAcks.length > 0) {
		console.log(`[tx-recovery] Nutszap event already published for ${txId}, skipping`);
		return;
	}

	const { fromMint, pubkey, noteId, memo = '' } = state.params;
	const { minted: lockedProofs } = state.proofs;

	if (!lockedProofs || lockedProofs.length === 0) {
		throw new Error('No locked proofs available to publish');
	}

	// Rebuild the event template (we need to republish it)
	const nutszapEvent: EventTemplate = {
		kind: 9321,
		content: memo,
		created_at: now(),
		tags: [
			...lockedProofs.map((proof) => ['proof', JSON.stringify(proof)]),
			['u', fromMint || ''],
			['e', noteId || ''],
			['p', pubkey]
		].filter((t) => !!t[1])
	};

	// Publish and wait for at least one relay acknowledgment
	const relayAcks: { relay: string; success: boolean }[] = [];

	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			if (relayAcks.length === 0) {
				reject(new Error('Timeout waiting for relay acknowledgment'));
			} else {
				resolve();
			}
		}, 10000); // 10 second timeout

		usePublish(`nutszap_${txId}`, nutszapEvent, (message: WorkerMessage) => {
			const connectionStatus = isConnectionStatus(message);
			if (connectionStatus) {
				const relayUrl = connectionStatus.relayUrl()?.toString();
				if (relayUrl) {
					relayAcks.push({ relay: relayUrl, success: true });
					// Resolve after first successful relay ack
					clearTimeout(timeout);
					resolve();
				}
			}
		});
	});

	// Update state with relay acknowledgments
	const updatedState: TxState = {
		...state,
		nostr: {
			...state.nostr,
			relayAcks
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Published nutszap event for ${txId} to ${relayAcks.length} relays`);
}

/**
 * FINALIZE step: Commit reserved proofs and clear active transaction
 * Idempotent: If transaction already finalized, skip
 */
async function executeFinalizeStep(txId: string, state: TxState): Promise<void> {
	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint } = state.params;
	const { reserved } = state.proofs;

	// Commit the reserved proofs to spent (they were successfully used)
	if (reserved && reserved.length > 0) {
		wallet.commitReserved(fromMint, reserved);
		console.log(`[tx-recovery] Committed ${reserved.length} reserved proofs for ${txId}`);
	}

	// Save the change proofs to wallet (if any)
	const { change } = state.proofs;
	if (change && change.length > 0) {
		await wallet.saveProofs(fromMint, change);
		console.log(`[tx-recovery] Saved ${change.length} change proofs for ${txId}`);
	}

	// finalizeTransaction handles clearing activeTxId and marking state finalized
	await finalizeTransaction(txId);
}

// ============================================================================
// Nutszap+Melt (Cross-Mint Swap) Step Implementation
// ============================================================================

/**
 * Execute a step for the nutszap-melt (cross-mint swap) flow
 */
async function executeNutszapMeltStep(txId: string, state: TxState, step: TxStep): Promise<void> {
	switch (step) {
		case NUTSZAP_MELT_STEPS.RESERVE_PROOFS:
			await executeReserveProofsStep(txId, state);
			break;
		case NUTSZAP_MELT_STEPS.GET_MELT_QUOTE:
			await executeGetMeltQuoteStep(txId, state);
			break;
		case NUTSZAP_MELT_STEPS.PERFORM_MELT:
			await executePerformMeltStep(txId, state);
			break;
		case NUTSZAP_MELT_STEPS.GET_MINT_QUOTE:
			await executeGetMintQuoteStep(txId, state);
			break;
		case NUTSZAP_MELT_STEPS.PERFORM_MINT:
			await executePerformMintStep(txId, state);
			break;
		case NUTSZAP_MELT_STEPS.BUILD_NUTSZAP_EVENT:
			await executeBuildCrossMintNutszapEventStep(txId, state);
			break;
		case NUTSZAP_MELT_STEPS.PUBLISH_NUTSZAP_EVENT:
			await executePublishNutszapEventStep(txId, state);
			break;
		case NUTSZAP_MELT_STEPS.FINALIZE:
			await executeFinalizeCrossMintStep(txId, state);
			break;
		default:
			throw new Error(`Unknown step ${step} for nutszap-melt transaction`);
	}
}

/**
 * GET_MELT_QUOTE step: Request mint quote from target mint and melt quote from source mint
 * Idempotent: If melt quote already exists, skip
 */
async function executeGetMeltQuoteStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.quotes.meltQuote && state.quotes.mintQuote) {
		console.log(`[tx-recovery] Quotes already obtained for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint, toMint, amount } = state.params;

	if (!toMint) {
		throw new Error('No target mint specified for cross-mint swap');
	}

	// Step 1: Get mint quote from TARGET mint (creates an invoice to be paid)
	console.log(`[tx-recovery] Getting mint quote from ${toMint} for ${amount} sats...`);
	const targetWallet = await wallet.getWallet(toMint);
	const mintQuote = await targetWallet.createMintQuote(amount);

	console.log(`[tx-recovery] Got mint quote: ${mintQuote.quote}, invoice available`);

	// Step 2: Use the mint quote's invoice to get melt quote from SOURCE mint
	console.log(`[tx-recovery] Getting melt quote from ${fromMint} for invoice...`);
	const sourceWallet = await wallet.getWallet(fromMint);

	// Get melt quote using the request field from mint quote (this is the invoice)
	const meltQuote = await sourceWallet.createMeltQuoteBolt11(mintQuote.request);

	console.log(
		`[tx-recovery] Got melt quote: ${meltQuote.quote}, fee: ${meltQuote.fee_reserve || 0}`
	);

	// Step 3: Update state with both quotes
	const updatedState: TxState = {
		...state,
		quotes: {
			...state.quotes,
			mintQuote: {
				...mintQuote,
				mintUrl: toMint
			},
			meltQuote: {
				...meltQuote,
				mintUrl: fromMint
			}
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Stored quotes for ${txId}`);
}

/**
 * PERFORM_MELT step: Execute melt on source mint
 * Idempotent: If melt already performed (change proofs exist), skip
 */
async function executePerformMeltStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.proofs.change && state.quotes.meltQuote) {
		console.log(`[tx-recovery] Melt already performed for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint } = state.params;
	const { meltQuote } = state.quotes;
	const { reserved } = state.proofs;

	if (!reserved || reserved.length === 0) {
		throw new Error('No reserved proofs available for melt');
	}

	if (!meltQuote) {
		throw new Error('No melt quote available - must get quote first');
	}

	// Check if quote has expired
	if (meltQuote.expiry && meltQuote.expiry < now()) {
		throw new Error('Melt quote has expired - transaction must be aborted');
	}

	// Get wallet for source mint
	const mintWallet = await wallet.getWallet(fromMint);

	// Perform the melt
	console.log(`[tx-recovery] Performing melt for ${txId}...`);
	const meltResult = await mintWallet.meltProofsBolt11(meltQuote, reserved);

	// Update state with change proofs
	const updatedState: TxState = {
		...state,
		proofs: {
			...state.proofs,
			change: meltResult.change || []
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(
		`[tx-recovery] Melt performed for ${txId}, got ${meltResult.change?.length || 0} change proofs`
	);
}

/**
 * GET_MINT_QUOTE step: Request mint quote from target mint
 * Idempotent: If mint quote already exists, skip
 */
async function executeGetMintQuoteStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.quotes.mintQuote) {
		console.log(`[tx-recovery] Mint quote already obtained for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { toMint, amount } = state.params;

	if (!toMint) {
		throw new Error('No target mint specified for cross-mint swap');
	}

	// Get wallet for target mint
	const targetWallet = await wallet.getWallet(toMint);

	// Create mint quote on target mint
	console.log(`[tx-recovery] Getting mint quote from ${toMint} for ${amount} sats...`);
	const mintQuote = await targetWallet.createMintQuote(amount);

	// Update state with mint quote
	const updatedState: TxState = {
		...state,
		quotes: {
			...state.quotes,
			mintQuote: {
				...mintQuote,
				mintUrl: toMint
			}
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Got mint quote for ${txId}: ${mintQuote.quote}`);
}

/**
 * PERFORM_MINT step: Poll for paid status and mint new proofs
 * Idempotent: If minted proofs already exist, skip
 */
async function executePerformMintStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.proofs.minted && state.proofs.minted.length > 0) {
		console.log(`[tx-recovery] Mint already performed for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { toMint, amount } = state.params;
	const { mintQuote } = state.quotes;

	if (!toMint) {
		throw new Error('No target mint specified for cross-mint swap');
	}

	if (!mintQuote) {
		throw new Error('No mint quote available - must get quote first');
	}

	// Check if quote has expired
	if (mintQuote.expiry && mintQuote.expiry < now()) {
		throw new Error('Mint quote has expired - transaction must be aborted');
	}

	// Get wallet for target mint
	const targetWallet = await wallet.getWallet(toMint);

	// Poll for payment status
	console.log(`[tx-recovery] Polling mint quote ${mintQuote.quote} for payment...`);

	let isPaid = false;
	let attempts = 0;
	const maxAttempts = 60; // 60 attempts with 2-second delay = 2 minutes max
	const pollInterval = 2000; // 2 seconds

	while (!isPaid && attempts < maxAttempts) {
		const response = await targetWallet.checkMintQuote(mintQuote.quote);

		if (response.state === MintQuoteState.PAID) {
			isPaid = true;
			break;
		}

		if (response.state === MintQuoteState.ISSUED) {
			// Quote was already used, this is an error
			throw new Error('Mint quote was already issued - transaction must be aborted');
		}

		if (mintQuote.expiry && mintQuote.expiry < now()) {
			throw new Error('Mint quote expired while waiting for payment');
		}

		attempts++;
		if (!isPaid && attempts < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}
	}

	if (!isPaid) {
		throw new Error('Timeout waiting for mint quote to be paid');
	}

	// Mint the proofs
	console.log(`[tx-recovery] Minting proofs for ${txId}...`);
	const mintedProofs = await targetWallet.mintProofs(amount, mintQuote.quote);

	// Update state with minted proofs
	const updatedState: TxState = {
		...state,
		proofs: {
			...state.proofs,
			minted: mintedProofs
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Minted ${mintedProofs.length} proofs for ${txId}`);
}

/**
 * Build nutszap event step for cross-mint swap (uses minted proofs from target mint)
 * Overrides the build step to use minted proofs instead of reserved proofs
 */
async function executeBuildCrossMintNutszapEventStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.nostr.eventIds && state.nostr.eventIds.length > 0) {
		console.log(`[tx-recovery] Nutszap event already built for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { toMint, pubkey, noteId, memo = '', p2pkPubkey } = state.params;
	const { minted } = state.proofs;

	if (!minted || minted.length === 0) {
		throw new Error('No minted proofs available to build nutszap event');
	}

	if (!toMint) {
		throw new Error('No target mint specified');
	}

	// Get wallet for target mint
	const targetWallet = await wallet.getWallet(toMint);

	// Create P2PK locked proofs for the recipient
	const recipientP2pk = p2pkPubkey || validateP2pkPubkey(pubkey);

	// Lock the minted proofs to the recipient
	const lockedProofs = await targetWallet.receive(
		{ mint: toMint, proofs: minted, unit: 'sat' },
		{},
		{
			type: 'p2pk',
			options: { pubkey: recipientP2pk }
		}
	);

	// Build the kind 9321 nutszap event template
	const nutszapEvent: EventTemplate = {
		kind: 9321,
		content: memo,
		created_at: now(),
		tags: [
			...lockedProofs.map((proof) => ['proof', JSON.stringify(proof)]),
			['u', toMint || ''],
			['e', noteId || ''],
			['p', pubkey]
		].filter((t) => !!t[1])
	};

	// Generate a deterministic event ID for tracking
	const eventId = `nutszap_${txId}_${Date.now()}`;

	// Update state with the built event and final locked proofs
	const updatedState: TxState = {
		...state,
		proofs: {
			...state.proofs,
			minted: lockedProofs // Store the locked proofs as "minted"
		},
		nostr: {
			...state.nostr,
			eventIds: [eventId]
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Built nutszap event for ${txId} with ${lockedProofs.length} proofs`);
}

/**
 * FINALIZE step for cross-mint swap: Commit reserved proofs and save change to wallet
 */
async function executeFinalizeCrossMintStep(txId: string, state: TxState): Promise<void> {
	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint, toMint } = state.params;
	const { reserved, change } = state.proofs;

	// Commit the reserved proofs to spent (they were successfully melted)
	if (reserved && reserved.length > 0) {
		wallet.commitReserved(fromMint, reserved);
		console.log(`[tx-recovery] Committed ${reserved.length} reserved proofs for ${txId}`);
	}

	// Save the change proofs to wallet on source mint (if any)
	if (change && change.length > 0) {
		await wallet.saveProofs(fromMint, change);
		console.log(`[tx-recovery] Saved ${change.length} change proofs to ${fromMint} for ${txId}`);
	}

	// The minted proofs were already locked and published in the nutszap event
	// They don't need to be saved to the wallet since they're being sent to someone else

	// finalizeTransaction handles clearing activeTxId and marking state finalized
	await finalizeTransaction(txId);
}

// ============================================================================
// Zap (Lightning) Step Implementation
// ============================================================================

/**
 * Execute a step for the zap (Lightning) flow
 */
async function executeZapStep(txId: string, state: TxState, step: TxStep): Promise<void> {
	switch (step) {
		case ZAP_STEPS.RESERVE_PROOFS:
			await executeReserveProofsStep(txId, state);
			break;
		case ZAP_STEPS.BUILD_ZAP_REQUEST:
			await executeBuildZapRequestStep(txId, state);
			break;
		case ZAP_STEPS.FETCH_ZAP_INVOICE:
			await executeFetchZapInvoiceStep(txId, state);
			break;
		case ZAP_STEPS.GET_MELT_QUOTE:
			await executeGetZapMeltQuoteStep(txId, state);
			break;
		case ZAP_STEPS.PERFORM_MELT:
			await executePerformZapMeltStep(txId, state);
			break;
		case ZAP_STEPS.STORE_CHANGE_PROOFS:
			await executeStoreChangeProofsStep(txId, state);
			break;
		case ZAP_STEPS.FINALIZE:
			await executeFinalizeZapStep(txId, state);
			break;
		default:
			throw new Error(`Unknown step ${step} for zap transaction`);
	}
}

/**
 * BUILD_ZAP_REQUEST step: Create and sign kind 9734 zap request event
 * Idempotent: If zap request already exists in state, skip
 */
async function executeBuildZapRequestStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.nostr.zapRequest) {
		console.log(`[tx-recovery] Zap request already built for ${txId}, skipping`);
		return;
	}

	const { pubkey, noteId, amount, lnurl, receiptRelays = [], memo = '' } = state.params;

	if (!lnurl) {
		throw new Error('No LNURL provided for zap payment');
	}

	// Build the kind 9734 zap request event template
	const zapRequestTemplate: EventTemplate = {
		kind: 9734,
		content: memo,
		created_at: now(),
		tags: [
			['e', noteId || ''],
			['p', pubkey],
			['amount', (Number(amount) * 1000).toString()], // Convert to millisats
			['relays', ...receiptRelays.map((r) => r)],
			['lnurl', lnurl]
		].filter((t) => !!t[1])
	};

	// Sign the zap request using useSignEvent
	const signedZapRequest = await new Promise<NostrEvent>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error('Timeout signing zap request'));
		}, 10000); // 10 second timeout

		useSignEvent(zapRequestTemplate, (signed) => {
			clearTimeout(timeout);
			resolve(signed);
		});
	});

	// Update state with the signed zap request
	const updatedState: TxState = {
		...state,
		nostr: {
			...state.nostr,
			zapRequest: JSON.stringify(signedZapRequest)
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Built and signed zap request for ${txId}`);
}

/**
 * FETCH_ZAP_INVOICE step: Get invoice from LNURL callback using signed zap request
 * Idempotent: If zap invoice already exists in state, skip
 */
async function executeFetchZapInvoiceStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.quotes.zapInvoice) {
		console.log(`[tx-recovery] Zap invoice already fetched for ${txId}, skipping`);
		return;
	}

	const { lnurl, amount } = state.params;
	const { zapRequest } = state.nostr;

	if (!lnurl) {
		throw new Error('No LNURL provided for zap payment');
	}

	if (!zapRequest) {
		throw new Error('No zap request available - must build zap request first');
	}

	// Parse the signed zap request
	const signedEvent = JSON.parse(zapRequest) as NostrEvent;

	// Fetch the zap invoice from the LNURL service
	console.log(`[tx-recovery] Fetching zap invoice for ${txId}...`);
	try {
		const zapInvoice = await getZapInvoice(lnurl, Number(amount), signedEvent);

		if (!zapInvoice || !zapInvoice.pr) {
			throw new Error('Failed to get zap invoice from LNURL service');
		}

		// Update state with the zap invoice
		const updatedState: TxState = {
			...state,
			quotes: {
				...state.quotes,
				zapInvoice: zapInvoice.pr
			},
			updatedAt: Date.now()
		};
		await saveTxState(txId, updatedState);

		console.log(`[tx-recovery] Fetched zap invoice for ${txId}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[tx-recovery] Failed to fetch zap invoice for ${txId}:`, error);
		throw new Error(`Failed to fetch zap invoice: ${errorMessage}`);
	}
}

/**
 * GET_MELT_QUOTE step: Create melt quote for the zap invoice
 * Idempotent: If melt quote already exists in state, skip
 */
async function executeGetZapMeltQuoteStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.quotes.meltQuote) {
		console.log(`[tx-recovery] Melt quote already obtained for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint } = state.params;
	const { zapInvoice } = state.quotes;

	if (!zapInvoice) {
		throw new Error('No zap invoice available - must fetch zap invoice first');
	}

	// Get wallet for source mint
	const mintWallet = await wallet.getWallet(fromMint);

	// Create melt quote for the zap invoice
	console.log(`[tx-recovery] Getting melt quote for zap invoice...`);
	const meltQuote = await mintWallet.createMeltQuoteBolt11(zapInvoice);

	// Update state with the melt quote
	const updatedState: TxState = {
		...state,
		quotes: {
			...state.quotes,
			meltQuote: {
				...meltQuote,
				mintUrl: fromMint
			}
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(`[tx-recovery] Got melt quote for ${txId}: ${meltQuote.quote}`);
}

/**
 * PERFORM_MELT step: Pay the zap invoice (consumes reserved proofs)
 * Idempotent: If change proofs exist (melt already performed), skip
 */
async function executePerformZapMeltStep(txId: string, state: TxState): Promise<void> {
	// Check if already completed (idempotent)
	if (state.proofs.change !== undefined) {
		console.log(`[tx-recovery] Melt already performed for ${txId}, skipping`);
		return;
	}

	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint } = state.params;
	const { meltQuote } = state.quotes;
	const { reserved } = state.proofs;

	if (!reserved || reserved.length === 0) {
		throw new Error('No reserved proofs available for melt');
	}

	if (!meltQuote) {
		throw new Error('No melt quote available - must get melt quote first');
	}

	// Check if quote has expired
	if (meltQuote.expiry && meltQuote.expiry < now()) {
		throw new Error('Melt quote has expired - transaction must be aborted');
	}

	// Get wallet for source mint
	const mintWallet = await wallet.getWallet(fromMint);

	// Perform the melt (pay the zap invoice)
	console.log(`[tx-recovery] Performing melt for zap payment ${txId}...`);
	const meltResult = await mintWallet.meltProofsBolt11(meltQuote, reserved);

	// Update state with change proofs (can be empty array)
	const updatedState: TxState = {
		...state,
		proofs: {
			...state.proofs,
			change: meltResult.change || []
		},
		updatedAt: Date.now()
	};
	await saveTxState(txId, updatedState);

	console.log(
		`[tx-recovery] Melt performed for ${txId}, got ${meltResult.change?.length || 0} change proofs`
	);
}

/**
 * STORE_CHANGE_PROOFS step: Save change proofs to wallet
 * Idempotent: If change proofs are already saved (verified by checking wallet state), skip
 */
async function executeStoreChangeProofsStep(txId: string, state: TxState): Promise<void> {
	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint } = state.params;
	const { change } = state.proofs;

	// Save change proofs to wallet (if any)
	if (change && change.length > 0) {
		await wallet.saveProofs(fromMint, change);
		console.log(`[tx-recovery] Saved ${change.length} change proofs to wallet for ${txId}`);
	} else {
		console.log(`[tx-recovery] No change proofs to save for ${txId}`);
	}
}

/**
 * FINALIZE step for zap: Commit reserved proofs and clear active transaction
 */
async function executeFinalizeZapStep(txId: string, state: TxState): Promise<void> {
	const wallet = get(nutsWallet);
	if (!wallet) {
		throw new Error('NutsWallet not initialized');
	}

	const { fromMint } = state.params;
	const { reserved } = state.proofs;

	// Commit the reserved proofs to spent (they were successfully used for the zap)
	if (reserved && reserved.length > 0) {
		wallet.commitReserved(fromMint, reserved);
		console.log(`[tx-recovery] Committed ${reserved.length} reserved proofs for zap ${txId}`);
	}

	// finalizeTransaction handles clearing activeTxId and marking state finalized
	await finalizeTransaction(txId);
}

/**
 * Abort a transaction and release reserved proofs back to the wallet.
 * Preserves transaction state in IndexedDB for audit purposes.
 * @param txId The transaction ID to abort
 */
export async function abortTransaction(txId: string): Promise<void> {
	const state = await loadTxState(txId);
	if (!state) {
		throw new Error(`Transaction ${txId} not found`);
	}

	// Can't abort if already finalized
	if (state.isFinalized) {
		console.log(`[tx-recovery] Transaction ${txId} is already finalized, cannot abort`);
		return;
	}

	// Can't abort if already aborted
	if (state.isAborted) {
		console.log(`[tx-recovery] Transaction ${txId} is already aborted`);
		return;
	}

	console.log(`[tx-recovery] Aborting transaction ${txId}...`);

	// Release reserved proofs back to wallet
	const wallet = get(nutsWallet);
	if (wallet) {
		const { fromMint } = state.params;
		const { reserved } = state.proofs;

		if (reserved && reserved.length > 0) {
			wallet.releaseReserved(fromMint, reserved);
			console.log(`[tx-recovery] Released ${reserved.length} reserved proofs for ${txId}`);
		}
	}

	// Update state to mark as aborted (preserved for audit)
	const abortedState: TxState = {
		...state,
		isAborted: true,
		abortedAt: Date.now(),
		updatedAt: Date.now()
	};

	await saveTxState(txId, abortedState);

	// Clear active transaction ID from localStorage
	const currentActiveTxId = getActiveTxId();
	if (currentActiveTxId === txId) {
		activeTxIdStore.set(null);
		console.log(`[tx-recovery] Cleared active transaction ID for aborted transaction`);
	}

	console.log(`[tx-recovery] Transaction ${txId} aborted successfully`);
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
