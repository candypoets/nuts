import { derived, get, type Readable } from 'svelte/store';
import { key, type Key, keysCache, activeAccount } from './db';
import { hexToBytes } from 'src/actions/wallet';
import { NSecSigner } from '@nostrify/nostrify';
import { browser } from '$app/environment';

export const signer: Readable<NSecSigner | undefined> = derived([key], ([$key], set) => {
	// const key: Key = $keys[$activeAccount];
	if (!browser) return;
	if (!$key) {
		set(undefined);
		return;
	}
	if ($key?.priv) {
		const pk = hexToBytes($key.priv as string);
		set(new NSecSigner(pk));
	} else if (browser && window.nostr && window.nostr?.nip04) {
		console.log('signer extension ');
		set(window.nostr);
	}
});
