import { derived, type Readable } from 'svelte/store';
import { keys, type Key, activeAccount } from './db';
import { hexToBytes } from 'src/actions/wallet';
import { NSecSigner } from '@nostrify/nostrify';
import { browser } from '$app/environment';

export const signer: Readable<NSecSigner | undefined> = derived(
	[activeAccount, keys],
	([$activeAccount, $keys], set) => {
		console.log('hey', $keys);
		const key: Key = $keys[$activeAccount];
		if (!key) set(undefined);
		// if(window.nostr && window.nostr.getPublicKey())
		if (browser && window.nostr) {
			window.nostr.getPublicKey().then((pk: string) => {
				if (pk == key.pub) {
					set(window.nostr);
				}
			});
		} else if (key?.priv) {
			const pk = hexToBytes(key?.priv);
			set(new NSecSigner(pk));
		}
	}
);
