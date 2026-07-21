import { error, type RequestEvent } from '@sveltejs/kit';
import { nip98, type Event as NostrEvent } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';

function decodeAuthorization(value: string) {
	const [scheme, token] = value.split(/\s+/, 2);
	if (scheme?.toLowerCase() !== 'nostr' || !token) throw error(401, 'Nostr authorization required');
	try {
		return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as NostrEvent;
	} catch {
		throw error(401, 'Invalid Nostr authorization');
	}
}

function relayHttpUrl(relay: string) {
	const normalized = normalizeURL(relay);
	if (normalized.startsWith('wss://')) return `https://${normalized.slice(6)}`;
	if (normalized.startsWith('ws://')) return `http://${normalized.slice(5)}`;
	return normalized;
}

function includesPubkey(value: unknown, pubkey: string): boolean {
	if (typeof value === 'string') return value === pubkey;
	if (Array.isArray(value)) return value.some((item) => includesPubkey(item, pubkey));
	if (!value || typeof value !== 'object') return false;
	return Object.values(value as Record<string, unknown>).some((item) => includesPubkey(item, pubkey));
}

export async function requireCommunityAdmin(event: RequestEvent, body: string, community: string) {
	const signedEvent = await requireNostrSigner(event, body);

	let response: Response;
	try {
		response = await event.fetch(relayHttpUrl(community), {
			headers: { accept: 'application/nostr+json' }
		});
	} catch {
		throw error(502, 'Could not verify the community administrator');
	}
	if (!response.ok) throw error(502, 'Could not load community administration metadata');

	const info = await response.json();
	const isAdmin =
		info?.pubkey === signedEvent.pubkey ||
		includesPubkey(info?.admin_pubkeys, signedEvent.pubkey) ||
		includesPubkey(info?.admins, signedEvent.pubkey) ||
		includesPubkey(info?.admin_pubkey, signedEvent.pubkey);
	if (!isAdmin) throw error(403, 'Only a community administrator can manage payments');
	return signedEvent.pubkey;
}

export async function requireNostrSigner(event: RequestEvent, body: string) {
	const authorization = event.request.headers.get('authorization') || '';
	const signedEvent = decodeAuthorization(authorization);
	const valid = await nip98.validateEvent(signedEvent, event.url.toString(), event.request.method, body);
	if (!valid) throw error(401, 'Invalid or expired Nostr authorization');
	return signedEvent;
}
