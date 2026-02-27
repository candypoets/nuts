import type { WorkerMessage } from '@candypoets/nipworker';
import { useSubscription } from '@candypoets/nipworker/hooks';
import { fbArray, isKind10002 } from '@candypoets/nipworker/utils';
import { normalizeURL } from 'nostr-tools/utils';
import { relayStatusMap } from 'src/controller/relay';
import { get } from 'svelte/store';

export const userQuery = (pubkey: string, relays: string[] = []) => [
	{
		kinds: [0],
		authors: [pubkey],
		limit: 1,
		cacheFirst: true,
		closeOnEOSE: true,
		relays
	},
	{
		kinds: [10002],
		authors: [pubkey],
		limit: 1,
		cacheFirst: true,
		closeOnEOSE: true,
		relays
	},
	{
		kinds: [10019],
		authors: [pubkey],
		limit: 1,
		cacheFirst: true,
		closeOnEOSE: true,
		relays
	}
];

// Query for file storage server preferences (kind 10063 = Blossom, kind 10096 = NIP-96)
export const fileServerQuery = (pubkey: string, relays: string[] = []) => [
	{
		kinds: [10063],
		authors: [pubkey],
		limit: 1,
		cacheFirst: true,
		closeOnEOSE: true,
		relays
	},
	{
		kinds: [10096],
		authors: [pubkey],
		limit: 1,
		cacheFirst: true,
		closeOnEOSE: true,
		relays
	}
];

export function getUserRelays(
	pubkey: string,
	onRelaysAvailable: (relays: string[]) => void,
	relayType: 'read' | 'write' = 'write'
) {
	let called = false;
	const timeout = setTimeout(() => {
		if (!called) {
			onRelaysAvailable([]);
			called = true;
		}
	}, 2000);
	let unsubscribe = useSubscription(
		'u_' + pubkey,
		userQuery(pubkey),
		(message: WorkerMessage) => {
			const kind10002 = isKind10002(message);
			if (kind10002 && !called) {
				const relays = fbArray(kind10002, 'relays')
					?.filter((r) => (relayType == 'write' ? r.write() : r.read()))
					.map((r) => r.url()?.toString())
					.filter(Boolean)
					.sort((a, b) => {
						const aOpen = get(relayStatusMap).get(normalizeURL(a as string)) == 'open';
						const bOpen = get(relayStatusMap).get(normalizeURL(b as string)) == 'open';
						if (aOpen && !bOpen) return -1;
						if (!aOpen && bOpen) return 1;
						return 0;
					}) as string[];
				onRelaysAvailable(relays);
				called = true;
				clearTimeout(timeout);
				unsubscribe?.(); // auto-unsubscribe
			}
		},
		{}
	);
	return unsubscribe;
}
