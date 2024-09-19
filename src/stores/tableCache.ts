import { browser } from '$app/environment';
import type { Table, EntityTable, InsertType } from 'dexie';
import _ from 'lodash';
import { get, writable, type Writable } from 'svelte/store';

export interface DBTableCache<T> extends Writable<T> {
	restore: (newTable: Table<T, string, 'key'>, initialValue?: T) => Promise<void>;
	put: (item: T) => void;
	clear: () => void;
}

export function createTableCache<T>(
	keyPath: string,
	table?: Table<T, string, 'key'>
): DBTableCache<T> {
	const { subscribe, set, update } = writable<T>();
	if (table && browser) {
		table.get(keyPath).then((res) => res && set(res));
	}

	return {
		subscribe,
		set,
		update,
		async restore(newTable: Table<T, string, 'key'>, initialValue?: T) {
			table = newTable;
			const result = await table.get(keyPath);
			console.log('restore settings', result, keyPath);
			const newValue = _.merge({}, { key: keyPath, ...initialValue }, result);
			set(newValue);
			table?.add(newValue);
		},
		put(value: T) {
			const currentvalue = get(this);
			const newValue = _.merge({}, currentvalue, value);
			set(newValue);
			table?.update(keyPath, newValue);
		},
		clear() {
			// set();
			table?.clear();
		}
	};
}
