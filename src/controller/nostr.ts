import type { Kind3Parsed, ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
import { asKind10002, asKind3, fbArray, isKind10002 } from '@candypoets/nipworker/utils';
import { derived, writable, type Writable } from 'svelte/store';

export const resolvable = <T = any>() => {
	let resolve: (args?: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res as (args?: T) => void;
	});
	return {
		promise,
		resolve: (args?: T) => resolve(args)
	};
};

export const kind0: Writable<ParsedEvent | undefined> = writable();

export const kind0Ready = resolvable<ParsedEvent>();

export const kind3: Writable<ParsedEvent | undefined> = writable();

export const follows = derived(kind3, ($kind3) => {
	return $kind3
		? fbArray(asKind3($kind3) as Kind3Parsed, 'contacts').map((c) => ({
				pubkey: c.pubkey?.toString(),
				relay: c.relays(0)?.toString()
			}))
		: [];
});

export const kind3Ready = resolvable<ParsedEvent>();

export const kind10002: Writable<ParsedEvent | undefined> = writable();

export const kind10002Ready = resolvable<ParsedEvent>();

export const kind10019: Writable<ParsedEvent | undefined> = writable();

export const kind10019Ready = resolvable<ParsedEvent>();

export const kind17375: Writable<ParsedEvent | undefined> = writable();

export const kinds7375: Writable<ParsedEvent[]> = writable([]);

export const readRelays = derived(kind10002, ($kind10002) => {
	let relays: string[] = [];
	if (!$kind10002) return relays;
	const kind = asKind10002($kind10002);
	if (!kind) return relays;
	for (let i = 0; i < kind.relaysLength(); i++) {
		if (!kind?.relays(i)?.write()) {
			if (kind.relays(i)?.url()?.toString()) {
				relays.push(kind.relays(i)?.url()?.toString() || '');
			}
		}
	}
	return relays;
});

export const writeRelays = derived(kind10002, ($kind10002) => {
	let relays: string[] = [];
	if (!$kind10002) return relays;
	const kind = asKind10002($kind10002);
	if (!kind) return relays;
	for (let i = 0; i < kind.relaysLength(); i++) {
		if (kind?.relays(i)?.write()) {
			if (kind.relays(i)?.url()?.toString()) {
				relays.push(kind.relays(i)?.url()?.toString() || '');
			}
		}
	}
	return relays;
});

export const delayedPromise = new Promise<void>((resolve) => {
	setTimeout(() => {
		resolve();
	}, 2000);
});
