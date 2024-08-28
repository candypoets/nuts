import { browser } from '$app/environment';
import { CashuMint, type Proof } from '@cashu/cashu-ts';
import type { Mint } from '../../src/model/mint';

import { getAmountForTokenSet } from 'src/actions/wallet';
import { derived, get, writable, type Readable } from 'svelte/store';
import { db, dbMints, proofs } from './db';
import { timestamp60 } from './time';

export const mints = derived(
	[dbMints, db, timestamp60],
	([$dbMints, $db, $timestamp60], set) => {
		Promise.all(
			$dbMints.map(async (m) => {
				console.log(m);
				const mint = new CashuMint(m.url);
				const keysets = await mint.getKeySets();
				const keys = await mint.getKeys();

				await $db.keysets.put({ id: keys.keysets[0].id, mint: m.url });
				return {
					mintURL: m.url,
					keysets: keysets.keysets,
					keys: keys.keysets
				};
			})
		).then((res) => set(res));
	},
	[] as Array<Mint>
);

export const mint = writable<Mint>();

export const amountAvailable = (mint: Mint) =>
	derived(
		[proofs],
		([$proofs], set) => {
			if (!browser) set(0);
			if (!mint) set(0);
			getTokensForMint(mint).then((tokens) => {
				const amount = getAmountForTokenSet(tokens);
				set(amount);
			});
		},
		0
	);

export const getAmountAvailable = async (mint: Mint) => {
	if (!mint) return 0;
	const tokens = await getTokensForMint(mint);
	return getAmountForTokenSet(tokens);
};

export const totalAmountAvailable = derived(
	[mints, proofs],
	([$mints, $proofs], set) => {
		let total = 0;
		console.log($mints);
		Promise.all(
			$mints.map(async (m) => {
				const tokens = await getTokensForMint(m);
				console.log('tokens', tokens);
				total += getAmountForTokenSet(tokens);
			})
		).then((res) => set(total));
		// console.log('total', total);
		// set(total);
	},
	0
);

export type MintInfos = {
	mints: Array<{ mint: string; proofs: Array<Proof>; amountAvailable: number; units: string }>;
	totalAmountAvailable: number;
};

export const mintInfos: Readable<MintInfos> = derived([mints, proofs], ([$mints, $proofs], set) => {
	const mintInfos: MintInfos = {
		mints: [],
		totalAmountAvailable: 0
	};
	$mints.forEach(async (m) => {
		const tokens = await getTokensForMint(m);
		const amount = getAmountForTokenSet(tokens);
		mintInfos.mints.push({
			mint: m.mintURL,
			proofs: tokens,
			amountAvailable: amount,
			units: 'sats'
		});
		mintInfos.totalAmountAvailable += amount;
	});
	mintInfos.mints.sort((a, b) => a.amountAvailable - b.amountAvailable);
	set(mintInfos);
});

export const getTokensForMint = async (mint: Mint) => {
	if (!mint) return [];
	// find all the keyset id for the given mint
	const res = await get(db).keysets.where('mint').equals(mint.mintURL).toArray();

	// for each keyset id, find the proofs that belong to it
	const proofs = await get(db)
		.proofs.where('id')
		.anyOf(res.map((r) => r.id))
		.toArray();

	return proofs;
};

export const tokensForMint = derived(
	[mint],
	([$mint], set) => {
		if (!$mint) set([]);
		getTokensForMint($mint).then((tokens) => {
			set(tokens);
		});
	},
	[] as Array<Proof>
);
