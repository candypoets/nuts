import type { NostrEvent as RawNostrEvent } from '@candypoets/nipworker';
import { fbArray } from '@candypoets/nipworker/utils';
import { nip19 } from 'nostr-tools';

export const HIGHLIGHT_KIND = 9802 as const;

type TagVector = {
	itemsLength(): number;
	items(index: number): string;
};

/** The small FlatBuffer surface needed to inspect event tags without unpacking an event. */
export type FlatBufferTagReader = {
	tagsLength(): number;
	tags(index: number): TagVector | null;
};

export type HighlightSource =
	| {
			type: 'url';
			url: string;
			label: string;
	  }
	| {
			type: 'address';
			address: string;
			relay?: string;
			label: string;
			path?: string;
	  }
	| {
			type: 'event';
			id: string;
			relay?: string;
			label: string;
			path?: string;
	  };

export type HighlightSourceReference = {
	address?: string;
	eventId?: string;
	url?: string;
	relay?: string;
	author?: string;
};

export type HighlightEventTemplate = {
	kind: typeof HIGHLIGHT_KIND;
	content: string;
	created_at: number;
	tags: string[][];
};

export function readFlatBufferTags(event: FlatBufferTagReader): string[][] {
	return fbArray(event, 'tags').map((tag) => fbArray(tag, 'items').map((item) => item || ''));
}

export function highlightTagValue(
	tags: readonly (readonly string[])[],
	name: string
): string | undefined {
	return tags.find((tag) => tag[0] === name && Boolean(tag[1]))?.[1];
}

export function highlightTagValues(tags: readonly (readonly string[])[], name: string): string[] {
	return tags.filter((tag) => tag[0] === name && Boolean(tag[1])).map((tag) => tag[1] as string);
}

/**
 * Remove the most common tracking parameters when a URL becomes a NIP-84 source.
 * The spec asks clients to make a best effort here; unknown query parameters remain intact.
 */
export function cleanHighlightUrl(value: string): string {
	try {
		const url = new URL(value);
		const tracking = /^(utm_|fbclid$|gclid$|dclid$|mc_cid$|mc_eid$|ref$)/i;
		for (const key of Array.from(url.searchParams.keys())) {
			if (tracking.test(key)) url.searchParams.delete(key);
		}
		url.hash = '';
		return url.toString();
	} catch {
		return value.trim();
	}
}

function addressPath(address: string, relay?: string): string | undefined {
	const firstSeparator = address.indexOf(':');
	const secondSeparator = address.indexOf(':', firstSeparator + 1);
	if (firstSeparator < 1 || secondSeparator < 0) return undefined;

	const kind = Number(address.slice(0, firstSeparator));
	const pubkey = address.slice(firstSeparator + 1, secondSeparator);
	const identifier = address.slice(secondSeparator + 1);
	if (!Number.isInteger(kind) || !pubkey || !identifier) return undefined;

	try {
		return `naddr:${nip19.naddrEncode({
			kind,
			pubkey,
			identifier,
			relays: relay ? [relay] : []
		})}`;
	} catch {
		return undefined;
	}
}

function eventPath(id: string, relay?: string): string | undefined {
	try {
		return `nevent:${nip19.neventEncode({ id, relays: relay ? [relay] : [] })}`;
	} catch {
		return undefined;
	}
}

function urlLabel(value: string): string {
	try {
		return new URL(value).hostname.replace(/^www\./, '');
	} catch {
		return 'Web source';
	}
}

function isWebUrl(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

export function highlightSourceFromTags(
	tags: readonly (readonly string[])[]
): HighlightSource | undefined {
	const addressTag = tags.find((tag) => tag[0] === 'a' && Boolean(tag[1]));
	if (addressTag?.[1]) {
		const relay = addressTag[2] || undefined;
		return {
			type: 'address',
			address: addressTag[1],
			relay,
			label: 'Nostr article',
			path: addressPath(addressTag[1], relay)
		};
	}

	const eventTag = tags.find((tag) => tag[0] === 'e' && Boolean(tag[1]));
	if (eventTag?.[1]) {
		const relay = eventTag[2] || undefined;
		return {
			type: 'event',
			id: eventTag[1],
			relay,
			label: 'Nostr event',
			path: eventPath(eventTag[1], relay)
		};
	}

	const urlTag =
		tags.find((tag) => tag[0] === 'r' && tag[3] === 'source' && Boolean(tag[1])) ||
		tags.find((tag) => tag[0] === 'r' && Boolean(tag[1]));
	if (urlTag?.[1]) {
		const url = cleanHighlightUrl(urlTag[1]);
		if (!isWebUrl(url)) return undefined;
		return { type: 'url', url, label: urlLabel(url) };
	}

	return undefined;
}

export function highlightSourceFromEvent(event: RawNostrEvent): HighlightSource | undefined {
	return highlightSourceFromTags(readFlatBufferTags(event));
}

export function buildHighlightEvent({
	content,
	createdAt,
	source,
	context
}: {
	content: string;
	createdAt: number;
	source: HighlightSourceReference;
	context?: string;
}): HighlightEventTemplate {
	const tags: string[][] = [];
	const relay = source.relay || '';

	if (source.address) tags.push(['a', source.address, relay]);
	else if (source.eventId) tags.push(['e', source.eventId, relay]);
	else if (source.url) tags.push(['r', cleanHighlightUrl(source.url), '', 'source']);

	if (source.author) tags.push(['p', source.author, relay, 'author']);
	if (context?.trim()) tags.push(['context', context.trim()]);
	tags.push(['client', 'nutscash']);

	return {
		kind: HIGHLIGHT_KIND,
		content: content.trim(),
		created_at: createdAt,
		tags
	};
}
