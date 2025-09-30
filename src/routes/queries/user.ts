import type { WorkerMessage } from '@candypoets/nipworker';
import { useSubscription } from '@candypoets/nipworker/hooks';
import { fbArray, isKind10002 } from '@candypoets/nipworker/utils';

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

export function getUserRelays(
	pubkey: string,
	onRelaysAvailable: (relays: string[]) => void,
	relayType: 'read' | 'write' = 'write'
) {
	let unsubscribe = useSubscription(
		'u_' + pubkey,
		userQuery(pubkey),
		(message: WorkerMessage) => {
			const kind10002 = isKind10002(message);
			if (kind10002) {
				const relays = fbArray(kind10002, 'relays')
					?.filter((r) => r.write())
					.map((r) => r.url()?.toString())
					.filter(Boolean) as string[];
				onRelaysAvailable(relays);
				unsubscribe?.(); // auto-unsubscribe
			}
		},
		{}
	);
	return unsubscribe;
}
