import type { ParsedEvent } from '@candypoets/nipworker';
import { parsedEventTags } from 'src/lib/adminRelays';

export type RoleDefinition = {
	address: string;
	pubkey: string;
	d: string;
	name: string;
	description: string;
	image?: string;
	permissions?: string[];
	createdAt: number;
};

export type RoleAward = {
	id: string;
	pubkey: string;
	roleAddress: string;
	recipient: string;
	expiresAt?: number;
	createdAt: number;
};

export function roleDFromName(name: string) {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function roleAddress(pubkey: string, d: string) {
	return `30009:${pubkey}:${d}`;
}

export function parseRoleDefinition(event: ParsedEvent): RoleDefinition | undefined {
	if (event.kind() !== 30009) return undefined;
	const tags = parsedEventTags(event);
	if (tags.find((tag) => tag[0] === 'type')?.[1] === 'membership') return undefined;
	const d = tags.find((tag) => tag[0] === 'd')?.[1];
	if (!d) return undefined;

	const name = tags.find((tag) => tag[0] === 'name')?.[1] || d;
	const description = tags.find((tag) => tag[0] === 'description')?.[1] || '';
	const image = tags.find((tag) => tag[0] === 'image')?.[1];
	const permissions = tags
		.filter((tag) => tag[0] === 'permission')
		.map((tag) => tag[1])
		.filter((permission): permission is string => Boolean(permission));
	const pubkey = event.pubkey();
	if (!pubkey) return undefined;

	return {
		address: roleAddress(pubkey, d),
		pubkey,
		d,
		name,
		description,
		image,
		permissions: permissions.length ? permissions : undefined,
		createdAt: Number(event.createdAt())
	};
}

export function parseRoleAward(event: ParsedEvent): RoleAward | undefined {
	if (event.kind() !== 8) return undefined;
	const tags = parsedEventTags(event);
	const roleAddressTag = tags.find((tag) => tag[0] === 'a' && tag[1]?.startsWith('30009:'))?.[1];
	const recipient = tags.find((tag) => tag[0] === 'p')?.[1];
	const pubkey = event.pubkey();
	if (!roleAddressTag || !recipient || !pubkey) return undefined;

	const expiresAtTag = tags.find((tag) => tag[0] === 'expiration')?.[1];
	const expiresAt = expiresAtTag ? Number(expiresAtTag) : undefined;

	return {
		id: event.id() || `${roleAddressTag}:${recipient}:${event.createdAt()}`,
		pubkey,
		roleAddress: roleAddressTag,
		recipient,
		expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
		createdAt: Number(event.createdAt())
	};
}

export function parseRoleAwardsFromKind8(event: ParsedEvent): RoleAward[] {
	if (event.kind() !== 8) return [];
	const tags = parsedEventTags(event);
	const roleAddress = tags.find((tag) => tag[0] === 'a' && tag[1]?.startsWith('30009:'))?.[1];
	const pubkey = event.pubkey();
	if (!roleAddress || !pubkey) return [];

	const expiresAtTag = tags.find((tag) => tag[0] === 'expiration')?.[1];
	const expiresAt = expiresAtTag ? Number(expiresAtTag) : undefined;

	return tags
		.filter((tag) => tag[0] === 'p')
		.map((tag) => tag[1])
		.filter((recipient): recipient is string => Boolean(recipient))
		.map((recipient) => ({
			id: event.id() || `${roleAddress}:${recipient}:${event.createdAt()}`,
			pubkey,
			roleAddress,
			recipient,
			expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
			createdAt: Number(event.createdAt())
		}));
}

export function buildRoleDefinitionTags(role: {
	d: string;
	name: string;
	description: string;
	image?: string;
	permissions?: string[];
}) {
	const tags = [
		['d', role.d],
		['name', role.name],
		['description', role.description]
	];
	if (role.image) tags.push(['image', role.image]);
	if (role.permissions) {
		for (const permission of role.permissions.length ? role.permissions : ['none']) {
			tags.push(['permission', permission]);
		}
	}
	return tags;
}

export function buildRoleAwardTags(award: {
	roleAddress: string;
	recipient: string;
	expiresAt?: number;
}) {
	const tags = [
		['a', award.roleAddress],
		['p', award.recipient]
	];
	if (award.expiresAt) tags.push(['expiration', String(award.expiresAt)]);
	return tags;
}
