import { describe, expect, it } from 'vitest';
import type { ParsedEvent } from '@candypoets/nipworker';

import { processBadgeNotifications } from './notifications';

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

const relay = 'wss://cafe.example/';
const issuer = 'a'.repeat(64);
const holder = 'b'.repeat(64);
const address = `30009:${issuer}:coffee`;

describe('badge notifications', () => {
	it('creates an acquisition notification from an award before its definition is loaded', () => {
		const award = event({
			id: 'award',
			kind: 8,
			pubkey: issuer,
			createdAt: 10,
			tags: [
				['a', address],
				['p', holder]
			]
		});
		const notifications = processBadgeNotifications([award], [], [relay]);

		expect(notifications).toHaveLength(1);
		expect(notifications[0].createdAt()).toBe(10);
		expect(notifications[0].parsed.award).toBe(award);
		expect(notifications[0].parsed.relays).toEqual([relay]);
	});

	it('keeps only the latest status for each award context and promotes its timestamp', () => {
		const award = event({
			id: 'award',
			kind: 8,
			pubkey: issuer,
			createdAt: 10,
			tags: [
				['a', address],
				['p', holder]
			]
		});
		const pending = event({
			id: 'status-a',
			kind: 37237,
			pubkey: issuer,
			createdAt: 20,
			tags: [
				['status', 'pending'],
				['a', address],
				['e', 'award'],
				['p', holder],
				['order', 'order-1'],
				['d', 'order:order-1']
			]
		});
		const ready = event({
			id: 'status-b',
			kind: 37237,
			pubkey: issuer,
			createdAt: 21,
			tags: [
				['status', 'ready'],
				['a', address],
				['e', 'award'],
				['p', holder],
				['order', 'order-1'],
				['d', 'order:order-1']
			]
		});

		const [notification] = processBadgeNotifications([award], [pending, ready], [relay]);

		expect(notification.createdAt()).toBe(21);
		expect(notification.parsed.statuses).toEqual([ready]);
	});

	it('uses the lowest event ID to break equal status timestamps', () => {
		const award = event({
			id: 'award',
			kind: 8,
			pubkey: issuer,
			createdAt: 10,
			tags: [
				['a', address],
				['p', holder]
			]
		});
		const higherId = event({
			id: 'status-z',
			kind: 37237,
			pubkey: issuer,
			createdAt: 20,
			tags: [
				['status', 'pending'],
				['a', address],
				['e', 'award'],
				['p', holder],
				['order', 'order-1'],
				['d', 'order:order-1']
			]
		});
		const lowerId = event({
			id: 'status-a',
			kind: 37237,
			pubkey: issuer,
			createdAt: 20,
			tags: [
				['status', 'accepted'],
				['a', address],
				['e', 'award'],
				['p', holder],
				['order', 'order-1'],
				['d', 'order:order-1']
			]
		});

		const [notification] = processBadgeNotifications([award], [higherId, lowerId], [relay]);

		expect(notification.parsed.statuses).toEqual([lowerId]);
	});

	it('does not duplicate an award observed on multiple relays', () => {
		const award = event({
			id: 'award',
			kind: 8,
			pubkey: issuer,
			createdAt: 10,
			tags: [
				['a', address],
				['p', holder]
			]
		});
		const notifications = processBadgeNotifications([award, award], [], [relay]);

		expect(notifications).toHaveLength(1);
	});

	it('ignores statuses without one stable context', () => {
		const award = event({
			id: 'award',
			kind: 8,
			pubkey: issuer,
			createdAt: 10,
			tags: [
				['a', address],
				['p', holder]
			]
		});
		const invalidStatus = event({
			id: 'status',
			kind: 37237,
			pubkey: issuer,
			createdAt: 20,
			tags: [
				['status', 'ready'],
				['a', address],
				['e', 'award'],
				['p', holder]
			]
		});

		const [notification] = processBadgeNotifications([award], [invalidStatus], [relay]);
		expect(notification.createdAt()).toBe(10);
		expect(notification.parsed.statuses).toEqual([]);
	});

});
