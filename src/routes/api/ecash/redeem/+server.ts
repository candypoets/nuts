import { error, json, type RequestHandler } from '@sveltejs/kit';
import { hasValidDleq, Mint, type MintKeys, type Proof } from '@cashu/cashu-ts';
import { verifyEvent, type VerifiedEvent } from 'nostr-tools';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { normalizeURL } from 'nostr-tools/utils';
import WebSocket from 'ws';
import { BADGE_DEFINITION_TYPE_TOPICS, CATALOG_SELLABLE_TAG } from 'src/lib/catalog';
import { DEFAULT_RELAYS } from 'src/lib/env';
import { paymentServiceAuthorization } from 'src/lib/server/paymentNip98';
import { requireNostrSigner } from 'src/lib/server/nostrAuth';

useWebSocketImplementation(WebSocket);

function tagValue(tags: string[][], name: string) {
	return tags.find((tag) => tag[0] === name)?.[1] || '';
}

function hasTagValue(tags: string[][], name: string, value: string) {
	return tags.some((tag) => tag[0] === name && tag[1] === value);
}

function redeemUrl(community: string) {
	const url = new URL(community.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'));
	url.pathname = '/redeem';
	url.search = '';
	url.hash = '';
	return url.toString();
}

function p2pkRecipient(proof: Proof) {
	try {
		const secret = JSON.parse(proof.secret);
		return Array.isArray(secret) && secret[0] === 'P2PK' && typeof secret[1]?.data === 'string'
			? secret[1].data
			: '';
	} catch {
		return '';
	}
}

export const POST: RequestHandler = async (requestEvent) => {
	const body = await requestEvent.request.text();
	let input: {
		community?: string;
		eventAddress?: string;
		badgeAddress?: string;
		amount?: number;
		nutzap?: VerifiedEvent;
	};
	try {
		input = JSON.parse(body);
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	const buyer = await requireNostrSigner(requestEvent, body);
	if (!input.community || !input.eventAddress || !input.badgeAddress || !input.nutzap) {
		throw error(400, 'Ecash checkout context is incomplete');
	}
	const community = normalizeURL(input.community);
	const nutzap = input.nutzap;
	if (nutzap.kind !== 9321 || nutzap.pubkey !== buyer.pubkey || !verifyEvent(nutzap)) {
		throw error(401, 'Invalid nutzap signature');
	}

	const [eventKindValue, eventAuthor, ...eventDParts] = input.eventAddress.split(':');
	const eventKind = Number(eventKindValue);
	const eventD = eventDParts.join(':');
	const [badgeKindValue, badgeAuthor, ...badgeDParts] = input.badgeAddress.split(':');
	const badgeD = badgeDParts.join(':');
	if (![31922, 31923].includes(eventKind) || !eventAuthor || !eventD)
		throw error(400, 'Invalid calendar event address');
	if (badgeKindValue !== '30009' || badgeAuthor !== eventAuthor || !badgeD)
		throw error(400, 'Invalid entrance badge address');

	const pool = new SimplePool();
	let calendarEvent;
	let badgeDefinition;
	let recipientInfo;
	try {
		calendarEvent = await pool.get(
			[community],
			{
				kinds: [eventKind],
				authors: [eventAuthor],
				'#d': [eventD],
				limit: 1
			},
			{ maxWait: 5000 }
		);
		badgeDefinition = await pool.get(
			[community],
			{
				kinds: [30009],
				authors: [badgeAuthor],
				'#d': [badgeD],
				limit: 1
			},
			{ maxWait: 5000 }
		);
		recipientInfo = await pool.get(
			Array.from(new Set([community, ...DEFAULT_RELAYS])),
			{
				kinds: [10019],
				authors: [eventAuthor],
				limit: 1
			},
			{ maxWait: 5000 }
		);
	} finally {
		pool.destroy();
	}
	if (!calendarEvent || !badgeDefinition)
		throw error(404, 'Event entrance definition was not found');
	if (!recipientInfo) throw error(409, 'Organizer has not configured nutzaps');
	if (
		tagValue(calendarEvent.tags, 'entrance_badge') !== input.badgeAddress ||
		tagValue(badgeDefinition.tags, 'type') !== 'event_access' ||
		!hasTagValue(badgeDefinition.tags, 't', BADGE_DEFINITION_TYPE_TOPICS.event_access) ||
		!hasTagValue(badgeDefinition.tags, 't', CATALOG_SELLABLE_TAG) ||
		tagValue(badgeDefinition.tags, 'availability') !== 'available' ||
		tagValue(badgeDefinition.tags, 'max_uses') !== '1' ||
		tagValue(badgeDefinition.tags, 'a') !== input.eventAddress
	)
		throw error(422, 'Entrance badge does not belong to this event');

	const expectedAmount = Number(tagValue(badgeDefinition.tags, 'price_sats'));
	const eventAmount = Number(tagValue(calendarEvent.tags, 'entrance_sats'));
	if (
		!Number.isSafeInteger(expectedAmount) ||
		expectedAmount <= 0 ||
		eventAmount !== expectedAmount ||
		Number(input.amount) !== expectedAmount
	) {
		throw error(422, 'Event ecash price is invalid');
	}
	const expiration = Number(tagValue(badgeDefinition.tags, 'expiration'));
	if (!Number.isSafeInteger(expiration) || expiration <= Math.floor(Date.now() / 1000))
		throw error(410, 'Event entrance has expired');

	const mintUrl = tagValue(nutzap.tags, 'u');
	const unit = tagValue(nutzap.tags, 'unit') || 'sat';
	const recipientP2pk = tagValue(recipientInfo.tags, 'pubkey');
	const trustedMints = recipientInfo.tags.filter((tag) => tag[0] === 'mint').map((tag) => tag[1]);
	if (!mintUrl || unit !== 'sat' || !trustedMints.includes(mintUrl) || !recipientP2pk)
		throw error(422, 'Nutzap mint or recipient is invalid');
	if (
		tagValue(nutzap.tags, 'p') !== eventAuthor ||
		tagValue(nutzap.tags, 'e') !== calendarEvent.id ||
		tagValue(nutzap.tags, 'a') !== input.badgeAddress
	)
		throw error(422, 'Nutzap is addressed incorrectly');

	let proofs: Proof[];
	try {
		proofs = nutzap.tags.filter((tag) => tag[0] === 'proof').map((tag) => JSON.parse(tag[1]));
	} catch {
		throw error(422, 'Nutzap contains invalid proofs');
	}
	if (
		!proofs.length ||
		proofs.reduce((total, proof) => total + Number(proof.amount || 0), 0) !== expectedAmount
	) {
		throw error(422, 'Nutzap amount does not match the entrance price');
	}
	if (proofs.some((proof) => p2pkRecipient(proof) !== recipientP2pk || !proof.dleq)) {
		throw error(422, 'Nutzap proofs are not locked to the organizer');
	}

	const mint = new Mint(mintUrl);
	const keysById = new Map<string, MintKeys>();
	for (const keysetId of new Set(proofs.map((proof) => proof.id))) {
		const response = await mint.getKeys(keysetId);
		const keys = response.keysets.find((keyset) => keyset.id === keysetId && keyset.unit === 'sat');
		if (!keys) throw error(422, 'Nutzap uses an unknown mint keyset');
		keysById.set(keysetId, keys);
	}
	try {
		if (proofs.some((proof) => !hasValidDleq(proof, keysById.get(proof.id)!))) {
			throw error(422, 'Nutzap proof verification failed');
		}
	} catch {
		throw error(422, 'Nutzap proof verification failed');
	}

	const redemptionBody = JSON.stringify({
		type: 'payment',
		redemption_id: nutzap.id,
		payment_id: nutzap.id,
		membership_event_id: badgeDefinition.id,
		badge_address: input.badgeAddress,
		recipient_pubkey: buyer.pubkey,
		paid_at: nutzap.created_at,
		badge_expires_at: expiration
	});
	const url = redeemUrl(community);
	const response = await requestEvent.fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: paymentServiceAuthorization(url, redemptionBody)
		},
		body: redemptionBody
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) throw error(502, result.error || 'Community rejected ecash redemption');
	return json({ received: true, badgeEventId: result.event_id });
};
