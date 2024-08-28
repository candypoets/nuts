import {
	CashuMint,
	CashuWallet,
	getEncodedToken,
	type AmountPreference,
	type Proof,
	type Token,
	type TokenEntry,
	type MintKeys
} from '@cashu/cashu-ts';
import { nip19, type NostrEvent, type UnsignedEvent } from 'nostr-tools';
import { db, key, proofs, spentProofs } from 'src/stores/db';

import type { WalletInfo } from 'src/stores/wallet';
import { get } from 'svelte/store';
import { hexToBytes } from '@noble/hashes/utils';
import { getDecryptedContent, getEncryptedContent, sendMessage } from './chat';
import { signer } from 'src/stores/signer';
import { profile } from 'src/stores/profile';

// send proofs from the most important mint to the least important
export const send = async (
	wallets: WalletInfo[],
	amount: number,
	memo?: string,
	unit?: string,
	// pubkey?: string,
	preference?: AmountPreference[]
): Promise<{
	sends: Proof[];
	spents: Proof[];
	returnChanges: Proof[];
	encodedToken: string;
	amount: string; // encrypted amount sent
}> => {
	let amountLeft = amount;
	const spents: Proof[] = [];
	const sends: Proof[] = [];
	const returnChanges: Proof[] = [];
	const toEncode: TokenEntry[] = [];
	while (amountLeft > 0) {
		for (let wallet of wallets) {
			if (amountLeft <= 0) {
				break;
			}
			if (unit && wallet.unit !== unit) continue;
			console.log(wallet.mintURL);
			try {
				const { returnChange, send } = await wallet.wallet.send(
					wallet.amount > amountLeft ? amountLeft : wallet.amount,
					wallet.proofs,
					{
						preference
						// counter: count
						// pubkey
					}
				);

				toEncode.push({ proofs: send, mint: wallet.mintURL });
				spents.push(...wallet.proofs);
				sends.push(...send);
				returnChanges.push(...returnChange);

				amountLeft -= wallet.amount;
				continue;
			} catch (e) {
				console.error(e);
				continue;
			}
		}
	}
	// remove the spents proofs from the table
	await get(db).proofs.bulkDelete(spents.map((p) => p.secret));
	// add the spents proofs to the spentProofs table
	get(db).spentProofs.bulkAdd(spents);

	return {
		sends,
		spents,
		returnChanges,
		encodedToken: getEncodedToken({ token: toEncode, memo }),
		amount: await getEncryptedContent(get(key).pub, amount.toString())
	};
};

// export const receive = async (proofs: Proof[], mint: string) => {
// 	let amountLeft = amount;
// 	const spents: Proof[] = [];
// 	const sends: Proof[] = [];
// 	const returnChanges: Proof[] = [];
// 	const toEncode: TokenEntry[] = [];
// 	while (amountLeft > 0) {
// 		for (let wallet of wallets) {
// 			if (amountLeft <= 0) {
// 				break;
// 			}
// 			if (unit && wallet.unit !== unit) continue;
// 			const { returnChange, send } = await wallet.wallet.receive(amount, wallet.proofs, {
// 				preference
// 				// counter: count
// 				// pubkey
// 			});

// 			toEncode.push({ proofs: send, mint: wallet.mintURL });
// 			spents.push(...wallet.proofs);
// 			sends.push(...send);
// 			returnChanges.push(...returnChange);

// 		}
// 	}
// 	// remove the spents proofs from the table
// 	await get(db).proofs.bulkDelete(spents.map((p) => p.secret));
// 	// add the spents proofs to the spentProofs table
// 	get(db).spentProofs.bulkAdd(spents);

// 	return {
// 		sends,
// 		returnChanges,
// 		encodedToken: getEncodedToken({ token: toEncode, memo }),
// 		amount: await getEncryptedContent(get(nostrPubKey), amount.toString())
// 	};
// }
//

export const isValidToken = (obj: any) => {
	// todo implement
	return true;
};

export const getKeysForUnit = (keys: MintKeys[], unit = 'sat'): MintKeys | undefined => {
	return keys.find((k) => {
		return k.unit === unit;
	});
};

export const getAmountForTokenSet = (tokens: Array<Proof>): number => {
	return (tokens || []).reduce((acc, t) => {
		return acc + t.amount;
	}, 0);
};

export const signEvent = async (event: Omit<NostrEvent, 'id' | 'sig'>) => {
	event = await get(signer)?.signEvent(event);
	return event as NostrEvent;
};

// save a cashu token representing the entire user balance
// then send a private message to yourself with the encrypted tokens
export const saveNuts = async (proofs: Proof[], toPubKey: string) => {
	if (!proofs.length) return;
	const toEncode: TokenEntry[] = [];
	const proofsByKeySet = proofs.reduce(
		(acc, cur) => {
			if (!acc[cur.id]) acc[cur.id] = [];
			acc[cur.id].push(cur);
			return acc;
		},
		{} as Record<string, Proof[]>
	);
	for (const key in proofsByKeySet) {
		const m = await get(db).keysets.get({ id: key });
		if (!m) {
			console.error('could not find mint for keyset', key);
			continue;
		}
		toEncode.push({ proofs: proofsByKeySet[key], mint: m.mint });
	}
	// do not update the profile if it has not been loaded yet
	if (!get(profile).name) return;
	sendMessage(toPubKey, getEncodedToken({ token: toEncode }), [['nuts']]);
};

export async function checkProofsSpent(proofs: Proof[]) {
	const proofsByKeySet = proofs.reduce(
		(acc, cur) => {
			if (!acc[cur.id]) acc[cur.id] = [];
			acc[cur.id].push(cur);
			return acc;
		},
		{} as Record<string, Proof[]>
	);
	await Promise.all(
		Object.keys(proofsByKeySet).map(async (key) => {
			// get the mint for the proof
			const t = await get(db).keysets.get({ id: key });
			const proofs = proofsByKeySet[key];
			if (!t || !proofs.length) return;
			// verify the token
			const cashuMint = new CashuMint(t.mint);
			const keys = await cashuMint.getKeys();
			const wallet = new CashuWallet(cashuMint, keys.keysets[0]);
			// check if the proofs are already spent in the db
			// const unspend = proofs.filter((p) => !get(spentProofs).some((sp) => sp.secret == p.secret));
			// if (unspend.length) {
			const spents = await wallet.checkProofsSpent(proofs);
			console.log('spents', spents);
			await get(db).spentProofs.bulkPut(spents);
			await get(db).proofs.bulkDelete(spents.map((s) => s.secret));
			// validProofs.push(...proofs.filter((p) => !spents.some((s) => s.secret == p.secret)));
		})
	);
}

export async function retrieveSpentProofs(event: NostrEvent, pubkey: string): Promise<Proof[]> {
	const content = event.tags.find((t) => t[0] == 's')?.[1];
	if (!content) return [];
	const decrypted = await getDecryptedContent(pubkey, content);
	const spentProofs = JSON.parse(decrypted);
	return spentProofs;
}

export function decodePrivKey(value: string): Uint8Array {
	let pk;
	if (value.startsWith('nsec')) {
		const { type, data } = nip19.decode(value);
		pk = data;
	} else {
		pk = hexToBytes(value);
	}
	return pk;
}

/**
 * Checks if a given string is a valid Lightning invoice.
 * @param {string} invoice - The string to check.
 * @returns {boolean} - True if the string is a valid Lightning invoice, false otherwise.
 */
export function isLightningInvoice(invoice: string): boolean {
	// Regular expression to match Lightning invoice format
	const lightningInvoiceRegex = /^(lnbc|lntb)[0-9a-zA-Z]+$/;
	return lightningInvoiceRegex.test(invoice);
}

/**
 * Checks if a given string is a valid Nostr public key (npub).
 * @param {string} npub - The string to check.
 * @returns {boolean} - True if the string is a valid Nostr public key, false otherwise.
 */
export function isNpub(npub: string): boolean {
	// Regular expression to match Nostr public key format (Bech32 with npub prefix)
	const npubRegex = /^npub[0-9a-zA-Z]+$/;
	return npubRegex.test(npub);
}

export function isNostr(content: string): boolean {
	// Regular expression to match Nostr public key format (Bech32 with npub prefix)
	const npubRegex = /^nostr:npub[0-9a-zA-Z]+$/;
	return npubRegex.test(content);
}

export const getInvoiceFromAddress = async (
	address: string,
	amount: number
): Promise<{ pr: string; maxSendable: number; minSendable: number }> => {
	const addressParts = address.split('@');
	const endpoint = `https://${addressParts[1]}/.well-known/lnurlp/${addressParts[0]}`;
	return await LNURLLookup(endpoint, amount);
};

export const getInvoiceFromLNURL = async (
	LNURL: string,
	amount: number
): Promise<{ pr: string; maxSendable: number; minSendable: number }> => {
	const { prefix: hrp, words: dataPart } = bech32.decode(LNURL, 2000);
	const requestByteArray = bech32.fromWords(dataPart);

	const endpoint = Buffer.from(requestByteArray).toString();
	return await LNURLLookup(endpoint, amount);
};

const LNURLLookup = async (endpoint: string, amount: number) => {
	const { callback, maxSendable, minSendable } = (await (await fetch(endpoint)).json()) as {
		callback: string;
		maxSendable: number;
		minSendable: number;
	};
	if (!callback) {
		throw new Error('No callback url found.');
	}
	const cb = callback + (callback.includes('?') ? `&` : `?`) + `amount=${amount * 1000}`;
	const { pr } = (await (await fetch(cb)).json()) as { pr: string };
	return { pr, maxSendable, minSendable };
};

export const formatAmount = (amount: number, unit: string, withSuffix = true): string => {
	if (unit === 'sat') {
		return formatSats(amount, withSuffix);
	} else {
		console.log(amount);
		return formatSats(amount, withSuffix);
	}
};

const formatSats = (amount: number, withSuffix: boolean): string => {
	return (
		new Intl.NumberFormat('en-US').format(amount) +
		(withSuffix ? ' ' + (amount > 1 ? 'sats' : 'sat') : '')
	);
};

export { hexToBytes };
