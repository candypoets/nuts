import { normalizeURL } from 'nostr-tools/utils';
import { get } from 'svelte/store';
import { persistentWritable } from 'src/lib/persistentWritable';

export const selectedAdminRelayUrl = persistentWritable<string>('admin/selectedRelayUrl', '');

/**
 * HTTP base URL of each community's service endpoints (/invites, /redeem, ...),
 * remembered from the coordinator's RelayRecord at creation time. In production
 * it shares the relay's origin (Traefik path routing); in local dev it points at
 * the invite service's own port.
 */
export const adminServiceBaseUrls = persistentWritable<Record<string, string>>(
	'admin/serviceBaseUrls',
	{}
);

export function selectAdminRelayUrl(url: string) {
	selectedAdminRelayUrl.set(url ? normalizeURL(url) : '');
}

export function rememberAdminServiceBaseUrl(relayUrl: string, baseUrl: string) {
	if (!relayUrl || !baseUrl) return;
	adminServiceBaseUrls.update((map) => ({
		...map,
		[normalizeURL(relayUrl)]: baseUrl.replace(/\/+$/, '')
	}));
}

export function adminServiceBaseUrl(relayUrl: string): string {
	const stored = get(adminServiceBaseUrls)[normalizeURL(relayUrl || '')];
	if (stored) return stored;
	if (relayUrl.startsWith('wss://')) return `https://${relayUrl.slice(6)}`.replace(/\/+$/, '');
	if (relayUrl.startsWith('ws://')) return `http://${relayUrl.slice(5)}`.replace(/\/+$/, '');
	return (relayUrl || '').replace(/\/+$/, '');
}
