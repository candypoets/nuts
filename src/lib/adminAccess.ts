import { SimplePool } from 'nostr-tools/pool';

export const ADMIN_PERMISSION_KEYS = [
	'posts',
	'media',
	'events',
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

function tagValue(tags: string[][], name: string) {
	return tags.find((tag) => tag[0] === name)?.[1] || '';
}

function defaultRolePermissions(name: string): AdminPermission[] {
	const normalized = name.toLowerCase();
	if (normalized === 'admin') return [...ADMIN_PERMISSION_KEYS];
	return ['posts', 'media', ...(normalized === 'coach' ? ['events' as const] : [])];
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
		const [definitions, awards] = await Promise.all([
			pool.querySync([community], { kinds: [30009], limit: 200 }, { maxWait: 2500 }),
			pool.querySync([community], { kinds: [8], '#p': [pubkey], limit: 200 }, { maxWait: 2500 })
		]);
		const now = Math.floor(Date.now() / 1000);
		const activeAddresses = new Set(
			awards
				.filter((award) => {
					const address = tagValue(award.tags, 'a');
					const expiration = Number(tagValue(award.tags, 'expiration') || 0);
					return address.startsWith(`30009:${award.pubkey}:`) && (!expiration || expiration > now);
				})
				.map((award) => tagValue(award.tags, 'a'))
		);
		const permissions = new Set<AdminPermission>();
		const roles: string[] = [];
		for (const definition of definitions) {
			const d = tagValue(definition.tags, 'd');
			const type = tagValue(definition.tags, 'type');
			const address = `30009:${definition.pubkey}:${d}`;
			if (!d || type === 'membership' || type === 'event_access' || !activeAddresses.has(address)) continue;
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
	} finally {
		pool.destroy();
	}
}
