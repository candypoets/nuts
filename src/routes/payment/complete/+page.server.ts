import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { normalizeURL } from 'nostr-tools/utils';
import { getStripeConnection, stripeClient } from 'src/lib/server/stripe';

export const load: PageServerLoad = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');
	const communityValue = url.searchParams.get('community');
	if (!sessionId || !communityValue) throw error(400, 'Missing checkout details');
	const community = normalizeURL(communityValue);
	const connection = await getStripeConnection(community);
	if (!connection) throw error(404, 'Community payment account not found');
	const session = await stripeClient().checkout.sessions.retrieve(
		sessionId,
		{},
		{ stripeAccount: connection.accountId }
	);
	return {
		status: session.payment_status,
		customerEmail: session.customer_details?.email || '',
		community
	};
};
