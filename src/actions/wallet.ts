import {
	CashuMint,
	CashuWallet,
	getEncodedToken,
	type AmountPreference,
	type MintKeys,
	type Proof,
	type TokenEntry,
	type MeltQuoteResponse,
	type RequestMintResponse
} from '@cashu/cashu-ts';
import { nip19, type NostrEvent } from 'nostr-tools';
import { Status, db, key, keysetsCache, proofsCache } from 'src/stores/db';

import { bech32 } from 'bech32';

import { hexToBytes } from '@noble/hashes/utils';
import { profile } from 'src/stores/profile';
import { signer } from 'src/stores/signer';
import type { WalletInfo } from 'src/stores/wallet';
import { get } from 'svelte/store';
import _ from 'lodash';
import { getDecryptedContent, getEncryptedContent, sendMessage } from './chat';
import { decode } from '@gandlaf21/bolt11-decode';
import { ADDRESS_ZERO } from 'src/stores/constants';

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
	// amount: string; // encrypted amount sent
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
	// await get(db).proofs.bulkPut(spents.map((p) => ({ ...p, status: Status.Spent })));
	// add the spents proofs to the spentProofs table
	// get(db).spentProofs.bulkAdd(spents);

	return {
		sends,
		spents,
		returnChanges,
		encodedToken: getEncodedToken({ token: toEncode, memo })
		// amount: await getEncryptedContent(get(key)?.pub, amount.toString())
	};
};

export const swap = async (
	send: CashuWallet,
	receive: CashuWallet,
	proofs: Proof[],
	amount: number
): Promise<{
	swapIn: Proof[];
	swapOut: Proof[];
}> => {
	const swapIn: Proof[] = proofs;
	// const sends: Proof[] = [];
	const swapOut: Proof[] = [];

	const { quote, request } = await receive.getMintQuote(amount);

	const meltQuote = await send.getMeltQuote(request);

	const fees = meltQuote.fee_reserve;

	const melt = await send.meltTokens(meltQuote, proofs);
	swapOut.push(...melt.change);
	if (melt.isPaid) {
		const res = await receive.mintTokens(amount, quote);
		swapOut.push(...res.proofs);
	}

	return {
		swapIn,
		swapOut
	};
};

export type Melt = {
	wallet: WalletInfo;
	meltQuote: MeltQuoteResponse;
	mintQuote?: RequestMintResponse;
	amount: number;
};

export const getMeltQuote = async (wallets: WalletInfo[], lightningInvoice: string) => {
	if (!lightningInvoice) return [];
	const decoded = decode(lightningInvoice);
	const amount = decoded?.sections?.find((s) => s.name == 'amount')?.value / 1000 || 0;
	if (!amount) {
		console.warn('incorrect lightning invoice');
		return [];
	}
	let index = 0;
	let amountAvailable = 0;
	const melts: Melt[] = [];
	console.log('getMeltQuote', lightningInvoice, amount, wallets);
	for (let wallet of wallets) {
		amountAvailable += wallet.amount - wallet.fees;
		if (amountAvailable > amount) {
			const melt = await wallet.wallet.getMeltQuote(lightningInvoice);
			melts.push({
				wallet: wallet,
				meltQuote: melt,
				amount: amount
			});
			break;
		}
		let nextWallet = wallets[index + 1];
		if (!nextWallet) break;
		const amountMinusFees = wallet.amount - wallet.fees;
		if (amountMinusFees < amount) {
			const mint = await nextWallet.wallet.getMintQuote(amountMinusFees);
			const melt = await wallet.wallet.getMeltQuote(mint.request);
			melts.push({
				wallet: wallet,
				meltQuote: melt,
				mintQuote: mint,
				amount: wallet.amount
			});
		}
	}
	if (amountAvailable < amount) return [];
	console.log(melts);
	return melts;
};

export const mint = async (wallet: CashuWallet, invoice: RequestMintResponse) => {
	const amount = decode(invoice.request).sections[2].value / 1000;
	await wallet.mintTokens(amount, invoice.quote).then(async (res) => {
		const encodedToken = getEncodedToken({
			token: [{ proofs: res.proofs, mint: wallet.mint.mintUrl }],
			memo: 'invoice'
		});
		// will be claimed twice probably
		// adding anyway in case the message is not sent
		res.proofs.forEach((p) => proofsCache.add(p));
		// await $db.proofs.bulkAdd(res.proofs);

		sendMessage(get(key).pub, encodedToken);
	});
};

export const melt = async (
	wallet: WalletInfo,
	meltQuote: MeltQuoteResponse,
	amount: number
): Promise<{ sent: Proof[]; change: Proof[] }> => {
	console.log(wallet.amount, meltQuote.amount);
	// try to melt the invoice from the least important mint to the most important (in value)
	const proofToSend = await bestProofCombination(wallet, meltQuote.amount + meltQuote.fee_reserve);
	console.log(proofToSend);
	if (!proofToSend) return { sent: [], change: [] };
	const meltResult = await wallet.wallet.meltTokens(meltQuote, proofToSend);
	console.log(meltResult);
	// proofsCache.bulkPut(wallet.proofs.map((p) => ({ ...p, status: Status.Spent })));
	meltResult.change.forEach((p) => {
		proofsCache.add(p);
	});
	console.log(wallet.proofs, meltResult.change);
	await checkProofsSpent(wallet.proofs);
	await sendMessage(
		ADDRESS_ZERO,
		getEncodedToken({ token: [{ proofs: proofToSend, mint: wallet.mintURL }] })
	);
	await sendMessage(
		get(key)?.pub,
		getEncodedToken({ token: [{ proofs: meltResult.change, mint: wallet.mintURL }] }),
		[['change']]
	);

	return { sent: proofToSend, change: meltResult.change };
};

export const toLightning = async (wallets: WalletInfo[], lightningInvoice: string) => {
	const melts = await getMeltQuote(wallets, lightningInvoice);
	for (let m of melts) {
		await melt(m.wallet, m.meltQuote, m.amount);
	}
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
export const saveNuts = async (proofs: Proof[], toPubKey?: string) => {
	if (!proofs.length || !toPubKey) return;
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
		const m = get(keysetsCache).get(key);
		if (!m) {
			console.error('could not find mint for keyset', key);
			continue;
		}
		toEncode.push({ proofs: proofsByKeySet[key], mint: m.mint });
	}
	sendMessage(toPubKey, getEncodedToken({ token: toEncode }), [['nuts']]);
};

export async function checkProofsSpent(proofs: Proof[]): Promise<string[]> {
	const proofsByKeySet = proofs.reduce(
		(acc, cur) => {
			if (!acc[cur.id]) acc[cur.id] = [];
			acc[cur.id].push(cur);
			return acc;
		},
		{} as Record<string, Proof[]>
	);
	const errors: string[] = [];
	await Promise.all(
		Object.keys(proofsByKeySet).map(async (key) => {
			// get the mint for the proof
			const t = get(keysetsCache).get(key);
			const proofs = proofsByKeySet[key];
			if (!t || !proofs.length) {
				if (!t) {
					errors.push(`keyset not found, could not check proofs: ${key}`);
					console.warn('keyset not found, could not check proofs');
				}
				return;
			}
			// verify the token
			const cashuMint = new CashuMint(t.mint);
			const keys = await cashuMint.getKeys();
			const wallet = new CashuWallet(cashuMint, keys.keysets[0]);
			// check if the proofs are already spent in the db
			// const unspend = proofs.filter((p) => !get(spentProofs).some((sp) => sp.secret == p.secret));
			// if (unspend.length) {
			const spents = await wallet.checkProofsSpent(proofs);
			// await get(db).spentProofs.bulkPut(spents);
			proofsCache.bulkPut(spents.map((p) => ({ ...p, status: Status.Spent })));
			// await get(db).proofs.bulkPut(
			// );
			// validProofs.push(...proofs.filter((p) => !spents.some((s) => s.secret == p.secret)));
		})
	);
	return errors;
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
	const lightningInvoiceRegex = /^(lnbc|lntb|LNBC|LNTB)[0-9a-zA-Z]+$/;
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

	const endpoint = new TextDecoder().decode(Uint8Array.from(requestByteArray));
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

export function isValidLNURL(ln: string): boolean {
	// Check if the string starts with "lnurl" (case-insensitive)
	if (!ln.toLowerCase().startsWith('lnurl')) {
		return false;
	}

	try {
		// Attempt to decode using bech32

		const { words } = bech32.decode(ln, 1000);
		const data = bech32.fromWords(words);

		// Convert decoded data to a string
		const urlString = new TextDecoder().decode(new Uint8Array(data));

		// Check if the decoded string is a valid URL
		new URL(urlString);

		// If we've made it this far, it's likely a valid LNURL
		return true;
	} catch (error) {
		// If any errors occur during decoding or URL parsing, it's not a valid LNURL
		return false;
	}
}

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

export async function bestProofCombination(wallet: WalletInfo, target: number) {
	if (wallet.amount < target) return [];
	const proofs: number[] = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024].reverse();
	// Sort proofs in descending order and remove duplicates
	// const sortedProofs = Array.from(new Set(proofs)).sort((a, b) => b - a);

	const combination: number[] = [];
	let remaining = target;

	for (const proof of proofs) {
		while (proof <= remaining) {
			combination.push(proof);
			remaining -= proof;
		}
	}

	const preference = combination.reduce(
		(acc, cur) => ({ ...acc, [cur]: acc[cur] ? acc[cur] + 1 : 1 }),
		{} as any
	);

	console.log(preference);
	const res = await wallet.wallet.receiveTokenEntry(
		{ proofs: wallet.proofs, mint: wallet.mintURL },
		{
			privkey: get(key)?.priv,
			preference: Object.keys(preference).map((key) => ({
				amount: Number(key),
				count: preference[key]
			}))
		}
	);
	console.log(res.proofs);
	if (res.proofs.length) {
		proofsCache.bulkPut([
			...res.proofs.map((p) => ({ ...p, status: Status.Confirmed })),
			...wallet.proofs.map((p) => ({ ...p, status: Status.Spent }))
		]);
		await saveNuts(res.proofs, get(key)?.pub);
	}
	return Object.keys(preference).flatMap((key) =>
		res.proofs.filter((p) => p.amount === Number(key)).slice(0, preference[key])
	);
}

export { hexToBytes };
