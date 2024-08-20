import { derived, get } from 'svelte/store';
import { nostrPrivKey, nostrPubKey, pool } from './nostr';
import { db, proofs } from './db';
import { CashuMint, CashuWallet, type Proof } from '@cashu/cashu-ts';
import { key } from './key';

export type WalletInfo = {
	amount: number;
	mintURL: string;
	proofs: Proof[];
	unit: string;
	wallet: CashuWallet;
};

export const wallets = derived(
	[nostrPubKey, db, proofs],
	([pubkey, $db, $proofs], set) => {
		$db.keysets.toArray().then(async (keysets) => {
			const wallets = await Promise.all(
				keysets.map(async (keyset) => {
					const proofs = $proofs.filter((proof) => proof.id === keyset.id);
					const amount = proofs.reduce((acc, cur) => (acc += cur.amount), 0);
					const cashuMint: CashuMint = new CashuMint(keyset.mint);
					const keys = await cashuMint.getKeys(keyset.id, keyset.mint);
					const wallet = new CashuWallet(cashuMint, keys.keysets[0]);
					return {
						amount,
						mintURL: keyset.mint,
						proofs,
						unit: keys.keysets[0].unit,
						wallet
					};
				})
			);
			// sort the wallets from the lowest amount to the highest
			wallets.sort((a, b) => a.amount - b.amount);
			set(wallets);
		});
	},
	[] as WalletInfo[]
);
