import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMock = vi.hoisted(() => ({
	checkout: {
		sessions: {
			retrieve: vi.fn()
		}
	},
	invoicePayments: {
		list: vi.fn()
	},
	refunds: {
		create: vi.fn()
	},
	subscriptions: {
		cancel: vi.fn()
	},
	webhooks: {
		constructEvent: vi.fn()
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_test'
	}
}));

vi.mock('src/lib/server/paymentNip98', () => ({
	paymentServiceAuthorization: () => 'Nostr test'
}));

vi.mock('src/lib/server/stripe', () => ({
	stripeClient: () => stripeMock
}));

import { POST } from './+server';

const metadata = {
	community: 'ws://community.test',
	nostr_event_id: 'a'.repeat(64),
	badge_address: `30009:${'b'.repeat(64)}:test-product`,
	nostr_recipient: 'c'.repeat(64),
	purchase_type: 'product',
	stripe_account: 'acct_connected'
};

function checkoutEvent(): Stripe.Event {
	return {
		id: 'evt_checkout',
		account: 'acct_connected',
		created: 1_750_000_000,
		data: {
			object: {
				id: 'cs_test_product',
				metadata,
				mode: 'payment',
				object: 'checkout.session',
				payment_intent: 'pi_test_product',
				payment_status: 'paid'
			}
		},
		livemode: false,
		object: 'event',
		pending_webhooks: 1,
		request: null,
		type: 'checkout.session.completed'
	} as Stripe.Event;
}

function invoiceEvent(): Stripe.Event {
	return {
		id: 'evt_invoice',
		account: 'acct_connected',
		created: 1_750_000_000,
		data: {
			object: {
				id: 'in_membership',
				lines: {
					data: [{ period: { end: 1_752_592_000 } }]
				},
				object: 'invoice',
				parent: {
					type: 'subscription_details',
					subscription_details: {
						metadata: { ...metadata, purchase_type: 'membership' },
						subscription: 'sub_membership'
					}
				},
				payments: {
					data: [
						{
							payment: {
								payment_intent: 'pi_membership',
								type: 'payment_intent'
							},
							status: 'paid'
						}
					]
				},
				status_transitions: {
					paid_at: 1_750_000_000
				}
			}
		},
		livemode: false,
		object: 'event',
		pending_webhooks: 1,
		request: null,
		type: 'invoice.paid'
	} as Stripe.Event;
}

function request() {
	return new Request('http://nuts.test/api/stripe/webhook', {
		method: 'POST',
		headers: { 'stripe-signature': 'test-signature' },
		body: '{}'
	});
}

describe('Stripe webhook fulfillment refunds', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		stripeMock.webhooks.constructEvent.mockReturnValue(checkoutEvent());
		stripeMock.refunds.create.mockResolvedValue({
			id: 're_test_product',
			status: 'succeeded'
		});
	});

	it('refunds a permanently unfulfillable connected-account payment once', async () => {
		const fetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					code: 'payment_not_fulfillable',
					error: 'payment badge definition is not buyable',
					retryable: false
				}),
				{
					status: 422,
					headers: { 'content-type': 'application/json' }
				}
			)
		);

		const response = await POST({ request: request(), fetch } as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			received: true,
			refundId: 're_test_product',
			refunded: true
		});
		expect(stripeMock.refunds.create).toHaveBeenCalledWith(
			expect.objectContaining({
				payment_intent: 'pi_test_product',
				metadata: expect.objectContaining({
					cause: 'payment_not_fulfillable',
					redemption_id: 'cs_test_product'
				})
			}),
			{
				idempotencyKey: 'badge-fulfillment-refund:cs_test_product',
				stripeAccount: 'acct_connected'
			}
		);
	});

	it('does not refund transient community failures', async () => {
		const fetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					code: 'upstream_failure',
					error: 'relay unavailable',
					retryable: true
				}),
				{
					status: 502,
					headers: { 'content-type': 'application/json' }
				}
			)
		);

		await expect(POST({ request: request(), fetch } as never)).rejects.toMatchObject({
			status: 502
		});
		expect(stripeMock.refunds.create).not.toHaveBeenCalled();
	});

	it('cancels an unfulfillable membership before refunding its paid invoice', async () => {
		stripeMock.webhooks.constructEvent.mockReturnValue(invoiceEvent());
		stripeMock.subscriptions.cancel.mockResolvedValue({
			id: 'sub_membership',
			status: 'canceled'
		});
		const fetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					code: 'payment_not_fulfillable',
					error: 'membership is no longer buyable',
					retryable: false
				}),
				{
					status: 422,
					headers: { 'content-type': 'application/json' }
				}
			)
		);

		const response = await POST({ request: request(), fetch } as never);

		expect(response.status).toBe(200);
		expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith(
			'sub_membership',
			{ invoice_now: false, prorate: false },
			{
				idempotencyKey: 'badge-fulfillment-cancel:in_membership',
				stripeAccount: 'acct_connected'
			}
		);
		expect(stripeMock.refunds.create).toHaveBeenCalledWith(
			expect.objectContaining({ payment_intent: 'pi_membership' }),
			{
				idempotencyKey: 'badge-fulfillment-refund:in_membership',
				stripeAccount: 'acct_connected'
			}
		);
	});
});
