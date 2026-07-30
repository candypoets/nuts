import { describe, expect, it } from 'vitest';
import type { ParsedEvent } from '@candypoets/nipworker';

import {
	buildBadgeStatusTemplate,
	deriveOrderRecords,
	fulfilledUseCount,
	nextStatusCreatedAt,
	remainingAwardUses
} from './orders';

function event(input: {
	id: string;
	kind: number;
	pubkey: string;
	createdAt: number;
	tags: string[][];
}): ParsedEvent {
	return {
		id: () => input.id,
		kind: () => input.kind,
		pubkey: () => input.pubkey,
		createdAt: () => input.createdAt,
		tagsLength: () => input.tags.length,
		tags: (tagIndex: number) => {
			const tag = input.tags[tagIndex];
			return tag
				? {
						itemsLength: () => tag.length,
						items: (itemIndex: number) => tag[itemIndex]
					}
				: null;
		}
	} as unknown as ParsedEvent;
}

const issuer = 'a'.repeat(64);
const holder = 'b'.repeat(64);

function definition(d: string, type: string, extraTags: string[][] = []) {
	const address = `30009:${issuer}:${d}`;
	return {
		address,
		event: event({
			id: `def-${d}`,
			kind: 30009,
			pubkey: issuer,
			createdAt: 1,
			tags: [['d', d], ['type', type], ['t', type], ...extraTags]
		})
	};
}

function award(id: string, address: string, extraTags: string[][] = [], createdAt = 10) {
	return event({
		id,
		kind: 8,
		pubkey: issuer,
		createdAt,
		tags: [['a', address], ['p', holder], ...extraTags]
	});
}

function status(
	id: string,
	awardId: string,
	address: string,
	statusValue: string,
	contextTag: string[],
	createdAt: number
) {
	return event({
		id,
		kind: 37237,
		pubkey: issuer,
		createdAt,
		tags: [
			['status', statusValue],
			['a', address],
			['e', awardId],
			['p', holder],
			contextTag,
			['d', `${contextTag[0]}:${contextTag[1]}`]
		]
	});
}

describe('deriveOrderRecords', () => {
	it('creates an implicit pending order for a single-use award without statuses', () => {
		const def = definition('coffee', 'product');
		const definitions = new Map([[def.address, def.event]]);
		const purchase = award('award-1', def.address, [['i', 'payment-redemption:cs_123']]);

		const records = deriveOrderRecords([purchase], [], definitions);

		expect(records).toHaveLength(1);
		expect(records[0].status).toBe('pending');
		expect(records[0].orderRef).toBe('cs_123');
		expect(records[0].contextTag).toEqual(['order', 'cs_123']);
		expect(records[0].holder).toBe(holder);
	});

	it('uses the event coordinate as pending context for event tickets', () => {
		const def = definition('gig-ticket', 'event_access', [
			['a', '31923:' + issuer + ':gig'],
			['max_uses', '1']
		]);
		const definitions = new Map([[def.address, def.event]]);
		const ticket = award('award-2', def.address);

		const [record] = deriveOrderRecords([ticket], [], definitions);

		expect(record.status).toBe('pending');
		expect(record.contextTag).toEqual(['event', `31923:${issuer}:gig`]);
	});

	it('reflects the latest status of the order context', () => {
		const def = definition('coffee', 'product');
		const definitions = new Map([[def.address, def.event]]);
		const purchase = award('award-1', def.address, [['order', 'order-1']]);
		const statuses = [
			status('s1', 'award-1', def.address, 'accepted', ['order', 'order-1'], 20),
			status('s2', 'award-1', def.address, 'ready', ['order', 'order-1'], 21)
		];

		const [record] = deriveOrderRecords([purchase], statuses, definitions);

		expect(record.status).toBe('ready');
		expect(record.updatedAt).toBe(21);
		expect(record.contextTag).toEqual(['order', 'order-1']);
	});

	it('creates one record per fulfillment context for reusable passes', () => {
		const def = definition('gym-pass', 'pass', [['max_uses', '5']]);
		const definitions = new Map([[def.address, def.event]]);
		const pass = award('award-3', def.address);
		const statuses = [
			status('s1', 'award-3', def.address, 'fulfilled', ['order', 'checkin-1'], 20),
			status('s2', 'award-3', def.address, 'fulfilled', ['order', 'checkin-2'], 21)
		];

		const records = deriveOrderRecords([pass], statuses, definitions);

		expect(records).toHaveLength(2);
		expect(records.every((record) => record.status === 'fulfilled')).toBe(true);
		// No statuses yet: nothing to track for a reusable pass.
		expect(deriveOrderRecords([pass], [], definitions)).toHaveLength(0);
	});

	it('rejects statuses whose d tag does not match the fulfillment context', () => {
		const def = definition('gym-pass', 'pass', [['max_uses', '5']]);
		const definitions = new Map([[def.address, def.event]]);
		const pass = award('award-3', def.address);
		const s1 = status('s1', 'award-3', def.address, 'fulfilled', ['order', 'checkin-1'], 20);
		// Same `d` as s1 but a conflicting order tag: the event is invalid and
		// cannot supersede the fulfilled checkin-1 status.
		const s2 = event({
			id: 's2',
			kind: 37237,
			pubkey: issuer,
			createdAt: 21,
			tags: [
				['status', 'cancelled'],
				['a', def.address],
				['e', 'award-3'],
				['p', holder],
				['order', 'checkin-2'],
				['d', 'order:checkin-1']
			]
		});

		expect(fulfilledUseCount(pass, [s1, s2])).toBe(1);
	});

	it('skips awards whose definition is not part of the community catalog', () => {
		const orphan = award('award-9', `30009:${issuer}:unknown`);
		expect(deriveOrderRecords([orphan], [], new Map())).toHaveLength(0);
	});
});

describe('use accounting', () => {
	it('counts fulfilled contexts and derives remaining uses', () => {
		const def = definition('gym-pass', 'pass', [['max_uses', '3']]);
		const pass = award('award-3', def.address);
		const statuses = [
			status('s1', 'award-3', def.address, 'fulfilled', ['order', 'checkin-1'], 20),
			// Superseded update on the same context does not count twice.
			status('s2', 'award-3', def.address, 'cancelled', ['order', 'checkin-1'], 21),
			status('s3', 'award-3', def.address, 'fulfilled', ['order', 'checkin-2'], 22)
		];

		expect(fulfilledUseCount(pass, statuses)).toBe(1);
		expect(remainingAwardUses(pass, def.event, statuses)).toBe(2);
	});

	it('treats definitions without max_uses as unlimited', () => {
		const def = definition('membership', 'membership');
		const member = award('award-4', def.address);
		expect(remainingAwardUses(member, def.event, [])).toBeUndefined();
	});
});

describe('buildBadgeStatusTemplate', () => {
	it('builds a kind 37237 template with status, award, context and d tags', () => {
		const template = buildBadgeStatusTemplate(
			'ready',
			{
				awardId: 'award-1',
				badgeAddress: `30009:${issuer}:coffee`,
				holder,
				contextTag: ['order', 'order-1']
			},
			42
		);

		expect(template.kind).toBe(37237);
		expect(template.created_at).toBe(42);
		expect(template.tags).toEqual([
			['status', 'ready'],
			['a', `30009:${issuer}:coffee`],
			['e', 'award-1'],
			['p', holder],
			['order', 'order-1'],
			['d', 'order:order-1']
		]);
	});

	it('derives the d value from an event context tag', () => {
		const template = buildBadgeStatusTemplate('fulfilled', {
			awardId: 'award-2',
			badgeAddress: `30009:${issuer}:gig-ticket`,
			holder,
			contextTag: ['event', `31923:${issuer}:gig`]
		});

		expect(template.tags).toContainEqual(['d', `event:31923:${issuer}:gig`]);
	});
});

describe('nextStatusCreatedAt', () => {
	it('uses now when there is no prior status', () => {
		expect(nextStatusCreatedAt(0, 100)).toBe(100);
		expect(nextStatusCreatedAt(undefined, 100)).toBe(100);
	});

	it('keeps created_at strictly monotonic on a same-second update', () => {
		// A transition landing in the same second as the previous status must
		// still sort after it: readers tie-break equal created_at by smallest id.
		expect(nextStatusCreatedAt(100, 100)).toBe(101);
	});

	it('does not jump ahead when now is past the latest status', () => {
		expect(nextStatusCreatedAt(100, 105)).toBe(105);
	});
});
