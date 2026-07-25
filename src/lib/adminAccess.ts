import { SimplePool } from 'nostr-tools/pool';
import { BADGE_DEFINITION_TYPE_TOPICS } from 'src/lib/catalog';

export const ADMIN_PERMISSION_KEYS = [
	'posts',
	'media',
	'events',
	'store',
	'invites',
	'moderation',
	'settings'
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSION_KEYS)[number];

export type CommunityAccess = {
	isOwner: boolean;
	permissions: Set<AdminPermission>;
	roles: string[];
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

function defaultRolePermissions(name: string): AdminPermission[] {
	const normalized = name.toLowerCase();
	if (normalized === 'admin') return [...ADMIN_PERMISSION_KEYS];
	return ['posts', 'media', ...(normalized === 'coach' ? ['events' as const] : [])];
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
					address.startsWith(`30009:${award.pubkey}:`) &&
					(!expiration || expiration > now)
				);
			})
			.map((award) => tagValue(award.tags, 'a'))
	);

	const permissions = new Set<AdminPermission>();
	const roles: string[] = [];
	for (const [address, definition] of latestDefinitions) {
		if (
			tagValue(definition.tags, 'type') !== 'role' ||
			!hasTagValue(definition.tags, 't', BADGE_DEFINITION_TYPE_TOPICS.role) ||
			!activeAddresses.has(address)
		) {
			continue;
		}
		const d = tagValue(definition.tags, 'd');
		const name = tagValue(definition.tags, 'name') || d;
		roles.push(name);
		const explicit = definition.tags
			.filter((tag) => tag[0] === 'permission' && tag[1] && tag[1] !== 'none')
			.map((tag) => tag[1])
			.filter((permission): permission is AdminPermission =>
				ADMIN_PERMISSION_KEYS.includes(permission as AdminPermission)
			);
		for (const permission of explicit.length ? explicit : defaultRolePermissions(name)) {
			permissions.add(permission);
		}
	}

	return { isOwner: false, permissions, roles };
}

function relayInfoUrl(community: string) {
	if (community.startsWith('wss://')) return `https://${community.slice(6)}`;
	if (community.startsWith('ws://')) return `http://${community.slice(5)}`;
	return community;
}

function pubkeysFrom(value: unknown): string[] {
	if (typeof value === 'string') return /^[0-9a-f]{64}$/i.test(value) ? [value.toLowerCase()] : [];
	if (Array.isArray(value)) return value.flatMap(pubkeysFrom);
	if (!value || typeof value !== 'object') return [];
	return Object.values(value as Record<string, unknown>).flatMap(pubkeysFrom);
}

export type CommunityTrust = {
	authorityPubkeys: Set<string>;
	badgeIssuer?: string;
};

export async function fetchTrustedRoleIssuers(community: string) {
	try {
		const response = await fetch(relayInfoUrl(community), {
			headers: { accept: 'application/nostr+json' }
		});
		if (!response.ok) return [];
		const info = await response.json();
		return Array.from(
			new Set([
				...pubkeysFrom(info.pubkey),
				...pubkeysFrom(info.admin_pubkeys),
				...pubkeysFrom(info.admins),
				...pubkeysFrom(info.admin_pubkey)
			])
		);
	} catch {
		return [];
	}
}

export async function fetchCommunityTrust(community: string): Promise<CommunityTrust> {
	const authorityPubkeys = new Set(await fetchTrustedRoleIssuers(community));
	let badgeIssuer: string | undefined;
	try {
		const url = new URL('/community/info', relayInfoUrl(community));
		const response = await fetch(url);
		if (response.ok) {
			const info = await response.json();
			const issuer =
				typeof info.badge_issuer === 'string'
					? info.badge_issuer
					: typeof info.booking_issuer === 'string'
						? info.booking_issuer
						: '';
			if (/^[0-9a-f]{64}$/i.test(issuer)) badgeIssuer = issuer.toLowerCase();
		}
	} catch {
		// Root community authorities can still issue non-payment awards.
	}
	return { authorityPubkeys, badgeIssuer };
}

export async function fetchCommunityAccess(
	community: string,
	pubkey: string,
	isOwner: boolean
): Promise<CommunityAccess> {
	if (isOwner) {
		return { isOwner: true, permissions: new Set(ADMIN_PERMISSION_KEYS), roles: ['Admin'] };
	}

	const pool = new SimplePool();
	try {
		const trustedIssuers = await fetchTrustedRoleIssuers(community);
		if (!trustedIssuers.length) {
			return { isOwner: false, permissions: new Set(), roles: [] };
		}
		const [definitions, awards] = await Promise.all([
			pool.querySync(
				[community],
				{
					kinds: [30009],
					authors: trustedIssuers,
					'#t': [BADGE_DEFINITION_TYPE_TOPICS.role],
					limit: 200
				},
				{ maxWait: 2500 }
			),
			pool.querySync(
				[community],
				{ kinds: [8], authors: trustedIssuers, '#p': [pubkey], limit: 200 },
				{ maxWait: 2500 }
			)
		]);
		return resolveCommunityAccessFromEvents(definitions, awards, pubkey, new Set(trustedIssuers));
	} finally {
		pool.destroy();
	}
}
