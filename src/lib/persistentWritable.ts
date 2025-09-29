import { writable as svelteWritable, type Writable } from 'svelte/store';

export function persistentWritable<T>(
	key: string,
	initialValue: T,
	loader: (storage: any) => T = (storage: any) => storage,
	saver: (value: any) => any = (value: any) => JSON.stringify(value)
): Writable<T> {
	// Try to get the value from localStorage or use loader
	const storedValue = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;

	// Use loader if provided, else stored value or initial value
	const initial = storedValue !== null ? loader(JSON.parse(storedValue)) : initialValue;

	// Create a writable store with the initial value
	const store = svelteWritable<T>(initial);

	// Subscribe to changes and update localStorage
	if (typeof localStorage !== 'undefined') {
		store.subscribe((value) => {
			localStorage.setItem(key, saver(value));
		});
	}

	return store;
}
