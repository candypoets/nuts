import { writable, type Writable } from 'svelte/store';

export type Debug = {
	goroutines: number;
	cpu: number;
	subscriptions: number;
};

export const debug: Writable<Debug> = writable({
	goroutines: 0,
	cpu: 0,
	subscriptions: 0
});
