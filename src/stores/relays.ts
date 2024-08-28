import { browser } from '$app/environment';
import { NPool, NRelay1 } from '@nostrify/nostrify';
import { derived, type Readable } from 'svelte/store';
import { dbRelays } from './db';

export const pool: Readable<NPool> = derived([dbRelays], ([$dbRelay], set) => {
	set(
		new NPool({
			open(url) {
				if (!browser) return;
				return new NRelay1(url);
			},
			async reqRouter(filters) {
				return new Map($dbRelay.map((r) => [r.url, filters]));
			},
			async eventRouter(event) {
				return $dbRelay.map((r) => r.url);
			}
		})
	);
});
