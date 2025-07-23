import type {
	Kind0Parsed,
	Kind10002Parsed,
	Kind10019Parsed,
	Kind17375Parsed,
	Kind3Parsed,
	Kind7375Parsed,
	ParsedEvent
} from '@candypoets/nipworker';
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

export const kind0: Writable<ParsedEvent<Kind0Parsed> | undefined> = writable();

export const kind0Ready = resolvable<ParsedEvent<Kind0Parsed>>();

export const kind3: Writable<ParsedEvent<Kind3Parsed> | undefined> = writable();

export const kind3Ready = resolvable<ParsedEvent<Kind3Parsed>>();

export const kind10002: Writable<ParsedEvent<Kind10002Parsed> | undefined> = writable();

export const kind10002Ready = resolvable<ParsedEvent<Kind10002Parsed>>();

export const kind10019: Writable<ParsedEvent<Kind10019Parsed> | undefined> = writable();

export const kind10019Ready = resolvable<ParsedEvent<Kind10019Parsed>>();

export const kind17375: Writable<ParsedEvent<Kind17375Parsed> | undefined> = writable();

export const kinds7375: Writable<ParsedEvent<Kind7375Parsed>[]> = writable([]);

export const readRelays = derived(
	kind10002,
	($kind10002) => $kind10002?.parsed?.filter((r) => r.read).map((r) => r.url) || []
);

export const writeRelays = derived(
	kind10002,
	($kind10002) => $kind10002?.parsed?.filter((r) => r.write).map((r) => r.url) || []
);

export const delayedPromise = new Promise<void>((resolve) => {
	setTimeout(() => {
		resolve();
	}, 2000);
});
