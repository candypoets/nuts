import { ParsedEvent, ParsedEventT } from '@candypoets/nipworker';
import { Builder, ByteBuffer } from 'flatbuffers';
import { persistentWritable } from 'src/lib/persistentWritable';

export type FeedKind = 1 | 6 | 20 | 34235 | 1068 | 30023 | 30311;
export type ExploreAudienceMode = 'contacts' | 'all';

export const ALL_FEED_KINDS: FeedKind[] = [1, 6, 20, 34235, 1068, 30023, 30311];

export const KIND_ICONS: Record<FeedKind, string> = {
	1: 'mdi:text-box-outline',
	6: 'mdi:repeat',
	20: 'mdi:image-multiple',
	34235: 'mdi:video',
	1068: 'mdi:poll',
	30023: 'mdi:file-document-outline',
	30311: 'mdi:broadcast'
};

export const KIND_LABELS: Record<FeedKind, string> = {
	1: 'Posts',
	6: 'Reposts',
	20: 'Media',
	34235: 'Videos',
	1068: 'Polls',
	30023: 'Articles',
	30311: 'Live Streams'
};

export const KIND_DESCRIPTIONS: Record<FeedKind, string> = {
	1: 'Text notes, thoughts, updates - the classic Nostr post',
	6: 'Shared posts from others with commentary',
	20: 'Images and media uploads. Photos, memes, artwork',
	30023: 'Long-form articles and blog posts. In-depth content',
	34235: 'Video content. Long-form and short clips',
	1068: 'Interactive polls and surveys. Vote and see results',
	30311: 'Live streaming events, broadcasts, and audio spaces'
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

export const exploreAudienceMode = persistentWritable<ExploreAudienceMode>(
	'exploreAudienceMode',
	'contacts',
	(storage: unknown) => (storage === 'contacts' || storage === 'all' ? storage : 'contacts'),
	(mode) => JSON.stringify(mode)
);

export function toParsedEvent(t: ParsedEventT): ParsedEvent {
	const builder = new Builder(3096);
	const offset = t.pack(builder);
	builder.finish(offset);
	const bb = new ByteBuffer(builder.asUint8Array());

	const parsedEvent = ParsedEvent.getRootAsParsedEvent(bb);
	return parsedEvent;
}
