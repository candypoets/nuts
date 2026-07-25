import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { normalizeURL } from 'nostr-tools/utils';
import { getStripeConnection, stripeClient } from 'src/lib/server/stripe';

export const load: PageServerLoad = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');
	const communityValue = url.searchParams.get('community');
	if (!sessionId || !communityValue) throw error(400, 'Missing checkout details');
	if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
		throw error(400, 'Invalid checkout session');
	}
	const community = normalizeURL(communityValue);
	const connection = await getStripeConnection(community);
	if (!connection) throw error(404, 'Community payment account not found');
	const session = await stripeClient().checkout.sessions.retrieve(
		sessionId,
		{},
		{ stripeAccount: connection.accountId }
	);
	if (
		session.metadata?.community !== community ||
		session.metadata?.stripe_account !== connection.accountId
	) {
		throw error(403, 'Checkout session does not belong to this community');
	}
	const requestedReturnUrl = new URL(url.searchParams.get('return_to') || '/explore', url.origin);
	const returnTo =
		requestedReturnUrl.origin === url.origin &&
		!requestedReturnUrl.pathname.startsWith('/payment/complete')
			? `${requestedReturnUrl.pathname}${requestedReturnUrl.search}${requestedReturnUrl.hash}`
			: '/explore';
	return {
		status: session.payment_status,
		community,
		recipientPubkey: session.metadata?.nostr_recipient || '',
		returnTo
	};
};
