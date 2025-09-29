import {
	Kind39089Parsed,
	Kind39089ParsedT,
	ParsedEvent,
	ParsedEventT,
	type Kind3Parsed
} from '@candypoets/nipworker';
import { Builder, ByteBuffer } from 'flatbuffers';
import { get } from 'svelte/store';

import { asKind3, asKind39089, ByteString, fbArray } from '@candypoets/nipworker/utils';
import { now } from 'src/lib/period';
import { persistentWritable } from 'src/lib/persistentWritable';
import { derived } from 'svelte/store';
import { kind3 } from './nostr';

function ensurePolyfill(bb: ByteBuffer) {
	const proto = (ByteBuffer as any).prototype;
	if (!proto.__stringByteString) {
		proto.__stringByteString = __stringByteStringPolyfill;
	}
	if (!(bb as any).__stringByteString) {
		(bb as any).__stringByteString = __stringByteStringPolyfill;
	}
}

// Shape we persist to localStorage for kind 39089
type SerializedParsedEvent39089 = {
	kind: number;
	createdAt: number;
	parsedType: number;
	id: string;
	listIdentifier?: string;
	title?: string;
	description?: string;
	image?: string;
	people?: string[];
};

// Serialize a ParsedEvent by extracting fields into a plain object (JSON)
export function serializeParsedEvent(ev: ParsedEvent): string {
	const kind39089 = asKind39089(ev);

	const kind = ev.kind();
	const createdAt = ev.createdAt();
	const parsedType = ev.parsedType();
	const id = ev.id()?.toString() ?? '';

	const payload: SerializedParsedEvent39089 = {
		kind,
		createdAt,
		parsedType,
		id,
		listIdentifier: kind39089?.listIdentifier()?.toString(),
		title: kind39089?.title()?.toString(),
		description: kind39089?.description()?.toString(),
		image: kind39089?.image()?.toString(),
		people: fbArray(kind39089 as Kind39089Parsed, 'people').map((p) => p.toString())
	};

	return JSON.stringify(payload);
}

// Deserialize from JSON back to a ParsedEvent by rebuilding a ParsedEventT and packing
export function deserializeParsedEvent(json: string): ParsedEvent {
	const o = JSON.parse(json) as SerializedParsedEvent39089;

	const encoder = new TextEncoder();

	// Only handling kind 39089 here. Extend if you add other kinds.
	if (o.kind === 39089 || o.parsedType === 11) {
		const listIdentifierU8 = encoder.encode(o.listIdentifier ?? '');
		const titleU8 = encoder.encode(o.title ?? '');
		const imageU8 = encoder.encode(o.image ?? '');
		const descriptionU8 = encoder.encode(o.description ?? '');

		const k39089 = new Kind39089ParsedT(
			listIdentifierU8,
			o.people ?? [],
			titleU8,
			descriptionU8,
			imageU8
		);

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
		ensurePolyfill(bb);
		return ParsedEvent.getRootAsParsedEvent(bb);
	}

	// If you later support more kinds, add more branches above; otherwise, throw here.
	throw new Error(`deserializeParsedEvent: unsupported kind=${o.kind} parsedType=${o.parsedType}`);
}

// Polyfill __stringByteString onto the flatbuffers ByteBuffer
function __stringByteStringPolyfill(this: ByteBuffer, offset: number): ByteString {
	offset += this.readInt32(offset); // follow indirect
	const length = this.readInt32(offset);
	const start = offset + 4;
	const slice = this.bytes().subarray(start, start + length);
	return new ByteString(slice);
}

// Attach to the prototype so any new ByteBuffer inherits it
(ByteBuffer as any).prototype.__stringByteString = __stringByteStringPolyfill;

export function toParsedEvent(t: ParsedEventT): ParsedEvent {
	const builder = new Builder(3096);
	const offset = t.pack(builder);
	builder.finish(offset);
	const bb = new ByteBuffer(builder.asUint8Array());

	(bb as any).__stringByteString = __stringByteStringPolyfill;

	const parsedEvent = ParsedEvent.getRootAsParsedEvent(bb);
	// console.log(
	// 	parsedEvent.id()?.toString(),
	// 	(ByteBuffer as any).prototype.__stringByteString,
	// 	'inst',
	// 	(bb as any).__stringByteString
	// );
	return parsedEvent;
}

export const followList = derived(kind3, ($kind3) => {
	let peoples: string[] = [];
	if ($kind3) {
		const k3 = asKind3($kind3) as Kind3Parsed;
		peoples = fbArray(k3, 'contacts').map((c) => c.pubkey()?.toString() as string);
	}

	const encoder = new TextEncoder();

	const parsedEvent = new ParsedEventT(
		encoder.encode('followlist'),
		encoder.encode(''),
		39089,
		now(),
		11,
		new Kind39089ParsedT(
			encoder.encode('followlist'),
			peoples,
			encoder.encode('followlist'),
			encoder.encode('people you follow'),
			encoder.encode('/followlist.png')
		)
	);

	return toParsedEvent(parsedEvent);

	// return {
	// 	id: () => ({
	// 		toString: () => 'followlist',
	// 		fnv1aHash: () => 'followlist'
	// 	}),
	// 	image: () => undefined,
	// 	parsedType: () => 10,
	// 	kind: () => 39089,
	// 	title: () => ({
	// 		toString: () => 'People you follow'
	// 	}),
	// 	description: () => ({
	// 		toString: () => 'People you already follow on the platform'
	// 	}),
	// 	people: (i: number) => peoples[i],
	// 	peopleLength: () => peoples.length,
	// 	listIdentifier: () => ({
	// 		toString: () => 'follow_list'
	// 	}),
	// 	createdAt: () => now()
	// } as ParsedEvent;
});

export const followPacks = persistentWritable<ParsedEvent[]>(
	'followpacks',
	[get(followList)],
	(bbs: string[]) => {
		return bbs
			.map(deserializeParsedEvent)
			.map((pe) => (pe.id()?.toString() == 'followlist' ? get(followList) : pe));
	},
	(pe) => {
		return JSON.stringify(pe.map(serializeParsedEvent));
	}
);
