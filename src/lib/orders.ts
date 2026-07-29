import { extractTagValue, type ParsedEvent } from '@candypoets/nipworker';
import type { EventTemplate } from 'nostr-tools';
import { catalogEventAddress, catalogMaxUses, catalogType } from 'src/lib/catalog';
import type { CommunityType } from 'src/lib/communityTypes';
import {
	isBadgeStatus,
	latestStatusEvents,
	type BadgeStatus
} from 'src/routes/notifications/notifications';

export const BADGE_STATUS_KIND = 27237;

/**
 * One trackable order line on the admin orders dashboard: a kind 8 award paired
 * with the fulfillment context (an `order` id or an `event` coordinate) it is
 * being fulfilled against. `status` is the latest valid kind 27237 status for
 * that context, or an implicit `pending` when the purchase has no status yet.
 * Award and definition stay FlatBuffer views; only display strings are copied.
 */
export type OrderRecord = {
	key: string;
	awardId: string;
	badgeAddress: string;
	holder: string;
	definition: ParsedEvent;
	/** Exactly one of ['order', id] / ['event', address] - reused when publishing updates. */
	contextTag: string[];
	/** Human-facing reference (payment/redemption id or award id). */
	orderRef: string;
	status: BadgeStatus;
	updatedAt: number;
	awardCreatedAt: number;
};

export function awardOrderReference(award: ParsedEvent, statuses: ParsedEvent[] = []) {
	const fromStatus = statuses.map((event) => extractTagValue(event, 'order')).find(Boolean);
	const fromAward = extractTagValue(award, 'order');
	const invoice = extractTagValue(award, 'i');
	return (
		fromStatus || fromAward || invoice?.replace(/^payment-redemption:/, '') || award.id() || ''
	);
}

function recordFromStatus(
	award: ParsedEvent,
	definition: ParsedEvent,
	statusEvent: ParsedEvent
): OrderRecord | undefined {
	const order = extractTagValue(statusEvent, 'order');
	const eventContext = extractTagValue(statusEvent, 'event');
	if (Boolean(order) === Boolean(eventContext)) return undefined;
	const status = extractTagValue(statusEvent, 'status');
	if (!isBadgeStatus(status)) return undefined;
	const awardId = award.id() || '';
	return {
		key: `${awardId}:${order ? `order:${order}` : `event:${eventContext}`}`,
		awardId,
		badgeAddress: extractTagValue(award, 'a') || '',
		holder: extractTagValue(award, 'p') || '',
		definition,
		contextTag: order ? ['order', order] : ['event', eventContext as string],
		orderRef: awardOrderReference(award, [statusEvent]),
		status,
		updatedAt: statusEvent.createdAt(),
		awardCreatedAt: award.createdAt()
	};
}

/**
 * Projects the community relay's kind 8 awards + kind 27237 statuses into order
 * lines. Single-use entitlements (products, event tickets) yield exactly one
 * line per award - implicitly `pending` until a status exists. Reusable
 * entitlements (passes, memberships) yield one line per active fulfillment
 * context; the awards themselves are surfaced separately as "active passes".
 */
export function deriveOrderRecords(
	awards: ParsedEvent[],
	statuses: ParsedEvent[],
	definitions: ReadonlyMap<string, ParsedEvent>
): OrderRecord[] {
	const records: OrderRecord[] = [];
	const seenAwardIds = new Set<string>();
	for (const award of awards) {
		if (award.kind() !== 8) continue;
		const awardId = award.id();
		const badgeAddress = extractTagValue(award, 'a');
		const holder = extractTagValue(award, 'p');
		if (!awardId || !badgeAddress || !holder || seenAwardIds.has(awardId)) continue;
		const definition = definitions.get(badgeAddress);
		if (!definition) continue;
		seenAwardIds.add(awardId);

		const latest = latestStatusEvents(award, statuses);
		const type = catalogType(definition);
		const maxUses = catalogMaxUses(definition);
		const singleUse = type === 'product' || type === 'event_access' || maxUses === 1;

		if (!singleUse) {
			for (const statusEvent of latest) {
				const record = recordFromStatus(award, definition, statusEvent);
				if (record) records.push(record);
			}
			continue;
		}

		const latestStatus = latest[0];
		if (latestStatus) {
			const record = recordFromStatus(award, definition, latestStatus);
			if (record) records.push(record);
			continue;
		}

		const eventContext = type === 'event_access' ? catalogEventAddress(definition) : '';
		const orderRef = awardOrderReference(award);
		records.push({
			key: `${awardId}:pending`,
			awardId,
			badgeAddress,
			holder,
			definition,
			contextTag: eventContext ? ['event', eventContext] : ['order', orderRef || awardId],
			orderRef: orderRef || awardId,
			status: 'pending',
			updatedAt: award.createdAt(),
			awardCreatedAt: award.createdAt()
		});
	}
	return records.sort((left, right) => right.updatedAt - left.updatedAt);
}

/** Fulfilled uses of one award: one per fulfillment context whose latest status is `fulfilled`. */
export function fulfilledUseCount(award: ParsedEvent, statuses: ParsedEvent[]) {
	return latestStatusEvents(award, statuses).filter(
		(event) => extractTagValue(event, 'status') === 'fulfilled'
	).length;
}

/** Remaining uses; `undefined` means the definition is unlimited. */
export function remainingAwardUses(
	award: ParsedEvent,
	definition: ParsedEvent,
	statuses: ParsedEvent[]
) {
	const maxUses = catalogMaxUses(definition);
	if (!maxUses) return undefined;
	return Math.max(0, maxUses - fulfilledUseCount(award, statuses));
}

export function isAwardExpired(award: ParsedEvent, now = Math.floor(Date.now() / 1000)) {
	const expiration = Number(extractTagValue(award, 'expiration') || 0);
	return Boolean(expiration && expiration <= now);
}

/** Pure template builder - the owning component publishes via usePublish. */
export function buildBadgeStatusTemplate(
	status: BadgeStatus,
	target: { awardId: string; badgeAddress: string; holder: string; contextTag: string[] },
	createdAt = Math.floor(Date.now() / 1000)
): EventTemplate {
	return {
		kind: BADGE_STATUS_KIND,
		created_at: createdAt,
		content: '',
		tags: [
			['status', status],
			['a', target.badgeAddress],
			['e', target.awardId],
			['p', target.holder],
			target.contextTag
		]
	};
}

/** A manual pass/membership check-in gets a fresh single-use order context. */
export function checkInContextTag(awardId: string, now = Math.floor(Date.now() / 1000)) {
	return ['order', `checkin-${awardId}-${now}`];
}

export type OrdersView = 'queue' | 'checkins';

export function ordersViewFor(type: CommunityType | undefined): OrdersView {
	return type === 'sports' ? 'checkins' : 'queue';
}

/** Status ladder shown as queue columns; hospitality keeps the full kitchen flow. */
export function statusFlowFor(type: CommunityType | undefined): BadgeStatus[] {
	return type === 'hospitality'
		? ['pending', 'accepted', 'processing', 'ready', 'fulfilled']
		: ['pending', 'processing', 'ready', 'fulfilled'];
}

export function nextFlowStatus(flow: BadgeStatus[], current: BadgeStatus) {
	const index = flow.indexOf(current);
	return index >= 0 && index < flow.length - 1 ? flow[index + 1] : undefined;
}

export function statusColumnLabel(status: BadgeStatus, type: CommunityType | undefined) {
	switch (status) {
		case 'pending':
			return 'New';
		case 'accepted':
			return 'Accepted';
		case 'processing':
			return 'Preparing';
		case 'ready':
			return type === 'hospitality' ? 'Ready to serve' : 'Ready for pickup';
		case 'fulfilled':
			if (type === 'hospitality') return 'Served';
			if (type === 'sports') return 'Checked in';
			return 'Collected';
		case 'cancelled':
			return 'Cancelled';
	}
}

export function advanceActionLabel(next: BadgeStatus, type: CommunityType | undefined) {
	switch (next) {
		case 'accepted':
			return 'Accept';
		case 'processing':
			return 'Start preparing';
		case 'ready':
			return 'Mark ready';
		case 'fulfilled':
			if (type === 'hospitality') return 'Mark served';
			if (type === 'sports') return 'Check in';
			return 'Mark collected';
		default:
			return 'Update';
	}
}

export function ordersTitleFor(type: CommunityType | undefined) {
	if (type === 'hospitality') return 'Orders & kitchen';
	if (type === 'sports') return 'Check-ins & passes';
	return 'Orders';
}
