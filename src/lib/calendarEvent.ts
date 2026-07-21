import type { ParsedEvent } from '@candypoets/nipworker';
import { asPreGeneric, fbArray } from '@candypoets/nipworker/utils';

export const CALENDAR_EVENT_KINDS = [31922, 31923];
export const RSVP_KIND = 31925;

export type CalendarEventCard = {
	id: string;
	address: string;
	attendeeCount: number;
	capacity: number;
	image?: string;
	location: string;
	relays: string[];
	start: number;
	title: string;
	description: string;
	entrancePrice?: string;
	entranceCurrency?: string;
	entranceBadgeAddress?: string;
	entranceSats?: number;
};

export function stringValue(value: string | Uint8Array | null | undefined) {
	if (!value) return '';
	if (typeof value === 'string') return value;
	return Array.from(value, (byte) => String.fromCharCode(byte)).join('');
}

export function eventTags(event: ParsedEvent) {
	const tags: string[][] = [];
	if (typeof event.tagsLength !== 'function') return tags;

	for (let tagIndex = 0; tagIndex < event.tagsLength(); tagIndex += 1) {
		const tag = event.tags(tagIndex);
		if (!tag || typeof tag.itemsLength !== 'function') continue;

		const items: string[] = [];
		for (let itemIndex = 0; itemIndex < tag.itemsLength(); itemIndex += 1) {
			items.push(tag.items(itemIndex) || '');
		}
		tags.push(items);
	}

	return tags;
}

export function tagValue(tags: string[][], name: string) {
	return tags.find((tag) => tag[0] === name)?.[1] || '';
}

export function parseCalendarEvent(
	event: ParsedEvent,
	relays: string[] = []
): CalendarEventCard | undefined {
	if (!CALENDAR_EVENT_KINDS.includes(event.kind())) return undefined;

	const id = event.id();
	const tags = eventTags(event);
	const pre = asPreGeneric(event);
	const d = stringValue(pre?.d()) || tagValue(tags, 'd');
	const startTag = tagValue(tags, 'start') || tagValue(tags, 'starts');
	const start =
		event.kind() === 31922
			? Math.floor(Date.parse(`${startTag}T00:00:00`) / 1000)
			: pre
				? Number(pre.starts())
				: Number(startTag);

	if (!id || !d || !start || start < Math.floor(Date.now() / 1000)) return undefined;

	const participants = pre ? fbArray(pre, 'participants') : [];
	const currentParticipants = Number(pre?.currentParticipants?.() ?? 0);
	const capacity = Number(tagValue(tags, 'capacity') || 0);
	const description =
		tagValue(tags, 'summary').trim() ||
		stringValue(pre?.description()).trim() ||
		stringValue(pre?.content()).trim();

	return {
		id,
		address: `${event.kind()}:${event.pubkey()}:${d}`,
		attendeeCount: currentParticipants || participants.length,
		capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 0,
		description,
		entrancePrice: tagValue(tags, 'entrance_price') || undefined,
		entranceCurrency: tags.find((tag) => tag[0] === 'entrance_price')?.[2] || undefined,
		entranceBadgeAddress: tagValue(tags, 'entrance_badge') || undefined,
		entranceSats: Number(tagValue(tags, 'entrance_sats')) || undefined,
		image: stringValue(pre?.image()) || tagValue(tags, 'image') || undefined,
		location: stringValue(pre?.location()) || tagValue(tags, 'location'),
		relays,
		start,
		title:
			stringValue(pre?.title()).trim() ||
			tagValue(tags, 'title').trim() ||
			tagValue(tags, 'name').trim() ||
			description ||
			'Community event'
	};
}
