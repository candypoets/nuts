import { CashuMint } from '@cashu/cashu-ts';
import { validateMintKeys } from 'src/comp/util/walletUtils';
import type { Mint } from 'src/model/mint';
import { mints, mint as selectedMint } from 'src/stores/mints';
import { get } from 'svelte/store';

export const addMint = async (mintURL: string) => {
	console.log('Adding mint', mintURL);
	const mint = new CashuMint(mintURL);
	try {
		if ((get(mints) || []).filter((m) => m.mintURL === mint.mintUrl).length > 0) {
			return;
		}
		const keysets = await mint.getKeySets();
		const keys = await mint.getKeys();

		if (!validateMintKeys(keys)) {
			return;
		}

		const storeMint: Mint = {
			mintURL: mint.mintUrl,
			keys: keys.keysets,
			keysets: keysets.keysets
		};

		mints.update((state) => [...state, storeMint]);
		selectedMint.update(() => storeMint);
	} catch (e) {
		console.error(e);
		throw new Error('Could not add Mint.');
	} finally {
	}
};
