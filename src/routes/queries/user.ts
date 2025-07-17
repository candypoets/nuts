import { useSubscription, type SubscribeKind } from 'src/model/nostr-main';
import { isKind10002, type AnyKind, type ParsedEvent } from 'src/types';

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
		(events: ParsedEvent<AnyKind>[], kind: SubscribeKind) => {
			if (kind == 'EOSE') {
				return;
			}
			const [event] = events;
			if (isKind10002(event)) {
				const relays =
					event.parsed
						?.filter((r) => (relayType === 'read' ? !!r.read : !!r.write))
						.map((r) => r.url) || [];
				onRelaysAvailable(relays);
				unsubscribe?.(); // auto-unsubscribe
				unsubscribe = undefined;
			}
		}
	);
	return unsubscribe;
}
