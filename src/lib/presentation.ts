import { verifyEvent, type EventTemplate, type NostrEvent } from 'nostr-tools';
import { DEFINITION_KINDS } from 'src/lib/nip97';

export const PRESENTATION_KIND = 27236;
export const PRESENTATION_PREFIX = 'nuts:present:';
export const PRESENTATION_LIFETIME_SECONDS = 90;
export const IDENTITY_PRESENTATION_TYPE = 'nuts_identity_presentation';
export const ENTITLEMENT_PRESENTATION_TYPE = 'nuts_entitlement_presentation';

export type CheckInContext = {
	type: 'event_checkin';
	community: string;
	eventAddress: string;
	eventTitle: string;
	badgeAddresses: string[];
};

export type EntitlementPresentationInput = {
	awardId: string;
	badgeAddress: string;
	community: string;
	orderId?: string;
	eventAddress?: string;
};

export type EntitlementPresentation = EntitlementPresentationInput & {
	event: NostrEvent;
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

function presentationTags(type: string, createdAt: number) {
	return [
		['type', type],
		['expiration', String(createdAt + PRESENTATION_LIFETIME_SECONDS)],
		['nonce', crypto.randomUUID()]
	];
}

function tagValue(event: NostrEvent, name: string) {
	return event.tags.find((tag) => tag[0] === name)?.[1] || '';
}

function isHexEventId(value: string) {
	return /^[0-9a-f]{64}$/i.test(value);
}

function isBadgeAddress(value: string) {
	const [kind, author, ...identifierParts] = value.split(':');
	return (
		(DEFINITION_KINDS as readonly number[]).includes(Number(kind)) &&
		isHexEventId(author) &&
		Boolean(identifierParts.join(':'))
	);
}

function isEventAddress(value: string) {
	const [kind, author, ...identifierParts] = value.split(':');
	return (
		(kind === '31922' || kind === '31923') &&
		isHexEventId(author) &&
		Boolean(identifierParts.join(':'))
	);
}

function isCommunityRelay(value: string) {
	try {
		const url = new URL(value);
		return (url.protocol === 'wss:' || url.protocol === 'ws:') && Boolean(url.host);
	} catch {
		return false;
	}
}

function validPresentationWindow(event: NostrEvent, at: number) {
	const expiration = Number(tagValue(event, 'expiration'));
	return Boolean(
		event.kind === PRESENTATION_KIND &&
		event.tags.some((tag) => tag[0] === 'nonce' && Boolean(tag[1])) &&
		verifyEvent(event) &&
		Number.isSafeInteger(expiration) &&
		expiration >= at &&
		event.created_at <= at + 30 &&
		event.created_at >= at - PRESENTATION_LIFETIME_SECONDS
	);
}

export function presentationTemplate(createdAt = Math.floor(Date.now() / 1000)): EventTemplate {
	return {
		kind: PRESENTATION_KIND,
		created_at: createdAt,
		content: '',
		tags: presentationTags(IDENTITY_PRESENTATION_TYPE, createdAt)
	};
}

export function entitlementPresentationTemplate(
	input: EntitlementPresentationInput,
	createdAt = Math.floor(Date.now() / 1000)
): EventTemplate {
	if (!isHexEventId(input.awardId)) throw new Error('Award event ID is invalid');
	if (!isBadgeAddress(input.badgeAddress)) throw new Error('Badge address is invalid');
	if (!isCommunityRelay(input.community)) throw new Error('Community relay is invalid');
	if (Boolean(input.orderId) === Boolean(input.eventAddress)) {
		throw new Error('Exactly one fulfillment context is required');
	}
	if (input.eventAddress && !isEventAddress(input.eventAddress)) {
		throw new Error('Event address is invalid');
	}
	if (input.orderId !== undefined && !input.orderId.trim()) {
		throw new Error('Order ID is invalid');
	}
	return {
		kind: PRESENTATION_KIND,
		created_at: createdAt,
		content: '',
		tags: [
			...presentationTags(ENTITLEMENT_PRESENTATION_TYPE, createdAt),
			['e', input.awardId],
			['a', input.badgeAddress],
			['r', input.community],
			...(input.orderId ? [['order', input.orderId]] : [['event', input.eventAddress || '']])
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
	return Boolean(
		event.tags.some((tag) => tag[0] === 'type' && tag[1] === IDENTITY_PRESENTATION_TYPE) &&
		validPresentationWindow(event, at)
	);
}

export function decodeEntitlementPresentation(value: string): EntitlementPresentation | undefined {
	const event = decodePresentation(value);
	if (!event) return undefined;
	const awardId = tagValue(event, 'e');
	const badgeAddress = tagValue(event, 'a');
	const community = tagValue(event, 'r');
	const orderId = tagValue(event, 'order') || undefined;
	const eventAddress = tagValue(event, 'event') || undefined;
	if (
		!isHexEventId(awardId) ||
		!isBadgeAddress(badgeAddress) ||
		!isCommunityRelay(community) ||
		Boolean(orderId) === Boolean(eventAddress) ||
		(eventAddress && !isEventAddress(eventAddress))
	) {
		return undefined;
	}
	return { event, awardId, badgeAddress, community, orderId, eventAddress };
}

export function verifyEntitlementPresentation(
	presentation: EntitlementPresentation,
	at = Math.floor(Date.now() / 1000)
) {
	return Boolean(
		presentation.event.tags.some(
			(tag) => tag[0] === 'type' && tag[1] === ENTITLEMENT_PRESENTATION_TYPE
		) && validPresentationWindow(presentation.event, at)
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
		)
			return undefined;
		return {
			...parsed,
			badgeAddresses: Array.from(new Set(parsed.badgeAddresses.filter(Boolean)))
		};
	} catch {
		return undefined;
	}
}
