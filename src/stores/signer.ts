import { derived, get, type Readable } from 'svelte/store';
import { key, type Key, keysCache, activeAccount } from './db';
import { hexToBytes } from 'src/actions/wallet';
import { NSecSigner } from '@nostrify/nostrify';
import { browser } from '$app/environment';

export const signer: Readable<NSecSigner | undefined> = derived(
	[keysCache, activeAccount],
	([$keysCache, $activeAccount], set) => {
		// const key: Key = $keys[$activeAccount];
		console.log($keysCache);
		const keys = Array.from($keysCache.values());
		if (!browser) return;
		// return;
		if (!keys.length) set(undefined);
		// if(window.nostr && window.nostr.getPublicKey())
		if (browser && window.nostr && window.nostr?.nip04) {
			window.nostr.getPublicKey().then((pk: string) => {
				console.log('hey hey');
				if (pk == keys[$activeAccount]?.pub) {
					console.log(pk);
					set(window.nostr);
				} else {
					set(undefined);
				}
			});
		} else if (keys[$activeAccount]?.priv) {
			const pk = hexToBytes(keys[$activeAccount].priv as string);
			set(new NSecSigner(pk));
		}
	}
);
