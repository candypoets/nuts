import { browser } from '$app/environment';
import type { EntityTable, InsertType } from 'dexie';
import _ from 'lodash';
import { get, writable, type Writable } from 'svelte/store';

export interface DBCache<T, TKeyPropName extends keyof T = never> extends Writable<Map<string, T>> {
	restore: (newTable: EntityTable<T, TKeyPropName>, items?: T[]) => Promise<void>;
	put: (item: T) => void;
	add: (item: T) => void;
	bulkPut: (items: T[]) => void;
	clear: () => void;
}

export function createCache<T, TKeyPropName extends keyof T>(
	table?: EntityTable<T, TKeyPropName>,
	keyPath?: TKeyPropName
): DBCache<T, TKeyPropName> {
	const { subscribe, set, update } = writable(new Map<string, T>());
	if (table && browser) {
		table.toArray().then((all) => set(new Map(all.map((item) => [getPrimaryKey(item), item]))));
	}

	function getPrimaryKey(item: T): string {
		if (!keyPath) keyPath = table?.schema?.primKey?.keyPath;
		if (!keyPath) return;
		if (typeof keyPath === 'string') {
			if (keyPath.includes('.')) {
				return keyPath.split('.').reduce((obj, key) => obj && obj[key], item);
			}
			return item[keyPath] as string;
		}
		throw new Error('Compound primary keys are not supported');
	}

	function hasChanges(newMap: Map<string, T>, oldMap: Map<string, T>) {
		if (newMap.size !== oldMap.size) {
			return true;
		}
		const arr1 = Array.from(newMap.entries());
		const arr2 = Array.from(oldMap.entries());

		return !_.isEqual(arr1, arr2);
	}

	return {
		subscribe,
		set,
		update,
		async restore(newTable: EntityTable<T, TKeyPropName>, items?: T[]) {
			table = newTable;
			const all = await table.toArray();
			const newMap = new Map([...(items || []), ...all].map((item) => [getPrimaryKey(item), item]));
			set(newMap);
		},
		put(value: T) {
			const map = new Map(get(this));
			const primaryKey = getPrimaryKey(value);
			map.set(primaryKey, value);
			hasChanges(map, get(this)) ? set(map) : null;
			table?.put(value);
		},
		add(value: T) {
			const newMap = new Map(get(this));
			const primaryKey = getPrimaryKey(value);

			if (!newMap.get(primaryKey)) {
				newMap.set(primaryKey, value);
			}
			if (hasChanges(newMap, get(this))) {
				set(newMap);
				table?.add(value);
			}
		},
		bulkPut(values: T[]) {
			const newMap = new Map(get(this));
			for (const value of values) {
				newMap.set(getPrimaryKey(value), value);
			}
			hasChanges(newMap, get(this)) ? set(newMap) : null;
			table?.bulkPut(values);
		},
		clear() {
			set(new Map());
			table?.clear();
		}
	};
}

export async function restore<T, TKeyPropName extends keyof T = never>(
	store: Writable<Map<string, T>>,
	table: EntityTable<T, TKeyPropName>
) {
	const s = get(store);

	const all = await table.toArray();
	for (const a of all) {
		const primkey = a[table.schema.primKey.keyPath];
		s.set(primkey, a);
	}

	store.set(s);
}

export function put<T>(put: T, store: Writable<Map<string, T>>, table: EntityTable<T, keyof T>) {
	const s = get(store);

	const primkey = put[table.schema.primKey.keyPath];

	s.set(primkey, put);

	store.set(s);

	table.put(put);
}

export function add<T extends InsertType<T, never>>(
	add: T,
	store: Writable<Map<string, T>>,
	table: EntityTable<T>
) {
	const s = get(store);

	const primkey = add[table.schema.primKey.keyPath];

	s.set(primkey, add);

	store.set(s);

	table.add(add);
}

export function bulkPut<T extends InsertType<T, never>>(
	put: T[],
	store: Writable<Map<string, T>>,
	table: EntityTable<T>
) {
	const s = get(store);
	for (const p of put) {
		const primkey = p[table.schema.primKey.keyPath];
		s.set(primkey, p);
	}

	store.set(s);

	table.bulkPut(put);
}
