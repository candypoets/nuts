import { describe, expect, it } from 'vitest';

import { resolveCommunityAccessFromEvents, type CommunityAccessEvent } from './adminAccess';

const issuer = '21317a0b4045a4ce330c9463ccbd6c63b5df5a67718e05adc1270853b2e47f0e';
const recipient = '9ea5e56c87320c5c076ea588a0559b1b21dcaef549c83992a65e3c0f7a4d61a7';

function definition(
	type: string | undefined,
	options: { id?: string; createdAt?: number; d?: string; permissions?: string[] } = {}
): CommunityAccessEvent {
	const d = options.d ?? 'staff';
	return {
		id: options.id ?? `${type ?? 'untyped'}-definition`,
		pubkey: issuer,
		created_at: options.createdAt ?? 10,
		tags: [
			['d', d],
			...(type
				? [
						['type', type],
						['t', type]
					]
				: []),
			['name', 'Staff'],
			...(options.permissions ?? ['settings']).map((permission) => ['permission', permission])
		]
	};
}

function award(d = 'staff'): CommunityAccessEvent {
	return {
		id: 'award-id',
		pubkey: issuer,
		created_at: 12,
		tags: [
			['a', `30009:${issuer}:${d}`],
			['p', recipient]
		]
	};
}

describe('resolveCommunityAccessFromEvents', () => {
	it('grants permissions from an awarded explicit role', () => {
		const access = resolveCommunityAccessFromEvents(
			[definition('role', { permissions: ['store', 'events'] })],
			[award()],
			recipient,
			new Set([issuer]),
			100
		);

		expect(access.roles).toEqual(['Staff']);
		expect([...access.permissions]).toEqual(['store', 'events']);
	});

	it.each(['membership', 'event_access', 'product', 'pass', undefined])(
		'does not grant permissions from %s definitions',
		(type) => {
			const access = resolveCommunityAccessFromEvents(
				[definition(type)],
				[award()],
				recipient,
				new Set([issuer]),
				100
			);

			expect(access.roles).toEqual([]);
			expect(access.permissions.size).toBe(0);
		}
	);

	it('uses the newest addressable definition before resolving its type', () => {
		const access = resolveCommunityAccessFromEvents(
			[
				definition('role', { id: 'old', createdAt: 10 }),
				definition('product', { id: 'new', createdAt: 11 })
			],
			[award()],
			recipient,
			new Set([issuer]),
			100
		);

		expect(access.roles).toEqual([]);
		expect(access.permissions.size).toBe(0);
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
			pubkey: 'another-issuer'
		};

		for (const candidate of [otherRecipient, expired, mismatched]) {
			const access = resolveCommunityAccessFromEvents(
				[definition('role')],
				[candidate],
				recipient,
				new Set([issuer]),
				100
			);
			expect(access.permissions.size).toBe(0);
		}
	});

	it('rejects a self-authored role chain from an untrusted issuer', () => {
		const attacker = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
		const attackerDefinition = {
			...definition('role'),
			pubkey: attacker
		};
		const attackerAward = {
			...award(),
			pubkey: attacker,
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

		expect(access.permissions.size).toBe(0);
	});
});
