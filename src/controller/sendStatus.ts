import { writable } from 'svelte/store';
import type { ConnectionStatus } from '@candypoets/nipworker';
// Track timers so multiple updates for the same sendId reset its expiry
const expiryTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * sendStatuses structure:
 * {
 *   [sendId: string]: {
 *     [relayUrl: string]: ConnectionStatus | 'SUBSCRIBED' | undefined
 *   }
 * }
 */
export const sendStatuses = writable<Record<string, Record<string, ConnectionStatus>>>({});

/**
 * Replace or set the full connection status map for a given sendId
 */
export function updateSendStatus(sendId: string, statusMap: Record<string, ConnectionStatus>) {
	sendStatuses.update((all) => {
		all[sendId] = statusMap;
		return { ...all };
	});

	// Clear any existing timer for this sendId
	if (expiryTimers[sendId]) {
		clearTimeout(expiryTimers[sendId]);
	}

	// Schedule automatic removal after 5 seconds
	expiryTimers[sendId] = setTimeout(() => {
		sendStatuses.update((all) => {
			delete all[sendId];
			return { ...all };
		});
		delete expiryTimers[sendId];
	}, 5000);
}

export function clearSendStatus(sendId: string) {
	sendStatuses.update((all) => {
		delete all[sendId];
		return { ...all };
	});
}
