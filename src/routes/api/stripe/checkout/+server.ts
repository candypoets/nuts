import { error, json, type RequestHandler } from '@sveltejs/kit';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { normalizeURL } from 'nostr-tools/utils';
import WebSocket from 'ws';
import type Stripe from 'stripe';
import { PRODUCT_KINDS } from 'src/lib/catalog';
import { requireNostrSigner } from 'src/lib/server/nostrAuth';
import { getStripeConnection, stripeClient } from 'src/lib/server/stripe';

useWebSocketImplementation(WebSocket);

const ZERO_DECIMAL_CURRENCIES = new Set([
	'bif',
	'clp',
	'djf',
	'gnf',
	'jpy',
	'kmf',
	'krw',
	'mga',
	'pyg',
	'rwf',
	'ugx',
	'vnd',
	'vuv',
	'xaf',
	'xof',
	'xpf'
]);
const VALID_PRODUCT_KINDS = new Set<string>(PRODUCT_KINDS);

function tagValue(tags: string[][], name: string) {
	return tags.find((tag) => tag[0] === name)?.[1] || '';
}

function hasTagValue(tags: string[][], name: string, value: string) {
	return tags.some((tag) => tag[0] === name && tag[1] === value);
}

function stripeAmount(value: string, currency: string) {
	if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
		throw error(422, 'Catalog price is invalid');
	}
	const amount = Number(value);
	if (!Number.isFinite(amount) || amount <= 0) throw error(422, 'Catalog price is invalid');
	const minorUnits = Math.round(amount * (ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100));
	if (minorUnits <= 0) throw error(422, 'Catalog price is too small for this currency');
	return minorUnits;
}

export const POST: RequestHandler = async (requestEvent) => {
	const body = await requestEvent.request.text();
	let input: { community?: string; eventAddress?: string; returnTo?: string };
	try {
		input = JSON.parse(body);
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	if (!input.community || !input.eventAddress) throw error(400, 'Community and item are required');
	const buyer = await requireNostrSigner(requestEvent, body);
	const community = normalizeURL(input.community);
	const [kindValue, author, ...identifierParts] = input.eventAddress.split(':');
	const kind = Number(kindValue);
	const identifier = identifierParts.join(':');
	if (
		![30009, 30402, 31922, 31923].includes(kind) ||
		!/^[0-9a-f]{64}$/i.test(author) ||
		!identifier
	) {
		throw error(400, 'Invalid item address');
	}

	const pool = new SimplePool();
	let nostrEvent;
	let ticketDefinition;
	const isCalendarEventPurchase = kind === 31922 || kind === 31923;
	try {
		nostrEvent = await pool.get(
			[community],
			{ kinds: [kind], authors: [author], '#d': [identifier], limit: 1 },
			{ maxWait: 5000 }
		);
		if (nostrEvent && isCalendarEventPurchase) {
			const badgeAddress = tagValue(nostrEvent.tags, 'entrance_badge');
			const [badgeKind, badgeAuthor, ...badgeDParts] = badgeAddress.split(':');
			const badgeD = badgeDParts.join(':');
			if (badgeKind !== '30402' || !/^[0-9a-f]{64}$/i.test(badgeAuthor) || !badgeD) {
				throw error(422, 'Paid event is missing its entrance ticket listing');
			}
			ticketDefinition = await pool.get(
				[community],
				{ kinds: [30402], authors: [badgeAuthor], '#d': [badgeD], limit: 1 },
				{ maxWait: 5000 }
			);
		}
	} finally {
		pool.destroy();
	}
	if (!nostrEvent) throw error(404, 'Item not found on the community relay');
	if (isCalendarEventPurchase && !ticketDefinition) {
		throw error(404, 'Event entrance ticket listing was not found');
	}
	if (kind === 30009 && !hasTagValue(nostrEvent.tags, 't', 'membership')) {
		throw error(422, 'Badge definition is not a buyable membership');
	}
	const purchaseDefinition = isCalendarEventPurchase ? ticketDefinition : nostrEvent;
	if (!purchaseDefinition) throw error(404, 'Event entrance ticket listing was not found');
	// purchase_type: 30009 -> membership, 30402 with an event link -> event, else product.
	const purchaseType = isCalendarEventPurchase
		? 'event'
		: kind === 30009
			? 'membership'
			: tagValue(nostrEvent.tags, 'a')
				? 'event'
				: 'product';
	const definitionTags = purchaseDefinition.tags;
	const availability = tagValue(definitionTags, 'availability');
	if (availability && availability !== 'available') {
		throw error(422, 'This item is not currently available for purchase');
	}
	const priceTag = definitionTags.find((tag) => tag[0] === 'price');
	const currency = (priceTag?.[2] || '').toLowerCase();
	if (
		!priceTag?.[1] ||
		!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(priceTag[1]) ||
		Number(priceTag[1]) <= 0 ||
		!/^[a-z]{3}$/.test(currency)
	) {
		throw error(422, 'This item has no payable price');
	}
	// NIP-99 recurrence on the price tag drives membership billing.
	const recurrence = priceTag[3];
	if (purchaseType === 'membership') {
		if (recurrence && recurrence !== 'month' && recurrence !== 'year') {
			throw error(422, 'Membership definition has an invalid billing recurrence');
		}
		if (tagValue(definitionTags, 'max_uses')) {
			throw error(422, 'Membership definition is invalid');
		}
	}
	const billing =
		purchaseType === 'membership'
			? recurrence === 'month'
				? 'monthly'
				: recurrence === 'year'
					? 'yearly'
					: 'one_time'
			: 'one_time';
	if (purchaseDefinition.kind === 30402) {
		const productKind = tagValue(definitionTags, 'product_kind') || 'generic';
		const rawMaxUses = tagValue(definitionTags, 'max_uses');
		if (!VALID_PRODUCT_KINDS.has(productKind)) {
			throw error(422, 'Product definition is invalid');
		}
		if (
			rawMaxUses &&
			(!/^[1-9]\d*$/.test(rawMaxUses) || !Number.isSafeInteger(Number(rawMaxUses)))
		) {
			throw error(422, 'Usage limit is invalid');
		}
	}
	if (isCalendarEventPurchase) {
		if (
			tagValue(definitionTags, 'a') !== input.eventAddress ||
			(tagValue(definitionTags, 'max_uses') || '1') !== '1' ||
			purchaseDefinition.pubkey !== author
		) {
			throw error(422, 'Event entrance ticket definition is invalid');
		}
		const expiration = Number(tagValue(definitionTags, 'expiration'));
		const eventPriceTag = nostrEvent.tags.find((tag) => tag[0] === 'entrance_price');
		if (!Number.isSafeInteger(expiration) || expiration <= Math.floor(Date.now() / 1000)) {
			throw error(410, 'Event entrance has expired');
		}
		if (
			eventPriceTag?.[1] !== priceTag[1] ||
			(eventPriceTag?.[2] || '').toLowerCase() !== currency
		) {
			throw error(422, 'Event entrance price does not match its ticket listing');
		}
	}

	const tags = definitionTags;
	const connection = await getStripeConnection(community);
	if (!connection) throw error(409, 'This community has not connected Stripe');
	const taggedStripeAccountId = tagValue(tags, 'stripe_account');
	if (taggedStripeAccountId && taggedStripeAccountId !== connection.accountId) {
		throw error(422, 'This item references a different community payment account');
	}
	const stripeAccountId = connection.accountId;
	const title =
		tagValue(tags, 'title') ||
		tagValue(tags, 'name') ||
		tagValue(nostrEvent.tags, 'title') ||
		(purchaseType === 'membership'
			? 'Community membership'
			: purchaseType === 'event'
				? 'Event entrance'
				: 'Store item');
	const badgeAddress = isCalendarEventPurchase
		? tagValue(nostrEvent.tags, 'entrance_badge')
		: input.eventAddress;
	const badgeExpiresAt = purchaseType === 'event' ? tagValue(tags, 'expiration') : '';
	const stripe = stripeClient();
	const requestedReturnUrl = new URL(input.returnTo || '/explore', requestEvent.url.origin);
	const returnTo =
		requestedReturnUrl.origin === requestEvent.url.origin &&
		!requestedReturnUrl.pathname.startsWith('/payment/complete')
			? `${requestedReturnUrl.pathname}${requestedReturnUrl.search}${requestedReturnUrl.hash}`
			: '/explore';
	const completeUrl = new URL('/payment/complete', requestEvent.url.origin);
	completeUrl.searchParams.set('community', community);
	completeUrl.searchParams.set('return_to', returnTo);
	const successUrl = `${completeUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`;
	const cancelUrl = new URL(returnTo, requestEvent.url.origin);

	const metadata = {
		community,
		event_address: input.eventAddress,
		nostr_event_id: purchaseDefinition.id,
		badge_address: badgeAddress,
		badge_expires_at: badgeExpiresAt,
		nostr_recipient: buyer.pubkey,
		purchase_type: purchaseType,
		billing,
		stripe_account: stripeAccountId
	};
	const params: Stripe.Checkout.SessionCreateParams = {
		mode: purchaseType === 'membership' && billing !== 'one_time' ? 'subscription' : 'payment',
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency,
					unit_amount: stripeAmount(priceTag[1], currency),
					...(purchaseType === 'membership' && billing !== 'one_time'
						? { recurring: { interval: billing === 'yearly' ? 'year' : 'month' } }
						: {}),
					product_data: {
						name: title,
						description:
							purchaseType === 'membership'
								? 'Community membership'
								: purchaseType === 'event'
									? 'Event entrance ticket'
									: 'Community product'
					}
				}
			}
		],
		success_url: successUrl,
		cancel_url: cancelUrl.toString(),
		client_reference_id: buyer.pubkey,
		metadata
	};
	if (params.mode === 'subscription') params.subscription_data = { metadata };
	const session = await stripe.checkout.sessions.create(params, { stripeAccount: stripeAccountId });
	if (!session.url) throw error(502, 'Stripe did not return a checkout URL');
	return json({ url: session.url });
};
