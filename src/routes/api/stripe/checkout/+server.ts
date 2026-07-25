import { error, json, type RequestHandler } from '@sveltejs/kit';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { normalizeURL } from 'nostr-tools/utils';
import WebSocket from 'ws';
import type Stripe from 'stripe';
import {
	BADGE_DEFINITION_TYPE_TOPICS,
	CATALOG_SELLABLE_TAG,
	MEMBERSHIP_BILLING,
	PRODUCT_KINDS
} from 'src/lib/catalog';
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
const VALID_MEMBERSHIP_BILLING = new Set<string>(MEMBERSHIP_BILLING);
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
	if (![30009, 31922, 31923].includes(kind) || !/^[0-9a-f]{64}$/i.test(author) || !identifier) {
		throw error(400, 'Invalid item address');
	}

	const pool = new SimplePool();
	let nostrEvent;
	let badgeDefinition;
	try {
		nostrEvent = await pool.get(
			[community],
			{ kinds: [kind], authors: [author], '#d': [identifier], limit: 1 },
			{ maxWait: 5000 }
		);
		if (nostrEvent && kind !== 30009) {
			const badgeAddress = tagValue(nostrEvent.tags, 'entrance_badge');
			const [badgeKind, badgeAuthor, ...badgeDParts] = badgeAddress.split(':');
			const badgeD = badgeDParts.join(':');
			if (badgeKind !== '30009' || !/^[0-9a-f]{64}$/i.test(badgeAuthor) || !badgeD) {
				throw error(422, 'Paid event is missing its entrance badge definition');
			}
			badgeDefinition = await pool.get(
				[community],
				{ kinds: [30009], authors: [badgeAuthor], '#d': [badgeD], limit: 1 },
				{ maxWait: 5000 }
			);
		}
	} finally {
		pool.destroy();
	}
	if (!nostrEvent) throw error(404, 'Item not found on the community relay');
	const definitionType = tagValue(nostrEvent.tags, 'type');
	const directPurchaseType =
		definitionType === 'membership' || definitionType === 'product' || definitionType === 'pass'
			? definitionType
			: undefined;
	const isDirectCatalogPurchase =
		kind === 30009 &&
		directPurchaseType !== undefined &&
		hasTagValue(nostrEvent.tags, 't', BADGE_DEFINITION_TYPE_TOPICS[directPurchaseType]) &&
		hasTagValue(nostrEvent.tags, 't', CATALOG_SELLABLE_TAG);
	if (!isDirectCatalogPurchase && kind === 30009) {
		throw error(422, 'Badge definition is not a buyable store item');
	}
	const purchaseDefinition = isDirectCatalogPurchase ? nostrEvent : badgeDefinition;
	if (!purchaseDefinition) throw error(404, 'Event entrance badge definition was not found');
	if (
		!hasTagValue(purchaseDefinition.tags, 't', CATALOG_SELLABLE_TAG) ||
		tagValue(purchaseDefinition.tags, 'availability') !== 'available'
	) {
		throw error(422, 'This badge is not currently available for purchase');
	}
	if (isDirectCatalogPurchase && directPurchaseType === 'product') {
		const productKind = tagValue(purchaseDefinition.tags, 'product_kind') || 'generic';
		const rawMaxUses = tagValue(purchaseDefinition.tags, 'max_uses');
		if (!VALID_PRODUCT_KINDS.has(productKind) || (rawMaxUses && rawMaxUses !== '1')) {
			throw error(422, 'Product definition must represent one redeemable item');
		}
	}
	if (isDirectCatalogPurchase && directPurchaseType === 'pass') {
		const rawMaxUses = tagValue(purchaseDefinition.tags, 'max_uses');
		if (
			rawMaxUses &&
			(!/^[1-9]\d*$/.test(rawMaxUses) || !Number.isSafeInteger(Number(rawMaxUses)))
		) {
			throw error(422, 'Pass definition has invalid usage limits');
		}
	}
	const expectedEventAddress = input.eventAddress;
	if (
		!isDirectCatalogPurchase &&
		(tagValue(purchaseDefinition.tags, 'type') !== 'event_access' ||
			!hasTagValue(purchaseDefinition.tags, 't', BADGE_DEFINITION_TYPE_TOPICS.event_access) ||
			tagValue(purchaseDefinition.tags, 'a') !== expectedEventAddress ||
			tagValue(purchaseDefinition.tags, 'max_uses') !== '1' ||
			purchaseDefinition.pubkey !== author)
	) {
		throw error(422, 'Event entrance badge definition is invalid');
	}
	const priceTag = purchaseDefinition.tags.find((tag) => tag[0] === 'price');
	const currency = (priceTag?.[2] || '').toLowerCase();
	if (!priceTag?.[1] || !/^[a-z]{3}$/.test(currency))
		throw error(422, 'This item has no payable price');
	if (!isDirectCatalogPurchase) {
		const expiration = Number(tagValue(purchaseDefinition.tags, 'expiration'));
		const eventPriceTag = nostrEvent.tags.find((tag) => tag[0] === 'entrance_price');
		if (!Number.isSafeInteger(expiration) || expiration <= Math.floor(Date.now() / 1000)) {
			throw error(410, 'Event entrance has expired');
		}
		if (
			eventPriceTag?.[1] !== priceTag[1] ||
			(eventPriceTag?.[2] || '').toLowerCase() !== currency
		) {
			throw error(422, 'Event entrance price does not match its badge definition');
		}
	}

	const tags = purchaseDefinition.tags;
	const connection = await getStripeConnection(community);
	if (!connection) throw error(409, 'This community has not connected Stripe');
	const taggedStripeAccountId = tagValue(tags, 'stripe_account');
	if (taggedStripeAccountId && taggedStripeAccountId !== connection.accountId) {
		throw error(422, 'This item references a different community payment account');
	}
	const stripeAccountId = connection.accountId;
	const rawBilling = tagValue(tags, 'billing') || 'one_time';
	if (
		isDirectCatalogPurchase &&
		directPurchaseType === 'membership' &&
		(!VALID_MEMBERSHIP_BILLING.has(rawBilling) ||
			Boolean(tagValue(purchaseDefinition.tags, 'max_uses')))
	) {
		throw error(422, 'Membership definition is invalid');
	}
	const billing =
		isDirectCatalogPurchase && directPurchaseType === 'membership' ? rawBilling : 'one_time';
	const title =
		tagValue(tags, 'name') ||
		tagValue(nostrEvent.tags, 'title') ||
		(isDirectCatalogPurchase ? 'Store item' : 'Event entrance');
	const badgeAddress = isDirectCatalogPurchase
		? input.eventAddress
		: tagValue(nostrEvent.tags, 'entrance_badge');
	const badgeExpiresAt = isDirectCatalogPurchase ? '' : tagValue(tags, 'expiration');
	const purchaseType = isDirectCatalogPurchase ? directPurchaseType : 'event';
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
									? 'Event entrance badge'
									: purchaseType === 'pass'
										? 'Community pass'
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
