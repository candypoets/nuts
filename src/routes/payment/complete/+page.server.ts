import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { normalizeURL } from 'nostr-tools/utils';
import { paymentServiceUrl } from 'src/lib/paymentService';

export const load: PageServerLoad = async ({ url, fetch }) => {
	const sessionId = url.searchParams.get('session_id');
	const communityValue = url.searchParams.get('community');
	if (!sessionId || !communityValue) throw error(400, 'Missing checkout details');
	if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
		throw error(400, 'Invalid checkout session');
	}
	const community = normalizeURL(communityValue);
	const statusUrl = new URL(paymentServiceUrl('/stripe/session'));
	statusUrl.searchParams.set('community', community);
	statusUrl.searchParams.set('session_id', sessionId);
	const response = await fetch(statusUrl);
	const session = (await response.json().catch(() => ({}))) as {
		status?: string;
		recipientPubkey?: string;
		error?: string;
	};
	if (!response.ok)
		throw error(response.status, session.error || 'Could not verify checkout session');
	const requestedReturnUrl = new URL(url.searchParams.get('return_to') || '/explore', url.origin);
	const returnTo =
		requestedReturnUrl.origin === url.origin &&
		!requestedReturnUrl.pathname.startsWith('/payment/complete')
			? `${requestedReturnUrl.pathname}${requestedReturnUrl.search}${requestedReturnUrl.hash}`
			: '/explore';
	return {
		status: session.status || 'unpaid',
		community,
		recipientPubkey: session.recipientPubkey || '',
		returnTo
	};
};
