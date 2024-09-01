import { CashuMint, type MintActiveKeys } from '@cashu/cashu-ts';

// export const addMint = async (mintURL: string) => {
// 	console.log('Adding mint', mintURL);
// 	const mint = new CashuMint(mintURL);
// 	try {
// 		if ((get(mints) || []).filter((m) => m.mintURL === mint.mintUrl).length > 0) {
// 			return;
// 		}
// 		const keysets = await mint.getKeySets();
// 		const keys = await mint.getKeys();

// 		if (!validateMintKeys(keys)) {
// 			return;
// 		}

// 		const storeMint: Mint = {
// 			mintURL: mint.mintUrl,
// 			keys: keys.keysets,
// 			keysets: keysets.keysets
// 		};

// 		mints.update((state) => [...state, storeMint]);
// 		selectedMint.update(() => storeMint);
// 	} catch (e) {
// 		console.error(e);
// 		throw new Error('Could not add Mint.');
// 	} finally {
// 	}
// };

export const isPow2 = (number: number) => {
	return Math.log2(number) % 1 === 0;
};

export const validateMintKeys = (keys: MintActiveKeys): boolean => {
	let isValid = true;
	try {
		const keysets = keys.keysets.map((ks) => ks.keys);
		if (!keysets.length) {
			return false;
		}
		if (!keysets) {
			return false;
		}
		keysets.forEach((ks) => {
			const allKeys = Object.keys(ks);
			allKeys.forEach((k) => {
				//try parse int?
				if (isNaN(k)) {
					isValid = false;
				}
				if (!isPow2(k)) {
					isValid = false;
				}
			});
		});
		return isValid;
	} catch (error) {
		return false;
	}
};

export const isMintUrlValid = async (mintURL: string): Promise<boolean> => {
	try {
		const mint = new CashuMint(mintURL);
		await mint.getInfo();
		return true;
	} catch (error) {
		console.error('Error validating mint URL:', error);
		return false;
	}
};
