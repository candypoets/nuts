import { verifyEvent, type EventTemplate, type NostrEvent } from 'nostr-tools';

export const PRESENTATION_KIND = 27236;
export const PRESENTATION_PREFIX = 'nuts:present:';
export const PRESENTATION_LIFETIME_SECONDS = 90;

export type CheckInContext = {
	type: 'event_checkin';
	community: string;
	eventAddress: string;
	eventTitle: string;
	badgeAddresses: string[];
};

function base64UrlEncode(value: string) {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
	const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
	const binary = atob(padded);
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

export function presentationTemplate(createdAt = Math.floor(Date.now() / 1000)): EventTemplate {
	return {
		kind: PRESENTATION_KIND,
		created_at: createdAt,
		content: '',
		tags: [
			['type', 'nuts_identity_presentation'],
			['expiration', String(createdAt + PRESENTATION_LIFETIME_SECONDS)],
			['nonce', crypto.randomUUID()]
		]
	};
}

export function encodePresentation(event: NostrEvent) {
	return PRESENTATION_PREFIX + base64UrlEncode(JSON.stringify(event));
}

export function decodePresentation(value: string): NostrEvent | undefined {
	if (!value.startsWith(PRESENTATION_PREFIX)) return undefined;
	try {
		return JSON.parse(base64UrlDecode(value.slice(PRESENTATION_PREFIX.length))) as NostrEvent;
	} catch {
		return undefined;
	}
}

export function verifyPresentation(event: NostrEvent, at = Math.floor(Date.now() / 1000)) {
	const expiration = Number(event.tags.find((tag) => tag[0] === 'expiration')?.[1]);
	return Boolean(
		event.kind === PRESENTATION_KIND &&
			event.tags.some((tag) => tag[0] === 'type' && tag[1] === 'nuts_identity_presentation') &&
			event.tags.some((tag) => tag[0] === 'nonce' && Boolean(tag[1])) &&
			verifyEvent(event) &&
			Number.isSafeInteger(expiration) &&
			expiration >= at &&
			event.created_at <= at + 30 &&
			event.created_at >= at - PRESENTATION_LIFETIME_SECONDS
	);
}

export function encodeCheckInContext(context: CheckInContext) {
	return encodeURIComponent(JSON.stringify(context));
}

export function decodeCheckInContext(value: string): CheckInContext | undefined {
	if (!value) return undefined;
	try {
		const parsed = JSON.parse(decodeURIComponent(value)) as CheckInContext;
		if (
			parsed.type !== 'event_checkin' ||
			!parsed.community ||
			!parsed.eventAddress ||
			!parsed.eventTitle ||
			!Array.isArray(parsed.badgeAddresses)
		) return undefined;
		return { ...parsed, badgeAddresses: Array.from(new Set(parsed.badgeAddresses.filter(Boolean))) };
	} catch {
		return undefined;
	}
}
