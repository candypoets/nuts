export const KIND_ICONS: Record<FeedKind, string> = {
	1: 'mdi:text-box-outline',
	6: 'mdi:repeat',
	20: 'mdi:image-multiple',
	34235: 'mdi:video',
	6969: 'mdi:poll'
};import {
	ListParsed,
	ListParsedT,
	ParsedData,
	ParsedEvent,
	ParsedEventT,
	type Kind3Parsed
} from '@candypoets/nipworker';
import { Builder, ByteBuffer } from 'flatbuffers';
import { get } from 'svelte/store';

import { asKind3, asNip51, fbArray } from '@candypoets/nipworker/utils';
import { now } from 'src/lib/period';
import { persistentWritable } from 'src/lib/persistentWritable';
import { derived } from 'svelte/store';
import { kind3 } from './nostr';

export type FeedKind = 1 | 6 | 20 | 34235 | 6969;

export const ALL_FEED_KINDS: FeedKind[] = [1, 6, 20, 34235, 6969];

export const KIND_LABELS: Record<FeedKind, string> = {
	1: 'Posts',
	6: 'Reposts',
	20: 'Media',
	34235: 'Videos',
	6969: 'Polls'
};

export const KIND_DESCRIPTIONS: Record<FeedKind, string> = {
	1: 'Text notes, thoughts, updates - the classic Nostr post',
	6: 'Shared posts from others with commentary',
	20: 'Images and media uploads (NIP-68). Photos, memes, artwork',
	34235: 'Video content (NIP-71). Long-form and short clips',
	6969: 'Interactive polls and surveys (NIP-69). Vote and see results'
};

export const feedKinds = persistentWritable<FeedKind[]>(
	'feedkinds',
	[], // Default: empty means all kinds
	(storage: unknown) => {
		// storage is already parsed by persistentWritable (it's the result of JSON.parse)
		// Validate that all items are valid FeedKind values
		if (Array.isArray(storage) && storage.every((k) => ALL_FEED_KINDS.includes(k))) {
			return storage as FeedKind[];
		}
		return [];
	},
	(kinds) => JSON.stringify(kinds)
);

// Shape we persist to localStorage for kind 39089
type SerializedParsedEvent39089 = {
	kind: number;
	createdAt: number;
	parsedType: number;
	id: string;
	d?: string;
	title?: string;
	description?: string;
	image?: string;
	people?: string[];
};

// Serialize a ParsedEvent by extracting fields into a plain object (JSON)
export function serializeParsedEvent(ev: ParsedEvent): string {
	const kind39089 = asNip51(ev);

	const kind = ev.kind();
	const createdAt = ev.createdAt();
	const parsedType = ev.parsedType();
	const id = ev.id() ?? '';

	const payload: SerializedParsedEvent39089 = {
		kind,
		createdAt,
		parsedType,
		id,
		title: kind39089?.title() ?? undefined,
		description: kind39089?.description() ?? undefined,
		image: kind39089?.image() ?? undefined,
		people: fbArray(kind39089 as ListParsed, 'people')?.map((p) => String(p)) ?? []
	};

	return JSON.stringify(payload);
}

// Deserialize from JSON back to a ParsedEvent by rebuilding a ParsedEventT and packing
export function deserializeParsedEvent(json: string): ParsedEvent {
	const o = JSON.parse(json) as SerializedParsedEvent39089;

	const encoder = new TextEncoder();

	// Only handling kind 39089 here. Extend if you add other kinds.
	if (o.kind === 39089 || o.parsedType === 11) {
		const listIdentifierU8 = encoder.encode(o.d ?? '');
		const titleU8 = encoder.encode(o.title ?? '');
		const imageU8 = encoder.encode(o.image ?? '');
		const descriptionU8 = encoder.encode(o.description ?? '');
		const dU8 = encoder.encode(o.d ?? '');

		const k39089 = new ListParsedT(39089, dU8, titleU8, descriptionU8, imageU8, [], o.people ?? []);

		const t = new ParsedEventT(
			encoder.encode(o.id ?? ''),
			encoder.encode(''), // second arg in your code was empty; keep it that way
			o.kind ?? 39089,
			o.createdAt ?? 0,
			o.parsedType ?? 11,
			k39089
		);

		const builder = new Builder(1024);
		const offset = t.pack(builder);
		builder.finish(offset);
		const bb = new ByteBuffer(builder.asUint8Array());
		return ParsedEvent.getRootAsParsedEvent(bb);
	}

	// If you later support more kinds, add more branches above; otherwise, throw here.
	throw new Error(`deserializeParsedEvent: unsupported kind=${o.kind} parsedType=${o.parsedType}`);
}

export function toParsedEvent(t: ParsedEventT): ParsedEvent {
	const builder = new Builder(3096);
	const offset = t.pack(builder);
	builder.finish(offset);
	const bb = new ByteBuffer(builder.asUint8Array());

	const parsedEvent = ParsedEvent.getRootAsParsedEvent(bb);
	return parsedEvent;
}

export const followList = derived(kind3, ($kind3) => {
	let peoples: string[] = [];
	if ($kind3) {
		const k3 = asKind3($kind3) as Kind3Parsed;
		peoples = fbArray(k3, 'contacts').map((c) => c.pubkey() as string);
	}

	console.log('kind3 peoples', peoples);

	const encoder = new TextEncoder();

	const parsedEvent = new ParsedEventT(
		encoder.encode('followlist'),
		encoder.encode(''),
		39089,
		now(),
		ParsedData.ListParsed, // NIP-51 ListParsed type
		new ListParsedT(
			39089,
			encoder.encode('followlist'),
			encoder.encode('Follow List'),
			encoder.encode('People you follow'),
			encoder.encode('/followlist.png'),
			[],
			peoples
		)
	);

	return toParsedEvent(parsedEvent);
});

export const followPacks = persistentWritable<ParsedEvent[]>(
	'followpacks',
	[get(followList)],
	(bbs: string[]) => {
		console.log('[feed] Restoring followpacks from localStorage:', bbs);
		const currentFollowList = get(followList);
		const currentFollowListPeople = fbArray(asNip51(currentFollowList) as ListParsed, 'people');
		const restored = bbs
			.map((bb, i) => {
				try {
					return deserializeParsedEvent(bb);
				} catch (e) {
					console.error('[feed] Failed to deserialize followpack at index', i, e);
					return null;
				}
			})
			.filter((pe): pe is ParsedEvent => pe !== null)
			.map((pe) => {
				// Only replace followlist if the current kind3 has actual contacts
				// Otherwise keep the restored one (which may have saved people from previous session)
				if (pe.id() === 'followlist' && currentFollowListPeople.length > 0) {
					return currentFollowList;
				}
				return pe;
			});
		console.log('[feed] Restored followpacks:', restored.length);
		return restored;
	},
	(pe) => {
		return JSON.stringify(pe.map(serializeParsedEvent));
	}
);
