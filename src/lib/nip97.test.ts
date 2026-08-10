import type { ParsedEvent } from '@candypoets/nipworker';
import { describe, expect, it } from 'vitest';

import {
	ANCHOR_KIND,
	buildCommunityAnchorTags,
	buildPermissionTag,
	isNamedCapability,
	isNewerAnchor,
	parseCommunityAnchor,
	parsePermissionTag,
	permissionGrants,
	permissionKind,
	type CommunityAnchor
} from './nip97';

const root = '21317a0b4045a4ce330c9463ccbd6c63b5df5a67718e05adc1270853b2e47f0e';
const admin = '9ea5e56c87320c5c076ea588a0559b1b21dcaef549c83992a65e3c0f7a4d61a7';
const issuer = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function stubEvent(kind: number, tags: string[][], id = 'event-id', createdAt = 100): ParsedEvent {
	return {
		kind: () => kind,
		id: () => id,
		pubkey: () => root,
		createdAt: () => createdAt,
		tagsLength: () => tags.length,
		tags: (index: number) => ({
			itemsLength: () => tags[index].length,
			items: (item: number) => tags[index][item]
		})
	} as unknown as ParsedEvent;
}

describe('community anchor', () => {
	it('round-trips build and parse', () => {
		const tags = buildCommunityAnchorTags({
			admins: [admin],
			badgeIssuer: issuer,
			name: 'The Gym',
			description: 'Local gym',
			image: 'https://example.com/gym.png'
		});

		expect(tags).toContainEqual(['d', 'community']);
		expect(tags).toContainEqual(['p', admin]);
		expect(tags).toContainEqual(['badge_issuer', issuer]);

		expect(parseCommunityAnchor(stubEvent(ANCHOR_KIND, tags))).toMatchObject({
			pubkey: root,
			admins: [admin],
			badgeIssuer: issuer,
			name: 'The Gym',
			description: 'Local gym',
			image: 'https://example.com/gym.png',
			createdAt: 100
		});
	});

	it('requires the community d tag and at least one admin', () => {
		expect(parseCommunityAnchor(stubEvent(ANCHOR_KIND, [['d', 'other'], ['p', admin]]))).toBeUndefined();
		expect(parseCommunityAnchor(stubEvent(ANCHOR_KIND, [['d', 'community']]))).toBeUndefined();
		expect(parseCommunityAnchor(stubEvent(30009, [['d', 'community'], ['p', admin]]))).toBeUndefined();
		expect(() => buildCommunityAnchorTags({ admins: [] })).toThrow();
	});

	it('ignores a malformed badge_issuer', () => {
		const anchor = parseCommunityAnchor(
			stubEvent(ANCHOR_KIND, [['d', 'community'], ['p', admin], ['badge_issuer', 'nope']])
		);
		expect(anchor?.badgeIssuer).toBeUndefined();
	});

	it('orders replacements by created_at then lowest id', () => {
		const base: CommunityAnchor = {
			id: 'b',
			pubkey: root,
			admins: [admin],
			name: '',
			description: '',
			createdAt: 100
		};
		expect(isNewerAnchor({ ...base, id: 'c', createdAt: 101 }, base)).toBe(true);
		expect(isNewerAnchor({ ...base, id: 'a' }, base)).toBe(true);
		expect(isNewerAnchor({ ...base, id: 'c' }, base)).toBe(false);
		expect(isNewerAnchor({ ...base, createdAt: 99 }, base)).toBe(false);
	});
});

describe('permission tags', () => {
	it('round-trips a kind-scoped write permission', () => {
		const tag = buildPermissionTag({ capability: '31923', access: 'write' });
		expect(tag).toEqual(['permission', '31923', 'write']);
		expect(parsePermissionTag(tag)).toEqual({ capability: '31923', access: 'write', topic: undefined });
	});

	it('pads the access slot when only a topic filter is set', () => {
		const tag = buildPermissionTag({ capability: '30009', topic: 'membership' });
		expect(tag).toEqual(['permission', '30009', '', 'membership']);
		expect(parsePermissionTag(tag)).toEqual({
			capability: '30009',
			access: undefined,
			topic: 'membership'
		});
	});

	it('round-trips a named capability', () => {
		const tag = buildPermissionTag({ capability: 'invites' });
		expect(tag).toEqual(['permission', 'invites']);
		expect(parsePermissionTag(tag)).toEqual({
			capability: 'invites',
			access: undefined,
			topic: undefined
		});
	});

	it('rejects non-permission tags and unknown access markers', () => {
		expect(parsePermissionTag(['t', 'role'])).toBeUndefined();
		expect(parsePermissionTag(['permission'])).toBeUndefined();
		expect(parsePermissionTag(['permission', '1', 'admin'])).toEqual({
			capability: '1',
			access: undefined,
			topic: undefined
		});
	});

	it('classifies kinds and named capabilities', () => {
		expect(permissionKind({ capability: '30402' })).toBe(30402);
		expect(permissionKind({ capability: 'invites' })).toBeUndefined();
		expect(permissionKind({ capability: '99999' })).toBeUndefined();
		expect(isNamedCapability({ capability: 'moderation' })).toBe(true);
		expect(isNamedCapability({ capability: '1' })).toBe(false);
	});
});

describe('permissionGrants', () => {
	it('grants both read and write when the access marker is absent', () => {
		const permission = { capability: '1' };
		expect(permissionGrants(permission, 1, 'read')).toBe(true);
		expect(permissionGrants(permission, 1, 'write')).toBe(true);
	});

	it('enforces the access marker', () => {
		const permission = { capability: '1', access: 'read' as const };
		expect(permissionGrants(permission, 1, 'read')).toBe(true);
		expect(permissionGrants(permission, 1, 'write')).toBe(false);
	});

	it('matches the t-filter only when set', () => {
		const filtered = { capability: '30009', access: 'write' as const, topic: 'membership' };
		expect(permissionGrants(filtered, 30009, 'write', 'membership')).toBe(true);
		expect(permissionGrants(filtered, 30009, 'write', 'role')).toBe(false);
		expect(permissionGrants(filtered, 30009, 'write')).toBe(false);

		const unfiltered = { capability: '30009', access: 'write' as const };
		expect(permissionGrants(unfiltered, 30009, 'write', 'role')).toBe(true);
	});

	it('never grants kinds to named capabilities', () => {
		expect(permissionGrants({ capability: 'invites' }, 1, 'write')).toBe(false);
		expect(permissionGrants({ capability: 'settings' }, 30009, 'write', 'membership')).toBe(false);
	});

	it('requires the kind to match', () => {
		expect(permissionGrants({ capability: '1', access: 'write' }, 31923, 'write')).toBe(false);
	});
});
