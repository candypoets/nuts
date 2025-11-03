import type { Kind0Parsed, ParsedEvent } from '@candypoets/nipworker';
import { asKind0 } from '@candypoets/nipworker/utils';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bech32 } from 'bech32';
import { getPublicKey, nip19, type NostrEvent } from 'nostr-tools';
import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { normalizeURL } from 'nostr-tools/utils';

export function decodePrivKey(value: string): Uint8Array {
	let pk;
	if (value.startsWith('nsec')) {
		const { type, data } = nip19.decode(value);
		pk = data;
	} else {
		pk = hexToBytes(value);
	}
	return pk;
}

/**
 * Checks if a given string is a valid Lightning invoice.
 * @param {string} invoice - The string to check.
 * @returns {boolean} - True if the string is a valid Lightning invoice, false otherwise.
 */
export function isLightningInvoice(invoice: string): boolean {
	// Regular expression to match Lightning invoice format
	const lightningInvoiceRegex = /^(lnbc|lntb|LNBC|LNTB)[0-9a-zA-Z]+$/;
	return lightningInvoiceRegex.test(invoice);
}

/**
 * Checks if a given string is a valid Nostr public key (npub).
 * @param {string} npub - The string to check.
 * @returns {boolean} - True if the string is a valid Nostr public key, false otherwise.
 */
export function isNpub(npub: string): boolean {
	// Regular expression to match Nostr public key format (Bech32 with npub prefix)
	const npubRegex = /^npub[0-9a-zA-Z]+$/;
	return npubRegex.test(npub);
}

export function isNostr(content: string): boolean {
	// Regular expression to match Nostr public key format (Bech32 with npub prefix)
	const npubRegex = /^nostr:npub[0-9a-zA-Z]+$/;
	return npubRegex.test(content);
}

/**
 * Extracts LNURL from a user profile
 * @param {any} profile - User profile containing Lightning Address or LNURL
 * @returns {string | null} - Returns the LNURL if found, null otherwise
 */
export function GetLNURLFromProfile(profile: ParsedEvent): string | null {
	const kind0 = asKind0(profile);
	if (!kind0) {
		return null;
	}

	const lud06 = kind0?.lud06()?.toString();
	// First check if LUD06 (direct LNURL) is available
	if (lud06) {
		return lud06;
	}
	const lud16 = kind0?.lud16()?.toString();
	// Check for Lightning Address (LUD16)
	if (lud16) {
		const addressParts = lud16.split('@');
		if (addressParts.length === 2) {
			return `https://${addressParts[1]}/.well-known/lnurlp/${addressParts[0]}`;
		}
	}

	return null;
}

export const getInvoiceFromProfile = async (
	profile: ParsedEvent,
	amount: number
): Promise<{ pr: string; lnurl: string; maxSendable: number; minSendable: number }> => {
	const kind0 = asKind0(profile);
	if (!kind0) {
		throw new Error('Profile has no content');
	}
	const lud16 = kind0?.lud16()?.toString();
	// Prefer LUD16 (Lightning Address) if available
	if (lud16) {
		const res = await getInvoiceFromAddress(lud16, amount);
		return res;
	}

	const lud06 = kind0?.lud06()?.toString();
	// Fall back to LUD06 (LNURL)
	if (lud06) {
		const res = await getInvoiceFromLNURL(lud06, amount);
		return { ...res, lnurl: lud06 };
	}

	throw new Error('Profile has no Lightning Address (LUD16) or LNURL (LUD06)');
};

export const getInvoiceFromAddress = async (
	address: string,
	amount: number,
	event?: NostrEvent
): Promise<{ pr: string; maxSendable: number; minSendable: number; lnurl: string }> => {
	const addressParts = address.split('@');
	const endpoint = `https://${addressParts[1]}/.well-known/lnurlp/${addressParts[0]}`;
	const result = await LNURLLookup(endpoint, amount, event);
	return { ...result, lnurl: endpoint };
};

export const getInvoiceFromLNURL = async (
	LNURL: string,
	amount: number,
	event?: NostrEvent
): Promise<{ pr: string; maxSendable: number; minSendable: number }> => {
	const { prefix: hrp, words: dataPart } = bech32.decode(LNURL, 2000);
	const requestByteArray = bech32.fromWords(dataPart);

	const endpoint = new TextDecoder().decode(Uint8Array.from(requestByteArray));
	return await LNURLLookup(endpoint, amount, event);
};

const LNURLLookup = async (endpoint: string, amount: number, event?: NostrEvent) => {
	const { callback, maxSendable, minSendable } = (await (await fetch(endpoint)).json()) as {
		callback: string;
		maxSendable: number;
		minSendable: number;
	};
	if (!callback) {
		throw new Error('No callback url found.');
	}
	let cb = callback + (callback.includes('?') ? `&` : `?`) + `amount=${amount * 1000}`;
	if (event) {
		cb += `nostr=${JSON.stringify(event)}`;
		cb += `comment=${event.content}`;
	}
	const { pr } = (await (await fetch(cb)).json()) as { pr: string };
	return { pr, maxSendable, minSendable };
};

export function isValidLNURL(ln: string): boolean {
	// Check if the string starts with "lnurl" (case-insensitive)
	if (!ln.toLowerCase().startsWith('lnurl')) {
		return false;
	}

	try {
		// Attempt to decode using bech32

		const { words } = bech32.decode(ln, 1000);
		const data = bech32.fromWords(words);

		// Convert decoded data to a string
		const urlString = new TextDecoder().decode(new Uint8Array(data));

		// Check if the decoded string is a valid URL
		new URL(urlString);

		// If we've made it this far, it's likely a valid LNURL
		return true;
	} catch (error) {
		// If any errors occur during decoding or URL parsing, it's not a valid LNURL
		return false;
	}
}

export const formatAmount = (amount: number, unit: string, withSuffix = true): string => {
	if (unit === 'sat') {
		return formatSats(amount, withSuffix);
	} else {
		return formatSats(amount, withSuffix);
	}
};

const formatSats = (amount: number, withSuffix: boolean): string => {
	return (
		new Intl.NumberFormat('en-US').format(amount) +
		(withSuffix ? ' ' + (amount > 1 ? 'sats' : 'sat') : '')
	);
};

// NIP-06 base derivation path for Nostr
const NOSTR_BASE = "m/44'/1237'/0'/0";

export interface MintInfo {
	title: string;
	url: string;
	description: string;
	publishDate: Date;
	iconUrl: string | null;
	state: string;
	rating: number; // Lower is better (errors per operation)
	n_mints?: number;
	n_melts?: number;
	n_errors?: number;
}

/**
 * Derive a Nostr secret key from a BIP-39 mnemonic using path m/44'/1237'/0'/0/index
 * Returns null if inputs are invalid.
 */
export function deriveFromMnemonic(m: string, pass: string, index: number): Uint8Array | null {
	const phrase = (m || '').trim().replace(/\s+/g, ' ');
	if (!phrase) {
		return null;
	}
	if (!validateMnemonic(phrase, wordlist)) {
		return null;
	}
	if (index < 0 || !Number.isFinite(index)) {
		return null;
	}
	try {
		const seed = mnemonicToSeedSync(phrase, pass || undefined);
		const root = HDKey.fromMasterSeed(seed);
		const account = root.derive("m/44'/1237'/17375'");
		const chain = account.deriveChild(0);
		const child = chain.deriveChild(index);
		if (!child.privateKey) {
			return null;
		}
		return child.privateKey;
	} catch (e) {
		console.log('error', e);
		return null;
	}
}

/**
 * Parse a private key string (hex or nsec) into a 32-byte Uint8Array.
 * Returns null if invalid.
 */
export function parsePrivkey(input: string): Uint8Array | null {
	const s = (input || '').trim();
	if (!s) {
		return null;
	}
	try {
		if (s.toLowerCase().startsWith('nsec')) {
			const decoded = nip19.decode(s);
			if (decoded.type !== 'nsec' || typeof decoded.data !== 'string') {
				return null;
			}
			const hex = decoded.data;
			if (!/^[0-9a-f]{64}$/i.test(hex)) {
				return null;
			}
			return hexToBytes(hex);
		}
		const hex = s.replace(/^0x/i, '');
		if (!/^[0-9a-f]{64}$/i.test(hex)) {
			return null;
		}
		return hexToBytes(hex);
	} catch {
		return null;
	}
}

/**
 * Fetch available mints from the audit API and return enriched, sorted MintInfo[]
 */
export async function fetchAvailableMints(): Promise<MintInfo[]> {
	try {
		const response = await fetch('https://api.audit.8333.space/mints/');
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const jsonData = await response.json();

		const availableMints: MintInfo[] = jsonData.map((mintData: any) => {
			let description = '';
			let title = mintData.name || 'Unknown Mint';
			let iconUrl: string | null = null;

			try {
				if (mintData.info) {
					const infoObj = JSON.parse(mintData.info);
					description = infoObj.description || '';
					if (infoObj.name) {
						title = infoObj.name;
					}
					if (infoObj.icon_url) {
						iconUrl = infoObj.icon_url;
					}
				}
			} catch {
				// ignore bad info payloads
			}

			const operations = (mintData.n_mints || 0) + (mintData.n_melts || 0);
			let rating = 1; // default worst rating
			if (operations > 0) {
				rating = (mintData.n_errors || 0) / operations;
			} else if ((mintData.n_errors || 0) === 0) {
				rating = 0; // perfect if no errors and no ops
			}

			return {
				title,
				url: normalizeURL(mintData.url),
				description,
				publishDate: new Date(mintData.updated_at || 0),
				iconUrl,
				state: mintData.state || 'UNKNOWN',
				rating,
				n_mints: mintData.n_mints || 0,
				n_melts: mintData.n_melts || 0,
				n_errors: mintData.n_errors || 0
			};
		});

		// OK first, then by best rating (lowest error ratio first)
		availableMints.sort((a, b) => {
			if (a.state === 'OK' && b.state !== 'OK') return -1;
			if (a.state !== 'OK' && b.state === 'OK') return 1;
			return a.rating - b.rating;
		});

		return availableMints;
	} catch {
		return [];
	}
}

/**
 * Visual helper for mint state -> CSS color class
 */
export function getStatusColor(state: string): string {
	switch (state) {
		case 'OK':
			return 'bg-success';
		case 'ERROR':
			return 'bg-error';
		default:
			return 'bg-warning';
	}
}

/**
 * Display helper for rating as stars
 */
export function getRatingDisplay(rating: number): string {
	if (rating === 0) return '★★★★★';
	if (rating < 0.01) return '★★★★☆';
	if (rating < 0.05) return '★★★☆☆';
	if (rating < 0.1) return '★★☆☆☆';
	return '★☆☆☆☆';
}

/**
 * Build a compact stats text for a mint
 */
export function getStatsText(mint: MintInfo): string {
	const operations = (mint.n_mints || 0) + (mint.n_melts || 0);
	if (operations === 0) return 'No operations';
	return `${operations} ops, ${mint.n_errors || 0} errors`;
}

/**
 * Default preselected mints for new users.
 * Minibits and Coinos as requested.
 */
export const DEFAULT_MINTS: string[] = [
	normalizeURL('https://mint.minibits.cash/Bitcoin'),
	normalizeURL('https://mint.coinos.io')
];

export function resolveNpubNsecFromStorage(): { npub: string; nsec: string } | null {
	if (typeof localStorage === 'undefined') return null;

	const mnemonic = localStorage.getItem('wallet/mnemonic');
	if (!mnemonic) return null;

	const indexStr = localStorage.getItem('wallet/mnemonic_index') ?? '0';
	const passphrase = localStorage.getItem('wallet/mnemonic_passphrase') ?? '';

	let index = Number.parseInt(indexStr, 10);
	if (!Number.isFinite(index) || index < 0) index = 0;

	const sk = deriveFromMnemonic(mnemonic, passphrase, index);
	if (!sk) return null;

	const pubkey = getPublicKey(sk);
	return {
		npub: nip19.npubEncode(pubkey),
		nsec: nip19.nsecEncode(sk)
	};
}

export type LnurlPayMeta = {
	callback: string;
	minSendable: number; // msats
	maxSendable: number; // msats
	metadata: string; // stringified JSON
	commentAllowed?: number;
	tag: 'payRequest';
	// Optional LNURLp extras:
	payerData?: unknown;
	allowsNostr?: boolean;
	nostrPubkey?: string;
	status?: 'OK' | 'ERROR';
	reason?: string;
};

export type LnurlPayInvoiceResponse = {
	pr: string; // BOLT11
	routes?: unknown[];
	successAction?: unknown;
};

export function isLightningAddress(input: string): boolean {
	// Basic sanity check; refine as needed
	return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input);
}

export async function fetchLnurlpMeta(address: string): Promise<LnurlPayMeta> {
	const [name, domain] = address.split('@');
	if (!name || !domain) throw new Error('Invalid Lightning Address');

	// Most providers require https
	const url = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;

	const res = await fetch(url, {
		method: 'GET',
		headers: { accept: 'application/json' }
	});
	if (!res.ok) throw new Error(`LNURLp metadata fetch failed: ${res.status}`);
	const meta = (await res.json()) as LnurlPayMeta;

	if (meta.status === 'ERROR') {
		throw new Error(meta.reason || 'LNURLp error');
	}
	if (!meta.callback || meta.tag !== 'payRequest') {
		throw new Error('Invalid LNURLp response');
	}
	return meta;
}

export async function getInvoiceFromLightningAddress(
	address: string,
	sats: number,
	opts?: { comment?: string }
): Promise<{ pr: string }> {
	if (!isLightningAddress(address)) throw new Error('Not a Lightning Address');
	if (!sats || sats < 1) throw new Error('Amount must be > 0 sats');

	const meta = await fetchLnurlpMeta(address);

	const msats = BigInt(sats) * 1000n;
	const min = BigInt(meta.minSendable);
	const max = BigInt(meta.maxSendable);

	if (msats < min) throw new Error(`Amount below minSendable (${Number(min / 1000n)} sats)`);
	if (msats > max) throw new Error(`Amount above maxSendable (${Number(max / 1000n)} sats)`);

	const cb = new URL(meta.callback);
	cb.searchParams.set('amount', msats.toString());

	if (opts?.comment && meta.commentAllowed && opts.comment.length <= meta.commentAllowed) {
		cb.searchParams.set('comment', opts.comment);
	}

	const invRes = await fetch(cb.toString(), {
		method: 'GET',
		headers: { accept: 'application/json' }
	});
	if (!invRes.ok) throw new Error(`LNURLp invoice fetch failed: ${invRes.status}`);
	const payload = (await invRes.json()) as LnurlPayInvoiceResponse;

	if (!payload.pr) throw new Error("LNURLp invoice response missing 'pr'");
	return { pr: payload.pr };
}

export { hexToBytes };
