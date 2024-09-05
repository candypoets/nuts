import { CashuMint, CashuWallet, type Proof } from '@cashu/cashu-ts';
import { derived, get } from 'svelte/store';
import { db, keysets, proofs } from './db';
import { nip05, nip19 } from 'nostr-tools';

export type WalletInfo = {
	amount: number;
	fees: number;
	mintURL: string;
	proofs: Proof[];
	unit: string;
	wallet: CashuWallet;
};

export const wallets = derived(
	[proofs],
	([$proofs], set) => {
		Promise.all(
			get(keysets).map(async (keyset) => {
				const proofs = $proofs.filter((proof) => proof.id === keyset.id);
				const amount = proofs.reduce((acc, cur) => (acc += cur.amount), 0);
				const fees = proofs.reduce((acc, cur) => (acc += keyset.input_fee_ppk || 0), 0);
				const cashuMint: CashuMint = new CashuMint(keyset.mint);
				const keys = await cashuMint.getKeys(keyset.id, keyset.mint);
				const wallet = new CashuWallet(cashuMint, keys.keysets[0]);
				return {
					amount,
					fees: Math.ceil(fees / 1000), // in case of mint or swap, how much fees are paid for all the proofs
					mintURL: keyset.mint,
					proofs,
					unit: keys.keysets[0].unit,
					wallet
				};
			})
		).then((wallets) => {
			wallets.sort((a, b) => a.amount - b.amount);
			set(wallets);
		});
		// sort the wallets from the lowest amount to the highest
	},
	[] as WalletInfo[]
);

export const balanceMinusFees = derived(
	[wallets],
	([$wallets], set) => {
		set($wallets.reduce((acc, cur) => (acc += cur.amount - cur.fees), 0));
	},
	0
);

export const balance = derived(
	[proofs],
	([$proofs], set) => {
		set($proofs.reduce((acc, cur) => (acc += cur.amount), 0));
	},
	0
);

export const getConvertedPubKey = async (key: string) => {
	key = await resolveNip05(key);
	let nostrPubKey = key.startsWith('npub') ? (nip19.decode(key).data as string) : key;
	return nostrPubKey;
};

const resolveNip05 = async (nostrAddr: string) => {
	if (!nostrAddr.includes('.')) {
		return nostrAddr;
	}
	const profile = await nip05.queryProfile(nostrAddr);
	if (profile?.pubkey) {
		return profile?.pubkey;
	} else {
		throw new Error('could not fetch nip-05');
	}
};
