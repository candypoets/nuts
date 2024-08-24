import { browser } from '$app/environment';
import { CashuMint, type Proof } from '@cashu/cashu-ts';
import type { Mint } from '../../src/model/mint';

import { derived, get, writable, type Readable } from 'svelte/store';
import { addMint } from 'src/actions/mint';
import { getAmountForTokenSet } from 'src/comp/util/walletUtils';
import { db, proofs } from './db';
import { liveQuery } from 'dexie';
import { nostrPubKey } from './nostr';

const minibits = new CashuMint('https://mint.minibits.cash/Bitcoin');

const lnserver = new CashuMint('https://mint.lnserver.com/');

const mints = writable<Array<Mint>>([]);

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
	[mints, nostrPubKey, proofs],
	([$mints, $pubkey, $proofs], set) => {
		if (!$pubkey) set(0);
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

export { mints };
