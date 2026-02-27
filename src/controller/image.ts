import type { AnyKind, ParsedEvent } from 'src/types';
import { writable, type Writable } from 'svelte/store';

export const links: Writable<{ src: string; type?: 'image' | 'video' }[]> = writable([]);
export const zoomed: Writable<number | undefined> = writable();
export const note: Writable<ParsedEvent<AnyKind>> = writable();
export const context: Writable<ParsedEvent<AnyKind>[]> = writable([]);
export const gridId: Writable<string> = writable('');
export const videoTime: Writable<number> = writable(0);

// Shared video element for seamless zoom - stores the actual video DOM element
// to avoid re-fetching when zooming
export const sharedVideoElement: Writable<HTMLVideoElement | null> = writable(null);
export const sharedVideoIndex: Writable<number> = writable(-1);
export const sharedVideoGridId: Writable<string> = writable('');

// Live stream store
export const liveStreamNote: Writable<ParsedEvent<AnyKind> | null> = writable(null);
export const liveStreamOpen: Writable<boolean> = writable(false);

export function openLiveStream(eventNote: ParsedEvent<AnyKind>) {
	liveStreamNote.set(eventNote);
	liveStreamOpen.set(true);
}

export function closeLiveStream() {
	liveStreamOpen.set(false);
	setTimeout(() => liveStreamNote.set(null), 300);
}
