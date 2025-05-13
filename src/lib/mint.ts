import { CashuMint, type MintActiveKeys } from '@cashu/cashu-ts';

export const isPow2 = (number: number) => {
	return Math.log2(number) % 1 === 0;
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
