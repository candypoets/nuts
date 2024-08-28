import type { NostrEvent, UnsignedEvent } from 'nostr-tools';
import { pool } from 'src/stores/relays';
import { signer } from 'src/stores/signer';
import { get } from 'svelte/store';

export const signAndSend = async (event: UnsignedEvent) => {
	event = await get(signer)?.signEvent(event);

	get(pool).event(event as NostrEvent);
};
