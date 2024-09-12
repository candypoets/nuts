import type { NostrEvent } from 'nostr-tools';
import { writable, type Writable } from 'svelte/store';

export const scanning = writable(false);

export const showQR = writable(false);

export const accountModalOpen = writable(false);
export const scannedPubkey = writable('');

export const meltModalOpen = writable(false);
export const lightningInvoice = writable('');

export const selectedPost: Writable<NostrEvent | null> = writable(null);
export const replyPost: Writable<NostrEvent | null> = writable(null);
export const posting = writable(false);

// // when message are outgoing, we need to check the proofs status
// export const needsRefresh = writable(false);
