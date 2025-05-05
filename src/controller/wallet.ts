import { writable } from 'svelte/store';
import { kind17375 } from './nostr';
import Icon from '@iconify/svelte';
import { derived } from 'svelte/store';
import { normalizeURL } from 'nostr-tools/utils';
import type { Mint } from 'src/parsers/mint';

async function fetchMintData(mint: string): Promise<Mint> {
	try {
		const response = await fetch(
			`https://api.audit.8333.space/mints/url/?url=${normalizeURL(mint).replace(/\/$/, '')}`
		);
		if (!response.ok) {
			throw new Error('Failed to fetch mint data');
		}
		const res = await response.json();
		res.name = res.name.replace(/mint/gi, '').replace(/cashu/gi, '');
		return res;
	} catch (err) {
		return {
			name: mint
		} as Mint;
	}
}

export const mints = derived(kind17375, async ($kind17375) => {
	if ($kind17375 && $kind17375.parsed) {
		const mintsList = $kind17375.parsed.mints || [];
		const mintsWithInfo = await Promise.all(
			mintsList.map(async (mint) => {
				return await fetchMintData(mint);
			})
		);
		return mintsWithInfo;
	}
	return [];
});

export const activeMintUrl = writable<string | null>(null);

export const mint = derived([mints, activeMintUrl], ([$mints, $activeMintUrl]) => {
	return $mints.then((mints) => {
		if (!$activeMintUrl || mints.length === 0) return null;
		return mints.find(
			(mint) =>
				normalizeURL(mint.url || '').replace(/\/$/, '') ===
				normalizeURL($activeMintUrl).replace(/\/$/, '')
		);
	});
});

export const balanceByMint = writable<{ [mint: string]: number }>({});

export const balance = derived(balanceByMint, ($balanceByMint) => {
	return Object.values($balanceByMint).reduce((sum, current) => sum + current, 0);
});
