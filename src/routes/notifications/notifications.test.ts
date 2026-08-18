import { describe, expect, it } from 'vitest';
import { ParsedData, type ParsedEvent } from '@candypoets/nipworker';

import {
	notificationRelayHints,
	notificationTargetId,
	processBadgeNotifications,
	processNotifications,
	type ProcessedNotification
} from './notifications';

function event(input: {
	id: string;
	kind: number;
	pubkey: string;
	createdAt: number;
	tags: string[][];
	relays?: string[];
}): ParsedEvent {
	return {
		id: () => input.id,
		kind: () => input.kind,
		pubkey: () => input.pubkey,
		createdAt: () => input.createdAt,
		relaysLength: () => input.relays?.length || 0,
		relays: (relayIndex: number) => input.relays?.[relayIndex] || '',
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

function socialNotification(input: {
	type: ProcessedNotification['type'];
	referencedPostId: string;
	events: ParsedEvent[];
	requestRelays?: string[];
}): ProcessedNotification {
	return {
		id: () => ({ fnv1aHash: () => `${input.type}-${input.referencedPostId}` }),
		type: input.type,
		parsedType: () => 100,
		kind: () => 383838,
		createdAt: () => 1,
		tags: [],
		content: '',
		timestamp: 1,
		parsed: {
			type: input.type,
			referencedPostId: input.referencedPostId,
			timestamp: 1,
			events: input.events,
			context: [],
			requests: input.requestRelays ? [{ relays: input.requestRelays }] : []
		}
	} as ProcessedNotification;
}

const relay = 'wss://cafe.example/';
const issuer = 'a'.repeat(64);
const holder = 'b'.repeat(64);
const address = `30009:${issuer}:coffee`;

describe('social notification targets', () => {
	it('groups an ID-only kind-6 repost by its e-tag target', () => {
		const repost = event({
			id: 'repost-event',
			kind: 6,
			pubkey: issuer,
			createdAt: 2,
			tags: [['e', 'target-id', 'wss://origin.example']]
		});
		Object.assign(repost, {
			parsedType: () => ParsedData.Kind6Parsed,
			parsed: () => ({ repostedEvent: () => null })
		});

		const [notification] = processNotifications([repost]);

		expect(notification.type).toBe('repost');
		expect(notification.parsed.referencedPostId).toBe('target-id');
		expect(notificationRelayHints(notification)).toEqual(['wss://origin.example']);
	});

	it('opens a mention or quote at the notification event itself', () => {
		const mention = event({
			id: 'mention-event',
			kind: 1,
			pubkey: issuer,
			createdAt: 1,
			tags: []
		});
		const notification = socialNotification({
			type: 'mention',
			referencedPostId: 'mention-event',
			events: [mention]
		});

		expect(notificationTargetId(notification)).toBe('mention-event');
	});

	it('combines reference, source, request, and fallback relay hints', () => {
		const reaction = event({
			id: 'reaction',
			kind: 7,
			pubkey: issuer,
			createdAt: 1,
			tags: [['e', 'target', 'wss://hint.example']],
			relays: ['wss://source.example']
		});
		const notification = socialNotification({
			type: 'reaction',
			referencedPostId: 'target',
			events: [reaction],
			requestRelays: ['wss://request.example']
		});

		expect(
			notificationRelayHints(notification, [
				'wss://source.example',
				'wss://fallback.example',
				'https://not-a-relay.example'
			])
		).toEqual([
			'wss://hint.example',
			'wss://source.example',
			'wss://request.example',
			'wss://fallback.example'
		]);
	});
});

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
