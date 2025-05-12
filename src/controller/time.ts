import { derived, type Readable } from 'svelte/store';

export const timestamp1: Readable<number> = derived([], (_, set) => {
	setInterval(() => {
		set(Math.floor(Date.now() / 1000));
	}, 1000);
});
// create a store that will return the timestamp every 10 secons
export const timestamp10: Readable<number> = derived([], (_, set) => {
	setInterval(() => {
		set(Math.floor(Date.now() / 1000));
	}, 10000);
});

export const timestamp60: Readable<number> = derived([], (_, set) => {
	setInterval(() => {
		set(Math.floor(Date.now() / 1000));
	}, 60000);
});
