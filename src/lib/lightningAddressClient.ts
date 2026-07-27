import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { NostrEvent, UnsignedEvent } from 'nostr-tools';

export interface LightningAlias {
	alias: string;
	pubkey: string;
	mint_url: string;
	relay_url?: string | null;
	p2pk_pubkey?: string | null;
	created_at: number;
	claimed_at?: string;
	lightningAddress?: string;
	lnurlpUrl?: string;
	lnurl?: string;
}

export interface ClaimRequest {
	alias: string;
	mintUrl: string;
	p2pkPubkey?: string;
}

export type AliasAvailability =
	| { status: 'success'; available: true }
	| { status: 'success'; available: false; data: LightningAlias };

export function constructClaimRequest(
	alias: string,
	mintUrl: string,
	p2pkPubkey?: string
): ClaimRequest {
	if (!/^[A-Za-z0-9_]{1,30}$/.test(alias)) {
		throw new Error('Alias must be 1-30 characters, alphanumeric and underscores only');
	}

	return {
		alias,
		mintUrl,
		...(p2pkPubkey ? { p2pkPubkey } : {})
	};
}

export async function constructClaimAuthorizationEvent(
	request: ClaimRequest,
	pubkey: string,
	url: string
): Promise<UnsignedEvent> {
	return {
		kind: 27235,
		pubkey,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['u', url],
			['method', 'POST'],
			['payload', bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(request))))]
		],
		content: ''
	};
}

export async function postClaimRequest(
	request: ClaimRequest,
	authorizationEvent: NostrEvent,
	url: string
): Promise<{ status: 'success' | 'error'; message?: string; reason?: string }> {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Nostr ${encodeBase64(JSON.stringify(authorizationEvent))}`
		},
		body: JSON.stringify(request)
	});

	if (!response.ok) {
		throw new Error(await responseError(response, 'The handle could not be claimed.'));
	}

	return await response.json();
}

export async function queryExistingClaims(pubkey: string): Promise<LightningAlias[]> {
	const response = await fetch(`/api/aliases?pubkey=${encodeURIComponent(pubkey)}`, {
		headers: { Accept: 'application/json' }
	});
	if (!response.ok) {
		throw new Error(await responseError(response, 'Could not load your Lightning addresses.'));
	}

	const result = (await response.json()) as {
		status: 'success' | 'error';
		data?: LightningAlias[];
		reason?: string;
	};
	if (result.status !== 'success') {
		throw new Error(result.reason || 'Could not load your Lightning addresses.');
	}

	return result.data || [];
}

export async function queryAliasAvailability(alias: string): Promise<AliasAvailability> {
	const normalizedAlias = alias.trim();
	if (!/^[A-Za-z0-9_]{1,30}$/.test(normalizedAlias)) {
		throw new Error('Alias must be 1-30 characters, alphanumeric and underscores only');
	}

	const response = await fetch(`/api/claims/${encodeURIComponent(normalizedAlias)}`, {
		headers: { Accept: 'application/json' }
	});
	if (response.status === 404) return { status: 'success', available: true };
	if (!response.ok) {
		throw new Error(await responseError(response, 'Could not check handle availability.'));
	}

	const result = (await response.json()) as {
		status: 'success' | 'error';
		data?: LightningAlias;
		reason?: string;
	};
	if (result.status !== 'success' || !result.data) {
		throw new Error(result.reason || 'The handle lookup returned no claim data.');
	}

	return { status: 'success', available: false, data: result.data };
}

async function responseError(response: Response, fallback: string): Promise<string> {
	try {
		const result = (await response.json()) as { reason?: string; message?: string };
		return result.reason || result.message || fallback;
	} catch {
		return fallback;
	}
}

function encodeBase64(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
