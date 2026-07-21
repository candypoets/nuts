import { json, error, type RequestHandler } from '@sveltejs/kit';
import { normalizeURL } from 'nostr-tools/utils';
import { requireCommunityAdmin } from 'src/lib/server/nostrAuth';
import {
	getStripeConnection,
	saveStripeConnection,
	stripeClient
} from 'src/lib/server/stripe';

type ConnectRequest = {
	action?: 'status' | 'onboard' | 'dashboard';
	community?: string;
	country?: string;
};

export const POST: RequestHandler = async (event) => {
	const body = await event.request.text();
	let input: ConnectRequest;
	try {
		input = JSON.parse(body);
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	if (!input.community) throw error(400, 'Community is required');
	const community = normalizeURL(input.community);
	const adminPubkey = await requireCommunityAdmin(event, body, community);

	try {
		let connection = await getStripeConnection(community);
		const stripe = stripeClient();

		if (!connection && input.action === 'onboard') {
			const country = input.country?.trim().toLowerCase();
			if (!country || !/^[a-z]{2}$/.test(country)) {
				throw error(400, 'Select the merchant’s legal country before connecting Stripe');
			}
			const account = await stripe.v2.core.accounts.create({
				display_name: communityName(community),
				dashboard: 'full',
				configuration: {
					merchant: {
						capabilities: {
							card_payments: { requested: true }
						}
					}
				},
				defaults: {
					responsibilities: {
						fees_collector: 'stripe',
						losses_collector: 'stripe'
					}
				},
				identity: { country },
				metadata: { community, nostr_admin: adminPubkey },
				include: ['configuration.merchant', 'defaults', 'identity', 'requirements']
			});
			connection = {
				accountId: account.id,
				community,
				createdAt: new Date().toISOString(),
				createdBy: adminPubkey
			};
			await saveStripeConnection(connection);
		}

		if (!connection) {
			return json({ connected: false, configured: true });
		}

		const account = await stripe.v2.core.accounts.retrieve(connection.accountId, {
			include: ['configuration.merchant', 'defaults', 'identity', 'requirements']
		});
		if (input.action === 'onboard') {
			const returnUrl = new URL('/stripe/connect/return?result=complete', event.url.origin);
			const refreshUrl = new URL('/stripe/connect/return?result=refresh', event.url.origin);
			const link = await stripe.v2.core.accountLinks.create({
				account: connection.accountId,
				use_case: {
					type: 'account_onboarding',
					account_onboarding: {
						configurations: ['merchant'],
						refresh_url: refreshUrl.toString(),
						return_url: returnUrl.toString(),
						collection_options: {
							fields: 'eventually_due',
							future_requirements: 'include'
						}
					}
				}
			});
			return json({ url: link.url });
		}

		if (input.action === 'dashboard') {
			return json({
				url: account.livemode
					? 'https://dashboard.stripe.com'
					: 'https://dashboard.stripe.com/test/dashboard'
			});
		}

		const requirementsDue = (account.requirements?.entries || []).filter((requirement) => {
			const status = requirement.minimum_deadline.status;
			return status === 'currently_due' || status === 'past_due';
		}).length;
		const cardPayments = account.configuration?.merchant?.capabilities?.card_payments;
		const payouts = account.configuration?.merchant?.capabilities?.stripe_balance?.payouts;
		const detailsSubmitted =
			account.applied_configurations.includes('merchant') && requirementsDue === 0;

		return json({
			connected: true,
			configured: true,
			accountId: account.id,
			detailsSubmitted,
			chargesEnabled: cardPayments?.status === 'active',
			payoutsEnabled: payouts?.status === 'active',
			country: account.identity?.country,
			currency: account.defaults?.currency,
			requirementsDue
		});
	} catch (cause) {
		if ('status' in (cause as object)) throw cause;
		const message = cause instanceof Error ? cause.message : 'Stripe request failed';
		if (message.includes('STRIPE_SECRET_KEY')) {
			return json({ connected: false, configured: false, error: message }, { status: 503 });
		}
		throw error(502, message);
	}
};

function communityName(community: string) {
	try {
		return new URL(community.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')).hostname;
	} catch {
		return 'Nuts community';
	}
}
