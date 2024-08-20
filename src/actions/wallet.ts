import {
	getEncodedToken,
	type AmountPreference,
	type Proof,
	type TokenEntry
} from '@cashu/cashu-ts';
import type { NostrEvent, UnsignedEvent } from 'nostr-tools';
import { db, proofs } from 'src/stores/db';
import { nostrPubKey, profile, signAndSend, signer } from 'src/stores/nostr';
import type { WalletInfo } from 'src/stores/wallet';
import { get } from 'svelte/store';
import { getEncryptedContent } from './chat';

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
		returnChanges,
		encodedToken: getEncodedToken({ token: toEncode, memo }),
		amount: await getEncryptedContent(get(nostrPubKey), amount.toString())
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

export const signEvent = async (event: Omit<NostrEvent, 'id' | 'sig'>) => {
	if (window.nostr) {
		event = await window.nostr.signEvent(event);
	} else {
		event = await get(signer).signEvent(event);
	}
	return event as NostrEvent;
};

export const getMyPubKey = async (): Promise<string> => {
	return window.nostr ? await window.nostr.getPublicKey() : get(nostrPubKey);
};

// save a cashu token representing the entire user balance
// add it to the user profile under the nuts entry, encrypted
export const saveNuts = async (proofs: Proof[], toPubKey: string) => {
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
	const encryptedNuts = await getEncryptedContent(toPubKey, getEncodedToken({ token: toEncode }));
	// do not update the profile if it has not been loaded yet
	if (!get(profile).name) return;
	let event: UnsignedEvent = {
		kind: 0,
		tags: [],
		content: JSON.stringify({
			name: get(profile).name,
			about: get(profile).about,
			picture: get(profile).picture,
			nuts: encryptedNuts
		}),
		created_at: Math.floor(Date.now() / 1000),
		pubkey: toPubKey
	};

	await signAndSend(event);
};
