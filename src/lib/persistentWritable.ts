import { writable as svelteWritable, type Writable } from 'svelte/store';

export function persistentWritable<T>(key: string, initialValue: T): Writable<T> {
	// Try to get the value from localStorage
	const storedValue = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;

	// Use stored value or initial value
	const initial = storedValue !== null ? JSON.parse(storedValue) : initialValue;

	// Create a writable store with the initial value
	const store = svelteWritable<T>(initial);

	// Subscribe to changes and update localStorage
	if (typeof localStorage !== 'undefined') {
		store.subscribe((value) => {
			localStorage.setItem(key, JSON.stringify(value));
		});
	}

	return store;
}
