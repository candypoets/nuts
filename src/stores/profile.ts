import { derived, type Readable } from 'svelte/store';
import { key } from './db';
import { pool } from './relays';
import { kinds } from 'nostr-tools';
import { browser } from '$app/environment';

let abortController = new AbortController();

export const profile: Readable<{ name?: string; picture?: string; about?: string }> = derived(
	[pool, key],
	([$pool, $key], set) => {
		if (!pool || !$key || !browser) return;
		abortController.abort();
		abortController = new AbortController();
		const messages = $pool.req([{ kinds: [kinds.Metadata], limit: 1, authors: [$key?.pub] }], {
			signal: abortController.signal
		});

		(async () => {
			for await (const message of messages) {
				if (message[0] === 'CLOSED') break;
				if (message[0] !== 'EVENT') continue;
				const event = message[2];
				// console.log(JSON.parse(event.content));
				set(JSON.parse(event.content));
			}
		})();
	},
	{ name: '', picture: '', about: '' }
);
