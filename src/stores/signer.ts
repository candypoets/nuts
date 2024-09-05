import { derived, type Readable } from 'svelte/store';
import { key, type Key, activeAccount } from './db';
import { hexToBytes } from 'src/actions/wallet';
import { NSecSigner } from '@nostrify/nostrify';
import { browser } from '$app/environment';

export const signer: Readable<NSecSigner | undefined> = derived([key], ([$key], set) => {
	// const key: Key = $keys[$activeAccount];

	if (!browser) return;
	if (!$key) set(undefined);
	// if(window.nostr && window.nostr.getPublicKey())
	if (browser && window.nostr && window.nostr?.nip04) {
		console.log('hey hey');
		window.nostr.getPublicKey().then((pk: string) => {
			if (pk == $key?.pub) {
				set(window.nostr);
			}
		});
	} else if ($key?.priv) {
		console.log('hey hey hey');
		const pk = hexToBytes($key?.priv);
		set(new NSecSigner(pk));
	}
});
