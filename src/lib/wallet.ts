import type { Kind0Parsed, ParsedEvent } from '@candypoets/nipworker';
import { asKind0 } from '@candypoets/nipworker/utils';
import { hexToBytes } from '@noble/hashes/utils';
import { bech32 } from 'bech32';
import { nip19, type NostrEvent } from 'nostr-tools';

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
	amount: number,
	event: NostrEvent
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

export { hexToBytes };
