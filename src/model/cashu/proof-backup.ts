import type { WorkerMessage } from '@candypoets/nipworker';
import { usePublish } from '@candypoets/nipworker/hooks';
import { isConnectionStatus } from '@candypoets/nipworker/utils';
import type { Proof } from '@cashu/cashu-ts';

import { DEFAULT_RELAYS } from 'src/lib/env';
import { now } from 'src/lib/period';

const PENDING_BACKUP_KEY = 'pendingProofBackups_v1';

export interface PendingBackup {
	mint: string;
	attempts: number;
	lastAttempt: number;
}

export function getPendingBackups(): Record<string, PendingBackup> {
	if (typeof localStorage === 'undefined') return {};
	try {
		return JSON.parse(localStorage.getItem(PENDING_BACKUP_KEY) || '{}');
	} catch {
		return {};
	}
}

function setPendingBackups(backups: Record<string, PendingBackup>): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(PENDING_BACKUP_KEY, JSON.stringify(backups));
}

export function markBackupPending(mint: string): void {
	const pending = getPendingBackups();
	pending[mint] = { mint, attempts: pending[mint]?.attempts || 0, lastAttempt: Date.now() };
	setPendingBackups(pending);
	console.log(`[backup] Marked ${mint} as pending backup`);
}

export function markBackupSuccess(mint: string): void {
	const pending = getPendingBackups();
	delete pending[mint];
	setPendingBackups(pending);
	console.log(`[backup] ${mint} backup success, removed from pending`);
}

export function markBackupAttempt(mint: string): PendingBackup | undefined {
	const pending = getPendingBackups();
	const backup = pending[mint];
	if (!backup) return undefined;
	backup.attempts++;
	backup.lastAttempt = Date.now();
	setPendingBackups(pending);
	return backup;
}

export async function publishProofsBackup(
	mint: string,
	proofs: Proof[],
	timeoutMs: number = 15_000
): Promise<boolean> {
	if (!mint || !proofs.length) return false;

	const event = {
		kind: 7375,
		content: JSON.stringify({ mint, proofs, del: [] }),
		tags: [],
		created_at: now()
	};

	const success = await new Promise<boolean>((resolve) => {
		let settled = false;
		let unsubscribe = () => {};
		const finish = (published: boolean) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timeout);
			unsubscribe();
			resolve(published);
		};
		const timeout = setTimeout(() => {
			console.log('[backup] Publish timeout - no response received');
			finish(false);
		}, timeoutMs);

		unsubscribe = usePublish(
			`backup_${Date.now()}`,
			event,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status?.status()?.trim().toLowerCase() === 'true') {
					finish(true);
				}
			},
			{
				trackStatus: true,
				defaultRelays: DEFAULT_RELAYS
			}
		);
	});

	if (success) {
		markBackupSuccess(mint);
	} else {
		markBackupPending(mint);
	}
	return success;
}
