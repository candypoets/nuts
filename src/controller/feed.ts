import { persistentWritable } from 'src/lib/persistentWritable';
import type { ParsedEvent } from 'src/types';
import type { Kind39089Parsed } from 'src/types/kind39089';
import { get, writable } from 'svelte/store';

import { derived } from 'svelte/store';
import { kind3 } from './nostr';

export const followList = derived(kind3, ($kind3) => {
	const now = () => Math.floor(Date.now() / 1000);

	return {
		id: 'followlist',
		kind: 39089,
		parsed: {
			title: 'People you follow',
			description: 'People you already follow on the platform',
			people: $kind3?.parsed?.map((c: any) => c.pubkey) || [],
			list_identifier: 'follow_list'
		},
		created_at: now()
	};
});

export const followPacks = persistentWritable<ParsedEvent<Kind39089Parsed>[]>('followpacks', [
	get(followList)
]);
