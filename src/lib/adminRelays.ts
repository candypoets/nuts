import type { ListParsed, ParsedEvent } from '@candypoets/nipworker';
import { fbArray } from '@candypoets/nipworker/utils';
import { normalizeURL } from 'nostr-tools/utils';

export type RelayRole = 'admin' | 'member' | 'following' | 'purchase';

export const RELAY_ROLE_SETS: Record<RelayRole, { d: string; title: string; description: string }> =
	{
		admin: {
			d: 'nuts-relays-admin',
			title: 'Nuts relays I admin',
			description: 'Relays this Nuts account administers'
		},
		member: {
			d: 'nuts-relays-member',
			title: 'Nuts relays I am a member of',
			description: 'Relays where this Nuts account is a member'
		},
		following: {
			d: 'nuts-relays-following',
			title: 'Nuts relays I follow',
			description: 'Relays this Nuts account follows'
		},
		purchase: {
			d: 'nuts-relays-purchases',
			title: 'Nuts relays I purchased from',
			description: 'Relays where this Nuts account has purchases or active orders'
		}
	};

export const ADMIN_RELAY_SET_D = RELAY_ROLE_SETS.admin.d;
export const PURCHASE_RELAY_SET_D = RELAY_ROLE_SETS.purchase.d;

export type RelayInfo = {
	url: string;
	name?: string;
	description?: string;
	pubkey?: string;
	isAdmin: boolean;
	error?: string;
};

export function relaySetAddress(pubkey: string, role: RelayRole) {
	return `30002:${pubkey}:${RELAY_ROLE_SETS[role].d}`;
}

export function relayRoleFromSet(event: ParsedEvent): RelayRole | undefined {
	const d = parsedEventTags(event).find((tag) => tag[0] === 'd')?.[1];
	return (
		Object.entries(RELAY_ROLE_SETS) as [RelayRole, (typeof RELAY_ROLE_SETS)[RelayRole]][]
	).find(([, config]) => config.d === d)?.[0];
}

export function parsedEventTags(event: ParsedEvent): string[][] {
	const tags: string[][] = [];
	const tagsLength = event.tagsLength();
	for (let i = 0; i < tagsLength; i++) {
		const tagVec = event.tags(i);
		if (!tagVec) continue;

		const tag: string[] = [];
		const itemsLength = tagVec.itemsLength();
		for (let j = 0; j < itemsLength; j++) {
			tag.push(tagVec.items(j));
		}
		tags.push(tag);
	}
	return tags;
}

export function relayUrlsFromRelaySet(event: ParsedEvent | undefined): string[] {
	if (!event) return [];
	const urls = parsedEventTags(event)
		.filter((tag) => tag[0] === 'relay' && tag[1])
		.map((tag) => normalizeURL(tag[1]));
	return Array.from(new Set(urls));
}

export const relayUrlsFromAdminRelaySet = relayUrlsFromRelaySet;

export function relayUrlsFromNip51List(list: ListParsed | null | undefined): string[] {
	if (!list) return [];
	const urls = fbArray(list, 'otherTags')
		.filter((tag) => tag.key() === 'relay' && tag.valuesLength() > 0)
		.map((tag) => normalizeURL(tag.values(0)));
	return Array.from(new Set(urls));
}

export function relaySetAddressesFromRelayFeed(list: ListParsed | null | undefined): string[] {
	if (!list) return [];
	const addresses = fbArray(list, 'addresses')
		.filter((address) => Number(address.kind()) === 30002 && address.pubkey() && address.d())
		.map((address) => `30002:${address.pubkey()}:${address.d()}`);
	return Array.from(new Set(addresses));
}

export function relaySetAddressesFromRelayFeedEvent(event: ParsedEvent | undefined): string[] {
	if (!event) return [];
	const addresses = parsedEventTags(event)
		.filter((tag) => tag[0] === 'a' && tag[1]?.startsWith('30002:'))
		.map((tag) => tag[1]);
	return Array.from(new Set(addresses));
}

export function buildRelayListTagsWithReadRelay(
	existingEvent: ParsedEvent | undefined,
	relayUrl: string,
	defaultRelays: string[] = []
): string[][] {
	const relayModes = new Map<string, { read: boolean; write: boolean }>();

	function addRelay(url: string, read = true, write = true) {
		const normalized = normalizeURL(url);
		const existing = relayModes.get(normalized) || { read: false, write: false };
		relayModes.set(normalized, {
			read: existing.read || read,
			write: existing.write || write
		});
	}

	for (const tag of existingEvent ? parsedEventTags(existingEvent) : []) {
		if (tag[0] !== 'r' || !tag[1]) continue;
		const marker = tag[2];
		addRelay(tag[1], marker !== 'write', marker !== 'read');
	}

	defaultRelays.forEach((url) => addRelay(url));
	addRelay(relayUrl, true, false);

	return Array.from(relayModes.entries())
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([url, mode]) => {
			if (mode.read && mode.write) return ['r', url];
			if (mode.read) return ['r', url, 'read'];
			return ['r', url, 'write'];
		});
}

export function buildRelayRoleSetTags(
	role: RelayRole,
	existingEvent: ParsedEvent | undefined,
	relayUrl: string
): string[][] {
	const config = RELAY_ROLE_SETS[role];
	const urls = new Set(relayUrlsFromRelaySet(existingEvent));
	urls.add(normalizeURL(relayUrl));

	return [
		['d', config.d],
		['title', config.title],
		['description', config.description],
		...Array.from(urls)
			.sort()
			.map((url) => ['relay', url])
	];
}

export function buildAdminRelaySetTags(existingEvent: ParsedEvent | undefined, relayUrl: string) {
	return buildRelayRoleSetTags('admin', existingEvent, relayUrl);
}

export function buildRelayFeedIndexTags(pubkey: string, roles: RelayRole[]) {
	return roles.map((role) => ['a', relaySetAddress(pubkey, role)]);
}

export function mergeRelayFeedIndexTags(
	existingEvent: ParsedEvent | undefined,
	pubkey: string,
	roles: RelayRole[]
) {
	const tags = existingEvent ? parsedEventTags(existingEvent) : [];
	const seen = new Set(tags.map((tag) => tag.join('\u001f')));

	for (const tag of buildRelayFeedIndexTags(pubkey, roles)) {
		const key = tag.join('\u001f');
		if (seen.has(key)) continue;
		tags.push(tag);
		seen.add(key);
	}

	return tags;
}

export function createRelayEoseTracker(relays: string[]) {
	const pendingRelays = new Set(relays.map((relay) => normalizeURL(relay)));
	const relayCount = pendingRelays.size;

	return (status: string | null | undefined, relayUrl: string | null | undefined) => {
		if (status === 'EOSE' && relayUrl) {
			pendingRelays.delete(normalizeURL(relayUrl));
		}
		return {
			completed: relayCount - pendingRelays.size,
			settled: pendingRelays.size === 0
		};
	};
}

export function nextReplaceableCreatedAt(
	existingEvent: ParsedEvent | undefined,
	currentTimestamp: number
) {
	return Math.max(currentTimestamp, (existingEvent?.createdAt() || 0) + 1);
}

function relayInfoUrl(relayUrl: string) {
	const normalized = normalizeURL(relayUrl);
	if (normalized.startsWith('wss://')) return `https://${normalized.slice(6)}`;
	if (normalized.startsWith('ws://')) return `http://${normalized.slice(5)}`;
	return normalized;
}

function includesPubkey(value: unknown, pubkey: string): boolean {
	if (typeof value === 'string') return value === pubkey;
	if (Array.isArray(value)) return value.some((item) => includesPubkey(item, pubkey));
	if (!value || typeof value !== 'object') return false;
	return Object.values(value as Record<string, unknown>).some((item) =>
		includesPubkey(item, pubkey)
	);
}

export async function fetchRelayInfo(relayUrl: string, pubkey: string): Promise<RelayInfo> {
	const url = normalizeURL(relayUrl);
	try {
		const response = await fetch(relayInfoUrl(url), {
			headers: { accept: 'application/nostr+json' }
		});
		if (!response.ok) {
			return { url, isAdmin: false, error: `NIP-11 returned ${response.status}` };
		}

		const info = await response.json();
		const ownerPubkey = typeof info.pubkey === 'string' ? info.pubkey : undefined;
		const isAdmin =
			ownerPubkey === pubkey ||
			includesPubkey(info.admin_pubkeys, pubkey) ||
			includesPubkey(info.admins, pubkey) ||
			includesPubkey(info.admin_pubkey, pubkey);

		return {
			url,
			name: typeof info.name === 'string' ? info.name : undefined,
			description: typeof info.description === 'string' ? info.description : undefined,
			pubkey: ownerPubkey,
			isAdmin
		};
	} catch (err) {
		return {
			url,
			isAdmin: false,
			error: err instanceof Error ? err.message : 'Could not fetch NIP-11'
		};
	}
}

export const fetchAdminRelayInfo = fetchRelayInfo;
