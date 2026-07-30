import { env } from '$env/dynamic/private';
import { normalizeURL } from 'nostr-tools/utils';

function configuredServiceUrls() {
	try {
		const parsed = JSON.parse(env.NUTS_COMMUNITY_SERVICE_URLS || '{}') as Record<string, unknown>;
		return new Map(
			Object.entries(parsed)
				.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
				.map(([relay, service]) => [normalizeURL(relay), service.replace(/\/+$/, '')])
		);
	} catch {
		return new Map<string, string>();
	}
}

export function communityPaymentRedemptionUrl(community: string) {
	const normalizedCommunity = normalizeURL(community);
	const configured = configuredServiceUrls().get(normalizedCommunity);
	const baseUrl =
		configured ||
		normalizedCommunity.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/+$/, '');
	return new URL('/redeem', `${baseUrl}/`).toString();
}
