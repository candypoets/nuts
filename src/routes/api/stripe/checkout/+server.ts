import { error, json, type RequestHandler } from '@sveltejs/kit';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import { normalizeURL } from 'nostr-tools/utils';
import WebSocket from 'ws';
import type Stripe from 'stripe';
import { requireNostrSigner } from 'src/lib/server/nostrAuth';
import { getStripeConnection, stripeClient } from 'src/lib/server/stripe';

useWebSocketImplementation(WebSocket);

const ZERO_DECIMAL_CURRENCIES = new Set([
	'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
]);

function tagValue(tags: string[][], name: string) {
	return tags.find((tag) => tag[0] === name)?.[1] || '';
}

function stripeAmount(value: string, currency: string) {
	const amount = Number(value);
	if (!Number.isFinite(amount) || amount <= 0) throw error(422, 'Event entrance price is invalid');
	return Math.round(amount * (ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100));
}

export const POST: RequestHandler = async (requestEvent) => {
	const body = await requestEvent.request.text();
	let input: { community?: string; eventAddress?: string };
	try {
		input = JSON.parse(body);
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	if (!input.community || !input.eventAddress) throw error(400, 'Community and event are required');
	const buyer = await requireNostrSigner(requestEvent, body);
	const community = normalizeURL(input.community);
	const [kindValue, author, ...identifierParts] = input.eventAddress.split(':');
	const kind = Number(kindValue);
	const identifier = identifierParts.join(':');
	if (![30009, 31922, 31923].includes(kind) || !author || !identifier) throw error(400, 'Invalid event address');

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
			if (badgeKind !== '30009' || !badgeAuthor || !badgeD) {
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
	if (!nostrEvent) throw error(404, 'Event not found on the community relay');
	const isMembership = kind === 30009 && tagValue(nostrEvent.tags, 'type') === 'membership';
	if (!isMembership && kind === 30009) throw error(422, 'Badge definition is not a membership');
	const purchaseDefinition = isMembership ? nostrEvent : badgeDefinition;
	if (!purchaseDefinition) throw error(404, 'Event entrance badge definition was not found');
	const expectedEventAddress = input.eventAddress;
	if (!isMembership && (
		tagValue(purchaseDefinition.tags, 'type') !== 'event_access' ||
		tagValue(purchaseDefinition.tags, 'a') !== expectedEventAddress ||
		purchaseDefinition.pubkey !== author
	)) throw error(422, 'Event entrance badge definition is invalid');
	const priceTag = purchaseDefinition.tags.find((tag) => tag[0] === 'price');
	const currency = (priceTag?.[2] || '').toLowerCase();
	if (!priceTag?.[1] || !/^[a-z]{3}$/.test(currency)) throw error(422, 'This event has no payable entrance');

	const tags = purchaseDefinition.tags;
	const connection = await getStripeConnection(community);
	const stripeAccountId = tagValue(tags, 'stripe_account') || connection?.accountId || '';
	if (!stripeAccountId) throw error(409, 'This community has not connected Stripe');
	const billing = tagValue(tags, 'billing');
	const title = tagValue(tags, 'name') || tagValue(nostrEvent.tags, 'title') || (isMembership ? 'Membership' : 'Event entrance');
	const badgeAddress = isMembership
		? input.eventAddress
		: tagValue(nostrEvent.tags, 'entrance_badge');
	const badgeExpiresAt = isMembership ? '' : tagValue(tags, 'expiration');
	const stripe = stripeClient();
	const completeUrl = new URL('/payment/complete', requestEvent.url.origin);
	completeUrl.searchParams.set('community', community);
	completeUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
	const cancelUrl = new URL(requestEvent.request.headers.get('referer') || '/', requestEvent.url.origin);

	const metadata = {
		community,
		event_address: input.eventAddress,
		nostr_event_id: purchaseDefinition.id,
		badge_address: badgeAddress,
		badge_expires_at: badgeExpiresAt,
		nostr_recipient: buyer.pubkey,
		purchase_type: isMembership ? 'membership' : 'event',
		billing: isMembership ? billing || 'one_time' : 'one_time',
		stripe_account: stripeAccountId
	};
	const params: Stripe.Checkout.SessionCreateParams = {
			mode: isMembership && billing !== 'one_time' ? 'subscription' : 'payment',
			line_items: [{
				quantity: 1,
				price_data: {
					currency,
					unit_amount: stripeAmount(priceTag[1], currency),
					...(isMembership && billing !== 'one_time'
						? { recurring: { interval: billing === 'yearly' ? 'year' : 'month' } }
						: {}),
					product_data: { name: title, description: isMembership ? 'Community membership' : 'Event entrance badge' }
				}
			}],
			success_url: completeUrl.toString(),
			cancel_url: cancelUrl.toString(),
			client_reference_id: buyer.pubkey,
			metadata
	};
	if (params.mode === 'subscription') params.subscription_data = { metadata };
	const session = await stripe.checkout.sessions.create(params, { stripeAccount: stripeAccountId });
	if (!session.url) throw error(502, 'Stripe did not return a checkout URL');
	return json({ url: session.url });
};
