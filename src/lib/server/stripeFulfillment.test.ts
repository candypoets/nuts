import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import {
	checkoutPaymentIntentId,
	invoicePaymentIntentId,
	invoiceSubscriptionId,
	PAYMENT_NOT_FULFILLABLE_CODE,
	permanentRedemptionError
} from './stripeFulfillment';

describe('Stripe fulfillment failures', () => {
	it('accepts only the explicit permanent community rejection contract', () => {
		expect(
			permanentRedemptionError(422, {
				code: PAYMENT_NOT_FULFILLABLE_CODE,
				error: 'item is unavailable',
				retryable: false
			})
		).toMatchObject({
			message: 'item is unavailable',
			serviceStatus: 422
		});
		expect(
			permanentRedemptionError(503, {
				code: PAYMENT_NOT_FULFILLABLE_CODE,
				retryable: false
			})
		).toBeUndefined();
		expect(
			permanentRedemptionError(422, {
				code: PAYMENT_NOT_FULFILLABLE_CODE,
				retryable: true
			})
		).toBeUndefined();
		expect(
			permanentRedemptionError(422, {
				code: 'invalid_request',
				retryable: false
			})
		).toBeUndefined();
	});

	it('reads a Checkout PaymentIntent from either an ID or expanded object', () => {
		expect(
			checkoutPaymentIntentId({
				payment_intent: 'pi_checkout'
			} as Stripe.Checkout.Session)
		).toBe('pi_checkout');
		expect(
			checkoutPaymentIntentId({
				payment_intent: { id: 'pi_expanded' }
			} as Stripe.Checkout.Session)
		).toBe('pi_expanded');
	});

	it('selects the paid invoice PaymentIntent and subscription', () => {
		const invoice = {
			parent: {
				type: 'subscription_details',
				subscription_details: {
					subscription: { id: 'sub_membership' }
				}
			},
			payments: {
				data: [
					{
						status: 'open',
						payment: { type: 'payment_intent', payment_intent: 'pi_open' }
					},
					{
						status: 'paid',
						payment: { type: 'payment_intent', payment_intent: { id: 'pi_paid' } }
					}
				]
			}
		} as Stripe.Invoice;

		expect(invoicePaymentIntentId(invoice.payments)).toBe('pi_paid');
		expect(invoiceSubscriptionId(invoice)).toBe('sub_membership');
	});
});
