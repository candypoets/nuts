import { CashuMint, CashuWallet, type Proof } from '@cashu/cashu-ts';
import { derived, get } from 'svelte/store';
import { db, proofs } from './db';
import { nostrPubKey } from './nostr';
import { nip05, nip19 } from 'nostr-tools';

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

export const balance = derived(
	[proofs],
	([$proofs], set) => {
		set($proofs.reduce((acc, cur) => (acc += cur.amount), 0));
	},
	0
);

export const getMyPubKey = async (): Promise<string> => {
	return window.nostr ? await window.nostr.getPublicKey() : await Promise.resolve(get(nostrPubKey));
};

export const getEncryptedContent = async (toPub: string, message: string): Promise<string> => {
	return window.nostr
		? await window.nostr.nip04.encrypt(await toPub, message)
		: //@ts-ignore
			await nostrTools.nip04.encrypt(get(nostrPrivKey), toPub, message);
};

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
