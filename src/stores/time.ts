import { derived, type Readable } from 'svelte/store';

// create a store that will return the timestamp every 10 secons
export const timestamp10: Readable<number> = derived([], (_, set) => {
	setInterval(() => {
		set(Math.floor(Date.now() / 1000));
	}, 10000);
});
