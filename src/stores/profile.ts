import { derived, type Readable } from 'svelte/store';
import { key } from './db';
import { pool } from './relays';
import { kinds } from 'nostr-tools';

export const profile: Readable<{ name?: string; picture?: string; about?: string }> = derived(
	[pool, key],
	([$pool, $key], set) => {
		if (!pool || !key) return;
		const messages = $pool.req([{ kinds: [kinds.Metadata], limit: 1, authors: [$key.pub] }]);

		(async () => {
			for await (const message of messages) {
				if (message[0] === 'CLOSED') break;
				if (message[0] !== 'EVENT') continue;
				const event = message[2];
				console.log(JSON.parse(event.content));
				set(JSON.parse(event.content));
			}
		})();
	},
	{ name: '', picture: '', about: '' }
);
