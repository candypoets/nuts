import type { EventTemplate } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';
import { derived, get, writable } from 'svelte/store';

import { now } from 'src/lib/period';
import { cashuManager } from 'src/model/cashu';
import { nostrManager } from 'src/model/nostr-main';
import type { Kind7375Parsed, ProofUnion } from 'src/types';
import type { Mint } from 'src/types/mint';
import { normalizeMintURL } from 'src/lib/utils';
import type { ParsedEvent } from 'src/types';
import { kind17375, kinds7375 } from 'src/controller/nostr';

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
			(mint) => normalizeMintURL(mint.url || '') === normalizeMintURL($activeMintUrl)
		);
	});
});

export const balanceByMint = writable<{ [mint: string]: number }>({});

export const balance = derived(balanceByMint, ($balanceByMint) => {
	return Object.values($balanceByMint).reduce((sum, current) => sum + current, 0);
});

export const deletedKind7375Ids = writable<string[]>([]);

export function proofsByMint() {
	// Group proofs by mint URL using eventsByMint as wrapper
	const groupedByMint: Record<string, ProofUnion[]> = {};
	const eventsByMintData = eventsByMint();

	for (const [mintUrl, events] of Object.entries(eventsByMintData)) {
		const allProofs: ProofUnion[] = [];

		// Collect all proofs from all events for this mint
		for (const event of events) {
			if (event.parsed?.proofs) {
				allProofs.push(...event.parsed.proofs);
			}
		}

		// Deduplicate proofs based on id, secret, and C
		const uniqueProofs: ProofUnion[] = [];
		const seenProofs = new Set<string>();

		for (const proof of allProofs) {
			const proofKey = `${proof.id}-${proof.secret}-${proof.C}`;
			if (!seenProofs.has(proofKey)) {
				seenProofs.add(proofKey);
				uniqueProofs.push(proof);
			}
		}

		groupedByMint[mintUrl] = uniqueProofs;
	}

	return groupedByMint;
}

export function eventsByMint() {
	// Group events by mint URL
	const groupedByMint: Record<string, ParsedEvent<Kind7375Parsed>[]> = {};
	for (const event of get(kinds7375)) {
		if (get(deletedKind7375Ids).includes(event.id)) {
			continue;
		}
		if (event.parsed && event.parsed?.mintUrl) {
			const normalizedMintUrl = normalizeURL(event.parsed.mintUrl).replace(/\/$/, '');
			if (!groupedByMint[normalizedMintUrl]) {
				groupedByMint[normalizedMintUrl] = [];
			}

			// Check if the event contains proofs locked to a specific pubkey
			let hasValidP2pkProof = false;
			if (event.parsed?.proofs && event.parsed.proofs.length > 0) {
				for (const proof of event.parsed.proofs) {
					if (proof.secret && proof.secret.includes('p2pk:')) {
						// This proof is locked to a p2pk address
						const p2pkMatch = proof.secret.match(/p2pk:([a-f0-9]+)/i);
						if (p2pkMatch && p2pkMatch[1]) {
							// Check if the proof's pubkey matches the p2pkPubKey in kind17375
							if (get(kind17375)?.parsed?.p2pkPubKey === p2pkMatch[1]) {
								hasValidP2pkProof = true;
								break;
							}
						}
					} else {
						hasValidP2pkProof = true;
					}
				}
			}

			// If the event has at least one valid p2pk proof, add it to the mint's events
			if (hasValidP2pkProof) {
				groupedByMint[normalizedMintUrl].push(event);
			}
		}
	}

	return groupedByMint;
}

export async function deleteNuts(mintUrl: string, deletedNuts: ProofUnion[]) {
	await walletLoaded;
	// Get all events for the specified mint URL, we delete all of them
	const eventsToDelete = eventsByMint()[normalizeURL(mintUrl).replace(/\/$/, '')] || [];
	// Get all current proofs for this mint
	let currentProofs = proofsByMint()[normalizeURL(mintUrl).replace(/\/$/, '')] || [];

	if (currentProofs.length) {
		currentProofs = await cashuManager.checkProofState(mintUrl, currentProofs);
	}
	// Update the balance for this mint
	// Keep only proofs that weren't deleted
	const remainingProofs = currentProofs.filter(
		(proof) =>
			!deletedNuts.some(
				(deletedProof) =>
					proof.id === deletedProof.id &&
					proof.secret === deletedProof.secret &&
					deletedProof.C === proof.C
			)
	);

	const event: EventTemplate = {
		kind: 7375,
		content: JSON.stringify({
			mint: mintUrl,
			proofs: remainingProofs,
			del: eventsToDelete.map((ev) => ev.id)
		}),
		tags: [],
		created_at: now()
	};

	nostrManager.publish('deleteNuts', event);
}

export async function saveNuts(mintUrl: string, nutsToSave: ProofUnion[]) {
	await walletLoaded;
	// Get all events for the specified mint URL, we delete all of them
	const eventsToDelete = eventsByMint()[normalizeURL(mintUrl).replace(/\/$/, '')] || [];
	// Get all current proofs for this mint
	let currentProofs = proofsByMint()[normalizeURL(mintUrl).replace(/\/$/, '')] || [];

	if (currentProofs.length) {
		currentProofs = await cashuManager.checkProofState(mintUrl, currentProofs);
	}

	// Check if any of the nutsToSave are not already in currentProofs
	const newNuts = nutsToSave.filter(
		(nutToSave) =>
			!currentProofs.some(
				(existingProof) =>
					existingProof.id === nutToSave.id &&
					existingProof.secret === nutToSave.secret &&
					existingProof.C === nutToSave.C
			)
	);

	// If all nuts are already saved, stop the operation
	if (newNuts.length === 0) {
		console.log('All nuts already saved, no operation needed');
		return;
	}

	// Only combine the current proofs with the new ones that aren't already present
	const combinedProofs = [...currentProofs, ...newNuts];

	const event: EventTemplate = {
		kind: 7375,
		content: JSON.stringify({
			mint: mintUrl,
			proofs: combinedProofs,
			del: eventsToDelete.map((ev) => ev.id)
		}),
		tags: [],
		created_at: now()
	};

	nostrManager.publish('saveNuts', event);
}

export const walletLoaded = (() => {
	let resolvePromise: (value: boolean) => void;
	const promise = new Promise<boolean>((resolve) => {
		resolvePromise = resolve;
	});

	// Add resolve method to the promise instance
	(promise as any).resolve = (value: boolean = true) => resolvePromise(value);

	return promise as Promise<boolean> & { resolve: (value?: boolean) => void };
})();
