import { env } from '$env/dynamic/private';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type Stripe from 'stripe';
import { paymentServiceAuthorization } from 'src/lib/server/paymentNip98';
import { stripeClient } from 'src/lib/server/stripe';

function redeemUrl(community: string) {
	const url = new URL(community.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'));
	url.pathname = '/redeem';
	url.search = '';
	url.hash = '';
	return url.toString();
}

async function dispatchRedemption(fetch: typeof globalThis.fetch, input: {
	stripeEvent: Stripe.Event;
	redemptionId: string;
	metadata: Stripe.Metadata;
	paidAt: number;
	badgeExpiresAt?: number;
}) {
	const { stripeEvent, redemptionId, metadata, paidAt, badgeExpiresAt } = input;
	const community = metadata.community;
	const definitionEventId = metadata.nostr_event_id;
	const badgeAddress = metadata.badge_address;
	const recipientPubkey = metadata.nostr_recipient;
	if (!community || !definitionEventId || !badgeAddress || !recipientPubkey || !stripeEvent.account) {
		throw error(422, 'Badge payment metadata is incomplete');
	}
	if (metadata.stripe_account !== stripeEvent.account) {
		throw error(422, 'Connected account does not match payment metadata');
	}
	const redemptionBody = JSON.stringify({
		type: 'payment',
		redemption_id: redemptionId,
		payment_id: stripeEvent.id,
		membership_event_id: definitionEventId,
		badge_address: badgeAddress,
		recipient_pubkey: recipientPubkey,
		paid_at: paidAt,
		badge_expires_at: badgeExpiresAt
	});
	const url = redeemUrl(community);
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: paymentServiceAuthorization(url, redemptionBody)
		},
		body: redemptionBody
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) throw error(502, result.error || 'Community rejected membership redemption');
	return result.event_id;
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const signature = request.headers.get('stripe-signature');
	if (!signature || !env.STRIPE_CONNECT_WEBHOOK_SECRET) {
		throw error(400, 'Stripe webhook is not configured');
	}
	const body = await request.text();
	let stripeEvent: Stripe.Event;
	try {
		stripeEvent = stripeClient().webhooks.constructEvent(
			body,
			signature,
			env.STRIPE_CONNECT_WEBHOOK_SECRET
		);
	} catch {
		throw error(400, 'Invalid Stripe webhook signature');
	}

	if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(stripeEvent.type)) {
		const session = stripeEvent.data.object as Stripe.Checkout.Session;
		const metadata = session.metadata;
		if (session.mode === 'subscription' || session.payment_status !== 'paid' || !metadata || !['membership', 'event'].includes(metadata.purchase_type || '')) {
			return json({ received: true });
		}
		const badgeEventId = await dispatchRedemption(fetch, {
			stripeEvent,
			redemptionId: session.id,
			metadata,
			paidAt: stripeEvent.created,
			badgeExpiresAt: metadata.badge_expires_at
				? Number(metadata.badge_expires_at)
				: undefined
		});
		return json({ received: true, badgeEventId });
	}

	if (stripeEvent.type === 'invoice.paid') {
		const invoice = stripeEvent.data.object as Stripe.Invoice;
		const subscriptionDetails = invoice.parent?.type === 'subscription_details'
			? invoice.parent.subscription_details
			: null;
		const metadata = subscriptionDetails?.metadata;
		if (metadata?.purchase_type !== 'membership') return json({ received: true });
		const badgeExpiresAt = Math.max(...invoice.lines.data.map((line) => line.period.end));
		const badgeEventId = await dispatchRedemption(fetch, {
			stripeEvent,
			redemptionId: invoice.id,
			metadata,
			paidAt: invoice.status_transitions.paid_at || stripeEvent.created,
			badgeExpiresAt
		});
		return json({ received: true, badgeEventId });
	}

	return json({ received: true });
};
