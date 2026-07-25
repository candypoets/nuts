import type Stripe from 'stripe';

export const PAYMENT_NOT_FULFILLABLE_CODE = 'payment_not_fulfillable';

export type RedemptionFailureBody = {
	code?: unknown;
	error?: unknown;
	retryable?: unknown;
};

export class PermanentRedemptionError extends Error {
	readonly code = PAYMENT_NOT_FULFILLABLE_CODE;

	constructor(
		message: string,
		readonly serviceStatus: number
	) {
		super(message);
		this.name = 'PermanentRedemptionError';
	}
}

export function permanentRedemptionError(
	status: number,
	body: RedemptionFailureBody
): PermanentRedemptionError | undefined {
	if (status !== 422 || body.code !== PAYMENT_NOT_FULFILLABLE_CODE || body.retryable !== false) {
		return undefined;
	}
	return new PermanentRedemptionError(
		typeof body.error === 'string' ? body.error : 'Community cannot fulfill this payment',
		status
	);
}

function objectId(value: { id: string } | string | null | undefined) {
	return typeof value === 'string' ? value : value?.id;
}

export function checkoutPaymentIntentId(session: Stripe.Checkout.Session) {
	return objectId(session.payment_intent);
}

export function invoicePaymentIntentId(
	payments: Stripe.ApiList<Stripe.InvoicePayment> | null | undefined
) {
	for (const invoicePayment of payments?.data || []) {
		if (invoicePayment.status !== 'paid' || invoicePayment.payment.type !== 'payment_intent') {
			continue;
		}
		const paymentIntentId = objectId(invoicePayment.payment.payment_intent);
		if (paymentIntentId) return paymentIntentId;
	}
	return undefined;
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice) {
	if (invoice.parent?.type !== 'subscription_details') return undefined;
	return objectId(invoice.parent.subscription_details?.subscription);
}

export async function resolveCheckoutPaymentIntentId(
	stripe: Stripe,
	session: Stripe.Checkout.Session,
	stripeAccount: string
) {
	const eventPaymentIntentId = checkoutPaymentIntentId(session);
	if (eventPaymentIntentId) return eventPaymentIntentId;
	const currentSession = await stripe.checkout.sessions.retrieve(
		session.id,
		{ expand: ['payment_intent'] },
		{ stripeAccount }
	);
	return checkoutPaymentIntentId(currentSession);
}

export async function resolveInvoicePaymentIntentId(
	stripe: Stripe,
	invoice: Stripe.Invoice,
	stripeAccount: string
) {
	const eventPaymentIntentId = invoicePaymentIntentId(invoice.payments);
	if (eventPaymentIntentId) return eventPaymentIntentId;
	const payments = await stripe.invoicePayments.list(
		{ invoice: invoice.id, status: 'paid', limit: 100 },
		{ stripeAccount }
	);
	return invoicePaymentIntentId(payments);
}

export async function cancelUnfulfillableSubscription(
	stripe: Stripe,
	input: {
		redemptionId: string;
		stripeAccount: string;
		subscriptionId: string;
	}
) {
	return stripe.subscriptions.cancel(
		input.subscriptionId,
		{ invoice_now: false, prorate: false },
		{
			stripeAccount: input.stripeAccount,
			idempotencyKey: `badge-fulfillment-cancel:${input.redemptionId}`
		}
	);
}

export async function refundUnfulfillablePayment(
	stripe: Stripe,
	input: {
		paymentIntentId: string;
		redemptionId: string;
		serviceError: string;
		stripeAccount: string;
		stripeEventId: string;
	}
) {
	return stripe.refunds.create(
		{
			payment_intent: input.paymentIntentId,
			metadata: {
				cause: PAYMENT_NOT_FULFILLABLE_CODE,
				community_error: input.serviceError.slice(0, 500),
				redemption_id: input.redemptionId,
				stripe_event_id: input.stripeEventId
			}
		},
		{
			stripeAccount: input.stripeAccount,
			idempotencyKey: `badge-fulfillment-refund:${input.redemptionId}`
		}
	);
}
