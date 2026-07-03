import { normalizeURL } from 'nostr-tools/utils';
import { persistentWritable } from 'src/lib/persistentWritable';

export const selectedAdminRelayUrl = persistentWritable<string>('admin/selectedRelayUrl', '');

export function selectAdminRelayUrl(url: string) {
	selectedAdminRelayUrl.set(url ? normalizeURL(url) : '');
}
