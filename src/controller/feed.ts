import type { Kind3Parsed, ParsedEvent } from '@candypoets/nipworker';
import { persistentWritable } from 'src/lib/persistentWritable';
import { get, writable } from 'svelte/store';

import { asKind3, fbArray } from '@candypoets/nipworker/utils';
import { derived } from 'svelte/store';
import { kind3 } from './nostr';
import { now } from 'src/lib/period';

export const followList = derived(kind3, ($kind3) => {
	if (!$kind3) {
		return {
			id: () => ({
				toString: () => 'followlist',
				fnv1aHash: () => 'followlist'
			}),
			image: () => undefined,
			parsedType: () => 10,
			kind: () => 39089,
			title: () => ({
				toString: () => 'People you follow'
			}),
			description: () => ({
				toString: () => 'People you already follow on the platform'
			}),
			people: (i: number) => undefined,
			peopleLength: () => 0,
			listIdentifier: () => ({
				toString: () => 'follow_list'
			}),
			createdAt: () => now()
		};
	}
	const k3 = asKind3($kind3) as Kind3Parsed;
	const peoples = fbArray(k3, 'contacts').map((c) => c.pubkey());

	return {
		id: () => ({
			toString: () => 'followlist',
			fnv1aHash: () => 'followlist'
		}),
		image: () => undefined,
		parsedType: () => 10,
		kind: () => 39089,
		title: () => ({
			toString: () => 'People you follow'
		}),
		description: () => ({
			toString: () => 'People you already follow on the platform'
		}),
		people: (i: number) => peoples[i],
		peopleLength: () => peoples.length,
		listIdentifier: () => ({
			toString: () => 'follow_list'
		}),
		createdAt: () => now()
	};
});

export const followPacks = writable<ParsedEvent[]>([get(followList)]);
