import { env } from '$env/dynamic/private';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import type Stripe from 'stripe';
import { communityPaymentRedemptionUrl } from 'src/lib/server/communityPayments';
import { paymentServiceAuthorization } from 'src/lib/server/paymentNip98';
import { stripeClient } from 'src/lib/server/stripe';
import {
	cancelUnfulfillableSubscription,
	invoiceSubscriptionId,
	PermanentRedemptionError,
	permanentRedemptionError,
	refundUnfulfillablePayment,
	resolveCheckoutPaymentIntentId,
	resolveInvoicePaymentIntentId
} from 'src/lib/server/stripeFulfillment';

async function dispatchRedemption(
	fetch: typeof globalThis.fetch,
	input: {
		stripeEvent: Stripe.Event;
		redemptionId: string;
		metadata: Stripe.Metadata;
		paidAt: number;
		badgeExpiresAt?: number;
	}
) {
	const { stripeEvent, redemptionId, metadata, paidAt, badgeExpiresAt } = input;
	const community = metadata.community;
	const definitionEventId = metadata.nostr_event_id;
	const badgeAddress = metadata.badge_address;
	const recipientPubkey = metadata.nostr_recipient;
	const purchaseType = metadata.purchase_type;
	if (
		!community ||
		!definitionEventId ||
		!badgeAddress ||
		!recipientPubkey ||
		!purchaseType ||
		!stripeEvent.account
	) {
		throw error(422, 'Badge payment metadata is incomplete');
	}
	if (metadata.stripe_account !== stripeEvent.account) {
		throw error(422, 'Connected account does not match payment metadata');
	}
	const redemptionBody = JSON.stringify({
		type: 'payment',
		redemption_id: redemptionId,
		payment_id: stripeEvent.id,
		order_id: redemptionId,
		definition_event_id: definitionEventId,
		membership_event_id: definitionEventId,
		badge_address: badgeAddress,
		recipient_pubkey: recipientPubkey,
		purchase_type: purchaseType,
		quantity: 1,
		paid_at: paidAt,
		badge_expires_at: badgeExpiresAt
	});
	const url = communityPaymentRedemptionUrl(community);
	console.info('[stripe:webhook] dispatching badge redemption', {
		stripeEventId: stripeEvent.id,
		redemptionId,
		purchaseType,
		definitionEventId,
		badgeAddress,
		recipientPubkey
	});
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: paymentServiceAuthorization(url, redemptionBody)
		},
		body: redemptionBody
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) {
		console.error('[stripe:webhook] community rejected badge redemption', {
			stripeEventId: stripeEvent.id,
			redemptionId,
			status: response.status,
			error: typeof result.error === 'string' ? result.error : undefined
		});
		const permanentFailure = permanentRedemptionError(response.status, result);
		if (permanentFailure) throw permanentFailure;
		throw error(502, result.error || 'Community rejected badge redemption');
	}
	const awardEventId = typeof result.event_id === 'string' ? result.event_id : '';
	if (!/^[0-9a-f]{64}$/i.test(awardEventId)) {
		console.error('[stripe:webhook] community returned no valid badge event id', {
			stripeEventId: stripeEvent.id,
			redemptionId
		});
		throw error(502, 'Community did not confirm the badge award');
	}
	console.info('[stripe:webhook] badge awarded', {
		stripeEventId: stripeEvent.id,
		redemptionId,
		awardEventId,
		recipientPubkey
	});
	return awardEventId;
}

async function refundCheckoutPayment(
	stripeEvent: Stripe.Event,
	session: Stripe.Checkout.Session,
	failure: PermanentRedemptionError
) {
	if (!stripeEvent.account) throw error(502, 'Connected account is missing from Stripe event');
	const stripe = stripeClient();
	const paymentIntentId = await resolveCheckoutPaymentIntentId(
		stripe,
		session,
		stripeEvent.account
	);
	if (!paymentIntentId) throw error(502, 'Stripe Checkout payment could not be identified');
	const refund = await refundUnfulfillablePayment(stripe, {
		paymentIntentId,
		redemptionId: session.id,
		serviceError: failure.message,
		stripeAccount: stripeEvent.account,
		stripeEventId: stripeEvent.id
	});
	if (refund.status === 'failed' || refund.status === 'canceled') {
		throw error(502, 'Stripe did not accept the refund');
	}
	console.warn('[stripe:webhook] unfulfillable checkout payment refunded', {
		stripeEventId: stripeEvent.id,
		redemptionId: session.id,
		refundId: refund.id,
		refundStatus: refund.status,
		communityError: failure.message
	});
	return refund;
}

async function refundInvoicePayment(
	stripeEvent: Stripe.Event,
	invoice: Stripe.Invoice,
	failure: PermanentRedemptionError
) {
	if (!stripeEvent.account) throw error(502, 'Connected account is missing from Stripe event');
	const stripe = stripeClient();
	const paymentIntentId = await resolveInvoicePaymentIntentId(stripe, invoice, stripeEvent.account);
	if (!paymentIntentId) throw error(502, 'Stripe invoice payment could not be identified');
	const subscriptionId = invoiceSubscriptionId(invoice);
	if (subscriptionId) {
		await cancelUnfulfillableSubscription(stripe, {
			redemptionId: invoice.id,
			stripeAccount: stripeEvent.account,
			subscriptionId
		});
	}
	const refund = await refundUnfulfillablePayment(stripe, {
		paymentIntentId,
		redemptionId: invoice.id,
		serviceError: failure.message,
		stripeAccount: stripeEvent.account,
		stripeEventId: stripeEvent.id
	});
	if (refund.status === 'failed' || refund.status === 'canceled') {
		throw error(502, 'Stripe did not accept the refund');
	}
	console.warn('[stripe:webhook] unfulfillable invoice payment refunded', {
		stripeEventId: stripeEvent.id,
		redemptionId: invoice.id,
		refundId: refund.id,
		refundStatus: refund.status,
		subscriptionId,
		communityError: failure.message
	});
	return refund;
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
	console.info('[stripe:webhook] received', {
		stripeEventId: stripeEvent.id,
		type: stripeEvent.type,
		livemode: stripeEvent.livemode,
		account: stripeEvent.account
	});

	if (
		['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
			stripeEvent.type
		)
	) {
		const session = stripeEvent.data.object as Stripe.Checkout.Session;
		const metadata = session.metadata;
		if (
			session.mode === 'subscription' ||
			session.payment_status !== 'paid' ||
			!metadata ||
			!['membership', 'event', 'product', 'pass'].includes(metadata.purchase_type || '')
		) {
			console.info('[stripe:webhook] checkout session ignored', {
				stripeEventId: stripeEvent.id,
				sessionId: session.id,
				mode: session.mode,
				paymentStatus: session.payment_status,
				purchaseType: metadata?.purchase_type
			});
			return json({ received: true });
		}
		try {
			const badgeEventId = await dispatchRedemption(fetch, {
				stripeEvent,
				redemptionId: session.id,
				metadata,
				paidAt: stripeEvent.created,
				badgeExpiresAt: metadata.badge_expires_at ? Number(metadata.badge_expires_at) : undefined
			});
			return json({ received: true, badgeEventId });
		} catch (cause) {
			if (!(cause instanceof PermanentRedemptionError)) throw cause;
			const refund = await refundCheckoutPayment(stripeEvent, session, cause);
			return json({ received: true, refunded: true, refundId: refund.id });
		}
	}

	if (stripeEvent.type === 'invoice.paid') {
		const invoice = stripeEvent.data.object as Stripe.Invoice;
		const subscriptionDetails =
			invoice.parent?.type === 'subscription_details' ? invoice.parent.subscription_details : null;
		const metadata = subscriptionDetails?.metadata;
		if (metadata?.purchase_type !== 'membership') {
			console.info('[stripe:webhook] invoice ignored', {
				stripeEventId: stripeEvent.id,
				invoiceId: invoice.id,
				purchaseType: metadata?.purchase_type
			});
			return json({ received: true });
		}
		const badgeExpiresAt = Math.max(...invoice.lines.data.map((line) => line.period.end));
		try {
			const badgeEventId = await dispatchRedemption(fetch, {
				stripeEvent,
				redemptionId: invoice.id,
				metadata,
				paidAt: invoice.status_transitions.paid_at || stripeEvent.created,
				badgeExpiresAt
			});
			return json({ received: true, badgeEventId });
		} catch (cause) {
			if (!(cause instanceof PermanentRedemptionError)) throw cause;
			const refund = await refundInvoicePayment(stripeEvent, invoice, cause);
			return json({ received: true, refunded: true, refundId: refund.id });
		}
	}

	console.info('[stripe:webhook] event type ignored', {
		stripeEventId: stripeEvent.id,
		type: stripeEvent.type
	});
	return json({ received: true });
};
