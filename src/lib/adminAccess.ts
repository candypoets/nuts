import type { ParsedEvent } from '@candypoets/nipworker';
import { SimplePool } from 'nostr-tools/pool';
import {
	ANCHOR_D,
	ANCHOR_KIND,
	isNewerAnchor,
	parseCommunityAnchor,
	parsePermissionTag,
	permissionGrants,
	type CommunityAnchor,
	type Permission
} from 'src/lib/nip97';

export type CommunityAccess = {
	isOwner: boolean;
	roles: string[];
	permissions: Permission[];
};

export type CommunityAccessEvent = {
	id: string;
	pubkey: string;
	created_at: number;
	tags: string[][];
};

function tagValue(tags: string[][], name: string) {
	return tags.find((tag) => tag[0] === name)?.[1] || '';
}

function hasTagValue(tags: string[][], name: string, value: string) {
	return tags.some((tag) => tag[0] === name && tag[1] === value);
}

function isNewerDefinition(candidate: CommunityAccessEvent, current: CommunityAccessEvent) {
	return (
		candidate.created_at > current.created_at ||
		(candidate.created_at === current.created_at && candidate.id.localeCompare(current.id) < 0)
	);
}

export function resolveCommunityAccessFromEvents(
	definitions: CommunityAccessEvent[],
	awards: CommunityAccessEvent[],
	pubkey: string,
	trustedIssuers: ReadonlySet<string>,
	now = Math.floor(Date.now() / 1000)
): CommunityAccess {
	const latestDefinitions = new Map<string, CommunityAccessEvent>();
	for (const definition of definitions) {
		if (!trustedIssuers.has(definition.pubkey)) continue;
		const d = tagValue(definition.tags, 'd');
		if (!d) continue;
		const address = `30009:${definition.pubkey}:${d}`;
		const current = latestDefinitions.get(address);
		if (!current || isNewerDefinition(definition, current)) {
			latestDefinitions.set(address, definition);
		}
	}

	const activeAddresses = new Set(
		awards
			.filter((award) => {
				if (!trustedIssuers.has(award.pubkey)) return false;
				const address = tagValue(award.tags, 'a');
				const expiration = Number(tagValue(award.tags, 'expiration') || 0);
				const recipients = award.tags
					.filter((tag) => tag[0] === 'p' && tag[1])
					.map((tag) => tag[1]);
				return (
					recipients.includes(pubkey) &&
					address.startsWith('30009:') &&
					(!expiration || expiration > now)
				);
			})
			.map((award) => tagValue(award.tags, 'a'))
	);

	const permissions: Permission[] = [];
	const roles: string[] = [];
	for (const [address, definition] of latestDefinitions) {
		if (!activeAddresses.has(address)) continue;
		if (hasTagValue(definition.tags, 't', 'role')) {
			roles.push(tagValue(definition.tags, 'name') || tagValue(definition.tags, 'd'));
		}
		for (const tag of definition.tags) {
			const permission = parsePermissionTag(tag);
			if (permission) permissions.push(permission);
		}
	}

	return { isOwner: false, roles, permissions };
}

/**
 * Kind-scoped capability check. `capability` is an event kind number or a named
 * capability string (invites/moderation/settings); owners can do everything.
 */
export function canDo(
	access: CommunityAccess,
	capability: string | number,
	action: 'read' | 'write' = 'write',
	topic?: string
): boolean {
	if (access.isOwner) return true;
	if (typeof capability === 'number') {
		return access.permissions.some((permission) =>
			permissionGrants(permission, capability, action, topic)
		);
	}
	return access.permissions.some(
		(permission) =>
			permission.capability === capability && (!permission.access || permission.access === action)
	);
}

function relayInfoUrl(community: string) {
	if (community.startsWith('wss://')) return `https://${community.slice(6)}`;
	if (community.startsWith('ws://')) return `http://${community.slice(5)}`;
	return community;
}

async function fetchRootPubkey(community: string) {
	try {
		const response = await fetch(relayInfoUrl(community), {
			headers: { accept: 'application/nostr+json' }
		});
		if (!response.ok) return '';
		const info = await response.json();
		const pubkey = info.pubkey;
		return typeof pubkey === 'string' && /^[0-9a-f]{64}$/i.test(pubkey) ? pubkey.toLowerCase() : '';
	} catch {
		return '';
	}
}

/** Wraps a plain relay event in the ParsedEvent shape the NIP-97 parser expects. */
function asParsedEvent(event: {
	kind: number;
	id: string;
	pubkey: string;
	created_at: number;
	tags: string[][];
}): ParsedEvent {
	return {
		kind: () => event.kind,
		id: () => event.id,
		pubkey: () => event.pubkey,
		createdAt: () => event.created_at,
		tagsLength: () => event.tags.length,
		tags: (index: number) => ({
			itemsLength: () => event.tags[index].length,
			items: (item: number) => event.tags[index][item]
		})
	} as unknown as ParsedEvent;
}

/**
 * Resolves the community anchor: NIP-11 `pubkey` is the root key, the anchor is
 * the root-signed kind 31727 event with `d=community` on the community relay.
 */
export async function fetchCommunityAnchor(
	community: string
): Promise<CommunityAnchor | undefined> {
	const root = await fetchRootPubkey(community);
	if (!root) return undefined;

	const pool = new SimplePool();
	try {
		const events = await pool.querySync(
			[community],
			{ kinds: [ANCHOR_KIND], authors: [root], '#d': [ANCHOR_D], limit: 10 },
			{ maxWait: 2500 }
		);
		let anchor: CommunityAnchor | undefined;
		for (const event of events) {
			const candidate = parseCommunityAnchor(asParsedEvent(event));
			if (candidate && (!anchor || isNewerAnchor(candidate, anchor))) anchor = candidate;
		}
		return anchor;
	} finally {
		pool.destroy();
	}
}

export type CommunityTrust = {
	rootPubkey: string;
	admins: Set<string>;
	badgeIssuer?: string;
};

export async function fetchCommunityTrust(community: string): Promise<CommunityTrust> {
	const anchor = await fetchCommunityAnchor(community);
	if (!anchor) return { rootPubkey: '', admins: new Set() };
	return {
		rootPubkey: anchor.pubkey,
		admins: new Set(anchor.admins),
		badgeIssuer: anchor.badgeIssuer
	};
}

export async function fetchCommunityAccess(
	community: string,
	pubkey: string,
	isOwner: boolean
): Promise<CommunityAccess> {
	if (isOwner) {
		return { isOwner: true, roles: ['Admin'], permissions: [] };
	}

	const trust = await fetchCommunityTrust(community);
	const issuers = [...trust.admins, ...(trust.badgeIssuer ? [trust.badgeIssuer] : [])];
	if (!issuers.length) {
		return { isOwner: false, roles: [], permissions: [] };
	}

	const pool = new SimplePool();
	try {
		const [definitions, awards] = await Promise.all([
			pool.querySync(
				[community],
				{
					kinds: [30009],
					authors: [...trust.admins],
					'#t': ['role', 'membership'],
					limit: 200
				},
				{ maxWait: 2500 }
			),
			pool.querySync(
				[community],
				{ kinds: [8], authors: issuers, '#p': [pubkey], limit: 200 },
				{ maxWait: 2500 }
			)
		]);
		return resolveCommunityAccessFromEvents(definitions, awards, pubkey, new Set(issuers));
	} finally {
		pool.destroy();
	}
}
