/**
 * Simplified Transaction Recovery
 *
 * Just handles: reserve proofs → execute → commit/rollback
 * No state machine, no step tracking, just crash protection.
 */

import type { Proof } from '@cashu/cashu-ts';
import type { MeltQuoteResponse, MintQuoteResponse } from '@cashu/cashu-ts';
import type { EventTemplate } from 'nostr-tools';
import { get } from 'svelte/store';
import { nutsWallet } from 'src/controller/proofs';
import { usePublish } from '@candypoets/nipworker/hooks';
import { isConnectionStatus } from '@candypoets/nipworker/utils';
import type { WorkerMessage } from '@candypoets/nipworker';
import {
	getPendingBackups,
	markBackupAttempt,
	markBackupSuccess,
	publishProofsBackup
} from 'src/model/cashu/proof-backup';

// ============================================================================
// Types
// ============================================================================

export type TxType = 'nutszap' | 'nutszap-melt' | 'zap' | 'melt';

export interface TxState {
	txId: string;
	type: TxType;
	status: 'pending' | 'completed' | 'failed' | 'pending_publish';
	params: {
		fromMint: string;
		toMint?: string;
		pubkey: string;
		amount: number;
		memo?: string;
		noteId?: string;
		lnurl?: string;
		p2pkPubkey?: string;
		receiptRelays?: string[];
	};
	proofs: Proof[];
	meltQuote?: MeltQuoteResponse & { mintUrl: string };
	mintQuote?: MintQuoteResponse & { mintUrl: string };
	nutzapEvent?: EventTemplate;
	published: boolean; // Whether nutzap was successfully published
	publishAttempts: number;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

// ============================================================================
// IndexedDB
// ============================================================================

const DB_NAME = 'nuts-cash-tx';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

async function getDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onerror = () => reject(req.error);
		req.onsuccess = () => resolve(req.result);
		req.onupgradeneeded = (e) => {
			const db = (e.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'txId' });
			}
		};
	});
}

async function saveTx(state: TxState): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	const store = tx.objectStore(STORE_NAME);
	await new Promise<void>((resolve, reject) => {
		const req = store.put({ ...state, updatedAt: Date.now() });
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

async function loadTx(txId: string): Promise<TxState | null> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readonly');
	const store = tx.objectStore(STORE_NAME);
	return new Promise((resolve, reject) => {
		const req = store.get(txId);
		req.onsuccess = () => resolve(req.result || null);
		req.onerror = () => reject(req.error);
	});
}

async function deleteTx(txId: string): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	const store = tx.objectStore(STORE_NAME);
	await new Promise<void>((resolve, reject) => {
		const req = store.delete(txId);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

async function listPending(): Promise<TxState[]> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readonly');
	const store = tx.objectStore(STORE_NAME);
	return new Promise((resolve, reject) => {
		const req = store.getAll();
		req.onsuccess = () => {
			const all: TxState[] = req.result;
			resolve(all.filter((t) => t.status === 'pending'));
		};
		req.onerror = () => reject(req.error);
	});
}

// ============================================================================
// Core API
// ============================================================================

export async function startTransaction(
	type: TxType,
	params: TxState['params'],
	proofs: Proof[]
): Promise<string> {
	const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	const state: TxState = {
		txId,
		type,
		status: 'pending',
		params,
		proofs,
		published: false,
		publishAttempts: 0,
		createdAt: Date.now(),
		updatedAt: Date.now()
	};

	await saveTx(state);
	console.log(`[tx] Started ${type} transaction: ${txId}`);
	return txId;
}

export async function completeTransaction(
	txId: string,
	requirePublish: boolean = false
): Promise<void> {
	const state = await loadTx(txId);
	if (!state) return;

	// If publish is required and not done, mark as pending_publish
	if (requirePublish && !state.published && state.nutzapEvent) {
		state.status = 'pending_publish';
		await saveTx(state);
		console.log(`[tx] Transaction ${txId} pending publish`);
		return;
	}

	state.status = 'completed';
	await saveTx(state);
	console.log(`[tx] Completed transaction: ${txId}`);

	// Clean up after a delay
	setTimeout(() => deleteTx(txId), 60000);
}

export async function markPublished(txId: string): Promise<void> {
	const state = await loadTx(txId);
	if (!state) return;

	state.published = true;
	state.publishAttempts++;
	await saveTx(state);
	console.log(`[tx] Transaction ${txId} marked as published`);

	// Now complete the transaction
	await completeTransaction(txId);
}

export async function retryPublish(txId: string): Promise<boolean> {
	const state = await loadTx(txId);
	if (!state) {
		console.error(`[tx] Transaction ${txId} not found`);
		return false;
	}

	if (!state.nutzapEvent) {
		console.error(`[tx] No nutzap event to publish for ${txId}`);
		return false;
	}

	if (state.published) {
		console.log(`[tx] Transaction ${txId} already published`);
		return true;
	}

	console.log(`[tx] Retrying publish for ${txId} (attempt ${state.publishAttempts + 1})`);

	const success = await publishWithRetry(state.nutzapEvent);

	if (success) {
		await markPublished(txId);
		return true;
	} else {
		state.publishAttempts++;
		await saveTx(state);
		return false;
	}
}

export async function failTransaction(txId: string, error: string): Promise<void> {
	const state = await loadTx(txId);
	if (!state) return;

	state.status = 'failed';
	state.error = error;
	await saveTx(state);
	console.log(`[tx] Failed transaction: ${txId}`, error);

	// Return proofs to wallet
	const wallet = get(nutsWallet);
	if (wallet && state.proofs.length) {
		// Proofs were reserved - add them back
		wallet.addProofs(state.params.fromMint, state.proofs);
		console.log(`[tx] Returned ${state.proofs.length} proofs to wallet`);
	}
}

export async function updateTransaction(txId: string, updates: Partial<TxState>): Promise<void> {
	const state = await loadTx(txId);
	if (!state) throw new Error('Transaction not found');

	Object.assign(state, updates, { updatedAt: Date.now() });
	await saveTx(state);
}

export async function getTransaction(txId: string): Promise<TxState | null> {
	return loadTx(txId);
}

// ============================================================================
// Recovery
// ============================================================================

export async function listPendingPublish(): Promise<TxState[]> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readonly');
	const store = tx.objectStore(STORE_NAME);
	return new Promise((resolve, reject) => {
		const req = store.getAll();
		req.onsuccess = () => {
			const all: TxState[] = req.result;
			resolve(all.filter((t) => t.status === 'pending_publish' && !t.published));
		};
		req.onerror = () => reject(req.error);
	});
}

export async function resumePendingTransactions(): Promise<void> {
	// First handle stuck pending transactions
	const pending = await listPending();
	if (pending.length) {
		console.log(`[tx] Found ${pending.length} pending transactions`);

		for (const tx of pending) {
			console.log(`[tx] Resuming ${tx.txId} (${tx.type})`);

			// For pending transactions older than 5 minutes, assume they failed
			const age = Date.now() - tx.createdAt;
			if (age > 5 * 60 * 1000) {
				console.log(`[tx] Transaction ${tx.txId} is stale (>5min), marking as failed`);
				await failTransaction(tx.txId, 'Transaction timed out');
				continue;
			}

			// Return proofs to wallet - user can retry manually
			const wallet = get(nutsWallet);
			if (wallet && tx.proofs.length) {
				wallet.addProofs(tx.params.fromMint, tx.proofs);
				console.log(`[tx] Returned ${tx.proofs.length} proofs to wallet`);
			}

			// Mark as failed
			await failTransaction(tx.txId, 'App crashed during transaction');
		}
	}

	// Then handle pending_publish transactions - auto-retry them
	const pendingPublish = await listPendingPublish();
	if (pendingPublish.length) {
		console.log(`[tx] Found ${pendingPublish.length} transactions pending publish`);

		for (const tx of pendingPublish) {
			console.log(`[tx] Auto-retrying publish for ${tx.txId}`);
			await retryPublish(tx.txId);
		}
	}

	// Finally retry pending proof backups
	await retryPendingBackups();
}

export async function retryPendingBackups(): Promise<void> {
	const pending = getPendingBackups();
	const mints = Object.keys(pending);
	if (!mints.length) {
		console.log('[backup] No pending backups to retry');
		return;
	}

	console.log(`[backup] Retrying ${mints.length} pending backups`);
	const wallet = get(nutsWallet);
	if (!wallet) {
		console.warn('[backup] Wallet not available for retry');
		return;
	}

	for (const mint of mints) {
		const backup = markBackupAttempt(mint);
		if (!backup) continue;

		const proofs = wallet.unspentProofs.get(mint) || [];
		if (!proofs.length) {
			console.log(`[backup] No proofs for ${mint}, removing from pending`);
			markBackupSuccess(mint);
			continue;
		}

		console.log(`[backup] Retrying ${mint} (attempt ${backup.attempts})`);
		const success = await publishProofsBackup(mint, proofs);

		if (success) {
			markBackupSuccess(mint);
		} else if (backup.attempts >= 5) {
			console.warn(`[backup] ${mint} failed ${backup.attempts} times, giving up`);
			// Keep in pending but stop trying until next app restart
		}
	}
}

// ============================================================================
// Publish with Retry Helper
// ============================================================================

export async function publishWithRetry(
	event: EventTemplate,
	timeoutMs: number = 10000,
	maxRetries: number = 3
): Promise<boolean> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		const success = await new Promise<boolean>((resolve) => {
			const timeout = setTimeout(() => {
				console.log(`[publish] Attempt ${attempt} timeout - no response`);
				resolve(false);
			}, timeoutMs);

			usePublish(`pub_${Date.now()}_${attempt}`, event, (msg: WorkerMessage) => {
				console.log(`[publish] Attempt ${attempt} received message:`, msg.type());
				const status = isConnectionStatus(msg);
				if (status) {
					const statusValue = status.status();
					console.log(`[publish] Status:`, statusValue);
					// Status can be "SENT" (string) or "true" (string) - both mean success
					const statusStr = statusValue;
					if (statusStr === 'SENT' || statusStr === 'true') {
						clearTimeout(timeout);
						resolve(true);
					}
				}
			});
		});

		if (success) {
			console.log(`[publish] Success on attempt ${attempt}`);
			return true;
		}

		if (attempt < maxRetries) {
			console.log(`[publish] Retrying... (${attempt}/${maxRetries})`);
			await new Promise((r) => setTimeout(r, 1000 * attempt)); // Exponential backoff
		}
	}

	console.error(`[publish] Failed after ${maxRetries} attempts`);
	return false;
}

// ============================================================================
// Cleanup
// ============================================================================

export async function clearOldTransactions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	const store = tx.objectStore(STORE_NAME);

	const all = await new Promise<TxState[]>((resolve, reject) => {
		const req = store.getAll();
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});

	const cutoff = Date.now() - maxAgeMs;
	for (const t of all) {
		if (t.createdAt < cutoff) {
			await new Promise<void>((resolve, reject) => {
				const req = store.delete(t.txId);
				req.onsuccess = () => resolve();
				req.onerror = () => reject(req.error);
			});
		}
	}
}

// ============================================================================
// Browser Console Debug
// ============================================================================

if (typeof window !== 'undefined') {
	(window as any).__tx = {
		getTransaction,
		listPending,
		listPendingPublish,
		retryPublish,
		resumePendingTransactions,
		retryPendingBackups,
		getPendingBackups,
		clearOldTransactions,
		updateTransaction,
		completeTransaction,
		failTransaction,
		publishProofsBackup
	};
	console.log('[tx] Debug functions available at window.__tx');
}
