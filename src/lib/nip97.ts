import type { ParsedEvent } from '@candypoets/nipworker';
import { parsedEventTags } from 'src/lib/adminRelays';

/**
 * NIP-97 primitives: the community anchor event and the kind-scoped
 * `permission` tag grammar. Spec of record: NIP-97 (draft).
 */

export const ANCHOR_KIND = 31727;
export const ANCHOR_D = 'community';

/** Definition kinds an award's `a` tag may reference. */
export const DEFINITION_KINDS = [30009, 30402, 31922, 31923] as const;

export const FULFILLMENT_KIND = 37237;

/** Named (non-numeric) capabilities for off-relay features. */
export const NAMED_CAPABILITIES = ['invites', 'moderation', 'settings'] as const;
export type NamedCapability = (typeof NAMED_CAPABILITIES)[number];

export type CommunityAnchor = {
	id: string;
	pubkey: string;
	admins: string[];
	badgeIssuer?: string;
	name: string;
	description: string;
	image?: string;
	createdAt: number;
};

/** Latest anchor wins: created_at, then lowest event id as tie-breaker. */
export function isNewerAnchor(candidate: CommunityAnchor, current: CommunityAnchor) {
	return (
		candidate.createdAt > current.createdAt ||
		(candidate.createdAt === current.createdAt && candidate.id < current.id)
	);
}

export function parseCommunityAnchor(event: ParsedEvent): CommunityAnchor | undefined {
	if (event.kind() !== ANCHOR_KIND) return undefined;
	const tags = parsedEventTags(event);
	if (tags.find((tag) => tag[0] === 'd')?.[1] !== ANCHOR_D) return undefined;
	const pubkey = event.pubkey();
	if (!pubkey) return undefined;

	const admins = tags
		.filter((tag) => tag[0] === 'p')
		.map((tag) => tag[1])
		.filter((admin): admin is string => Boolean(admin));
	if (!admins.length) return undefined;

	const badgeIssuer = tags.find((tag) => tag[0] === 'badge_issuer')?.[1];
	return {
		id: event.id() || '',
		pubkey,
		admins,
		badgeIssuer: badgeIssuer && /^[0-9a-f]{64}$/i.test(badgeIssuer) ? badgeIssuer : undefined,
		name: tags.find((tag) => tag[0] === 'name')?.[1] || '',
		description: tags.find((tag) => tag[0] === 'description')?.[1] || '',
		image: tags.find((tag) => tag[0] === 'image')?.[1] || undefined,
		createdAt: Number(event.createdAt())
	};
}

export function buildCommunityAnchorTags(anchor: {
	admins: string[];
	badgeIssuer?: string;
	name?: string;
	description?: string;
	image?: string;
}) {
	if (!anchor.admins.length) throw new Error('anchor requires at least one admin');
	const tags = [['d', ANCHOR_D]];
	for (const admin of anchor.admins) tags.push(['p', admin]);
	if (anchor.badgeIssuer) tags.push(['badge_issuer', anchor.badgeIssuer]);
	if (anchor.name) tags.push(['name', anchor.name]);
	if (anchor.description) tags.push(['description', anchor.description]);
	if (anchor.image) tags.push(['image', anchor.image]);
	return tags;
}

export type PermissionAccess = 'read' | 'write';

export type Permission = {
	/** Raw 2nd tag element: a kind number as string, or a named capability. */
	capability: string;
	access?: PermissionAccess;
	topic?: string;
};

export function permissionKind(permission: Permission): number | undefined {
	if (!/^[0-9]+$/.test(permission.capability)) return undefined;
	const kind = Number(permission.capability);
	return Number.isSafeInteger(kind) && kind >= 0 && kind <= 65535 ? kind : undefined;
}

export function isNamedCapability(permission: Permission) {
	return permissionKind(permission) === undefined;
}

export function buildPermissionTag(permission: Permission): string[] {
	const tag = ['permission', permission.capability];
	if (permission.access) tag.push(permission.access);
	if (permission.topic) {
		if (!permission.access) tag.push('');
		tag.push(permission.topic);
	}
	return tag;
}

export function parsePermissionTag(tag: string[]): Permission | undefined {
	if (tag[0] !== 'permission' || !tag[1]) return undefined;
	const access = tag[2];
	return {
		capability: tag[1],
		access: access === 'read' || access === 'write' ? access : undefined,
		topic: tag[3] || undefined
	};
}

/**
 * Does a permission grant the requested access on an event of `kind` (with
 * optional `t` topic)? A permission without an access marker grants both read
 * and write; a permission without a topic filter grants any topic.
 */
export function permissionGrants(
	permission: Permission,
	kind: number,
	access: PermissionAccess,
	topic?: string
) {
	if (permissionKind(permission) !== kind) return false;
	if (permission.access && permission.access !== access) return false;
	if (permission.topic && permission.topic !== topic) return false;
	return true;
}

export function definitionAddress(kind: number, pubkey: string, d: string) {
	return `${kind}:${pubkey}:${d}`;
}

export function isDefinitionAddress(address: string) {
	const kind = Number(address.split(':')[0]);
	return (DEFINITION_KINDS as readonly number[]).includes(kind);
}
