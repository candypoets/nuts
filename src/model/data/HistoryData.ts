import type { Proof } from '@cashu/cashu-ts';

interface HistoryData {
	/**
	 * mint url
	 */
	mint: string;
	keyset: Array<string>;
	send?: Array<string>; // proofs secrets
	returnChange?: Array<string>; // proofs secrets
	encodedToken?: string;
	to?: string;
	from?: string;
}

export type { HistoryData };
