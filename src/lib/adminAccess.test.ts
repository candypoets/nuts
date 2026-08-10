import { describe, expect, it } from 'vitest';

import { canDo, resolveCommunityAccessFromEvents, type CommunityAccessEvent } from './adminAccess';

const issuer = '21317a0b4045a4ce330c9463ccbd6c63b5df5a67718e05adc1270853b2e47f0e';
const badgeIssuer = '6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f';
const recipient = '9ea5e56c87320c5c076ea588a0559b1b21dcaef549c83992a65e3c0f7a4d61a7';

function definition(
	topic: string | undefined,
	options: {
		id?: string;
		createdAt?: number;
		d?: string;
		pubkey?: string;
		permissions?: string[][];
	} = {}
): CommunityAccessEvent {
	const d = options.d ?? 'staff';
	return {
		id: options.id ?? `${topic ?? 'untagged'}-definition`,
		pubkey: options.pubkey ?? issuer,
		created_at: options.createdAt ?? 10,
		tags: [
			['d', d],
			...(topic ? [['t', topic]] : []),
			['name', 'Staff'],
			...(options.permissions ?? [])
		]
	};
}

function award(d = 'staff', pubkey = issuer): CommunityAccessEvent {
	return {
		id: 'award-id',
		pubkey,
		created_at: 12,
		tags: [
			['a', `30009:${issuer}:${d}`],
			['p', recipient]
		]
	};
}

describe('resolveCommunityAccessFromEvents', () => {
	it('grants kind-scoped permissions from an awarded role', () => {
		const access = resolveCommunityAccessFromEvents(
			[
				definition('role', {
					permissions: [
						['permission', '31923', 'write'],
						['permission', 'moderation']
					]
				})
			],
			[award()],
			recipient,
			new Set([issuer]),
			100
		);

		expect(access.roles).toEqual(['Staff']);
		expect(access.permissions).toEqual([
			{ capability: '31923', access: 'write', topic: undefined },
			{ capability: 'moderation', access: undefined, topic: undefined }
		]);
	});

	it('grants permissions from any awarded definition carrying permission tags', () => {
		// NIP-97 has one mechanism: permission tags on the awarded definition,
		// independent of its topic. A sellable membership can confer capabilities.
		const access = resolveCommunityAccessFromEvents(
			[
				definition('membership', {
					permissions: [['permission', '1', 'write']]
				})
			],
			[award()],
			recipient,
			new Set([issuer]),
			100
		);

		expect(access.roles).toEqual([]);
		expect(access.permissions).toEqual([{ capability: '1', access: 'write', topic: undefined }]);
	});

	it.each(['membership', undefined])(
		'grants nothing from %s definitions without permission tags',
		(topic) => {
			const access = resolveCommunityAccessFromEvents(
				[definition(topic)],
				[award()],
				recipient,
				new Set([issuer]),
				100
			);

			expect(access.roles).toEqual([]);
			expect(access.permissions).toEqual([]);
		}
	);

	it('lists an awarded role without permission tags as a role that grants nothing', () => {
		const access = resolveCommunityAccessFromEvents(
			[definition('role')],
			[award()],
			recipient,
			new Set([issuer]),
			100
		);

		expect(access.roles).toEqual(['Staff']);
		expect(access.permissions).toEqual([]);
	});

	it('uses the newest addressable definition before resolving permissions', () => {
		const access = resolveCommunityAccessFromEvents(
			[
				definition('role', { id: 'old', createdAt: 10, permissions: [['permission', 'settings']] }),
				definition('membership', { id: 'new', createdAt: 11 })
			],
			[award()],
			recipient,
			new Set([issuer]),
			100
		);

		expect(access.roles).toEqual([]);
		expect(access.permissions).toEqual([]);
	});

	it('lets a trusted badge issuer award an admin-authored definition', () => {
		const access = resolveCommunityAccessFromEvents(
			[definition('role', { permissions: [['permission', 'invites']] })],
			[award('staff', badgeIssuer)],
			recipient,
			new Set([issuer, badgeIssuer]),
			100
		);

		expect(access.roles).toEqual(['Staff']);
		expect(access.permissions).toEqual([
			{ capability: 'invites', access: undefined, topic: undefined }
		]);
	});

	it('ignores awards for another recipient, expired awards, and mismatched issuers', () => {
		const otherRecipient = {
			...award(),
			tags: [
				['a', `30009:${issuer}:staff`],
				['p', 'other']
			]
		};
		const expired = { ...award(), tags: [...award().tags, ['expiration', '99']] };
		const mismatched = {
			...award(),
			pubkey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
		};

		for (const candidate of [otherRecipient, expired, mismatched]) {
			const access = resolveCommunityAccessFromEvents(
				[definition('role', { permissions: [['permission', 'settings']] })],
				[candidate],
				recipient,
				new Set([issuer]),
				100
			);
			expect(access.permissions).toEqual([]);
		}
	});

	it('rejects a self-authored role chain from an untrusted issuer', () => {
		const attacker = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
		const attackerDefinition = definition('role', {
			pubkey: attacker,
			permissions: [['permission', 'settings']]
		});
		const attackerAward = {
			...award('staff', attacker),
			tags: [
				['a', `30009:${attacker}:staff`],
				['p', recipient]
			]
		};

		const access = resolveCommunityAccessFromEvents(
			[attackerDefinition],
			[attackerAward],
			recipient,
			new Set([issuer]),
			100
		);

		expect(access.permissions).toEqual([]);
	});
});

describe('canDo', () => {
	const access = {
		isOwner: false,
		roles: ['Staff'],
		permissions: [
			{ capability: '31923', access: 'write' as const },
			{ capability: '1' },
			{ capability: 'moderation' }
		]
	};

	it('checks kind-scoped capabilities with default write access', () => {
		expect(canDo(access, 31923)).toBe(true);
		expect(canDo(access, '31923', 'write')).toBe(true);
		expect(canDo(access, 31923, 'read')).toBe(false);
		// No access marker grants both read and write.
		expect(canDo(access, 1, 'read')).toBe(true);
		expect(canDo(access, 1, 'write')).toBe(true);
		expect(canDo(access, 30402)).toBe(false);
	});

	it('checks named capabilities', () => {
		expect(canDo(access, 'moderation')).toBe(true);
		expect(canDo(access, 'invites')).toBe(false);
	});

	it('lets owners do everything', () => {
		const owner = { isOwner: true, roles: ['Admin'], permissions: [] };
		expect(canDo(owner, 30402)).toBe(true);
		expect(canDo(owner, 'settings')).toBe(true);
	});
});
