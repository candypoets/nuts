import type { AnyKind, ParsedEvent } from 'src/types';
import { writable, type Writable } from 'svelte/store';

export const links: Writable<{ src: string; type?: 'image' | 'video' }[]> = writable([]);
export const zoomed: Writable<number | undefined> = writable();
export const note: Writable<ParsedEvent<AnyKind>> = writable();
export const context: Writable<ParsedEvent<AnyKind>[]> = writable([]);
export const gridId: Writable<string> = writable('');
export const videoTime: Writable<number> = writable(0);
