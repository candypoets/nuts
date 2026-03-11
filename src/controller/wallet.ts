import { type Kind7375Parsed, type ParsedEvent, type ProofUnion } from '@candypoets/nipworker';
import { normalizeURL } from 'nostr-tools/utils';
import { derived, get, writable } from 'svelte/store';

import { kind17375, kinds7375 } from 'src/controller/nostr';
import { normalizeMintURL } from 'src/lib/utils';
import type { Mint } from 'src/types/mint';

// Cache for mint data to avoid repeated fetches
const mintDataCache = new Map<string, Mint>();
const pendingFetches = new Map<string, Promise<Mint>>();

// Helper to fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeout);
		return response;
	} catch (error) {
		clearTimeout(timeout);
		throw error;
	}
}

export async function fetchMintData(mint: string): Promise<Mint> {
	let normalizedUrl: string;
	
	// Normalize URL with error handling
	try {
		normalizedUrl = normalizeURL(mint).replace(/\/$/, '');
	} catch {
		// Invalid URL format, return immediate fallback
		return { name: mint || 'Unknown Mint', url: mint || '' } as Mint;
	}

	// Return cached data if available
	if (mintDataCache.has(normalizedUrl)) {
		return mintDataCache.get(normalizedUrl)!;
	}

	// Return existing pending fetch to avoid duplicate requests
	if (pendingFetches.has(normalizedUrl)) {
		return pendingFetches.get(normalizedUrl)!;
	}

	const fetchPromise = (async (): Promise<Mint> => {
		try {
			// Fetch mint's own info (critical) and auditor data (optional) independently
			const infoPromise = fetchWithTimeout(`${normalizedUrl}/v1/info`, 5000)
				.then(r => r.ok ? r.json() : null)
				.catch(() => null);
			
			const auditPromise = fetchWithTimeout(
				`https://api.audit.8333.space/mints/url/?url=${normalizedUrl}`,
				3000
			)
				.then(r => r.ok ? r.json() : null)
				.catch(() => null);

			// Wait for both, but mint info is required
			const [infores, auditRes] = await Promise.all([infoPromise, auditPromise]);

			// If we can't get mint info, return fallback
			if (!infores) {
				throw new Error('Failed to fetch mint info');
			}

			const result: Mint = {
				...auditRes,
				parsedInfo: infores,
				name: infores.name?.replace(/mint/gi, '').replace(/cashu/gi, '') || 'Unknown Mint',
				url: normalizedUrl
			};

			// Cache the result
			mintDataCache.set(normalizedUrl, result);
			return result;
		} catch (err) {
			const fallbackMint = { 
				name: mint?.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'Unknown Mint', 
				url: normalizedUrl 
			} as Mint;
			// Cache fallback to avoid repeated failed requests
			mintDataCache.set(normalizedUrl, fallbackMint);
			return fallbackMint;
		} finally {
			pendingFetches.delete(normalizedUrl);
		}
	})();

	pendingFetches.set(normalizedUrl, fetchPromise);
	return fetchPromise;
}

export function getCachedMintData(mint: string): Mint | undefined {
	const normalizedUrl = normalizeURL(mint).replace(/\/$/, '');
	return mintDataCache.get(normalizedUrl);
}

export function clearMintDataCache(): void {
	mintDataCache.clear();
	pendingFetches.clear();
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

export const walletLoaded = (() => {
	let resolvePromise: (value: boolean) => void;
	const promise = new Promise<boolean>((resolve) => {
		resolvePromise = resolve;
	});

	// Add resolve method to the promise instance
	(promise as any).resolve = (value: boolean = true) => resolvePromise(value);

	return promise as Promise<boolean> & { resolve: (value?: boolean) => void };
})();

/**
 * Validate and format a Cashu P2PK pubkey
 * - Ensures it's prefixed with "02" for Cashu compatibility
 * - Validates length is exactly 66 characters (02 prefix + 64 hex chars)
 * - Validates it's valid hexadecimal
 */
export function validateP2pkPubkey(pubkey: string): string {
	// Ensure pubkey is prefixed with "02"
	const keyWithPrefix = pubkey.startsWith('02') ? pubkey : '02' + pubkey;

	// Validate: should be 66 characters (02 prefix + 64 hex chars)
	if (keyWithPrefix.length !== 66) {
		throw new Error(
			`Invalid p2pk pubkey length: expected 66 characters, got ${keyWithPrefix.length}`
		);
	}

	// Validate: should be valid hex
	if (!/^[0-9a-fA-F]{66}$/.test(keyWithPrefix)) {
		throw new Error('Invalid p2pk pubkey: must be valid hexadecimal');
	}

	return keyWithPrefix;
}
