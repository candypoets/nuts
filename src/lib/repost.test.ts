import { ParsedData, type ParsedEvent } from '@candypoets/nipworker';
import { describe, expect, it } from 'vitest';

import { kind6RepostReference } from './repost';

function event(input: {
	kind: number;
	tags: string[][];
	embeddedEvent?: ParsedEvent;
}): ParsedEvent {
	return {
		kind: () => input.kind,
		parsedType: () =>
			input.embeddedEvent ? ParsedData.Kind6Parsed : (Number.MAX_SAFE_INTEGER as ParsedData),
		parsed: () => ({ repostedEvent: () => input.embeddedEvent || null }),
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

describe('kind6RepostReference', () => {
	it('resolves an ID-only repost from its NIP-18 e tag', () => {
		const reference = kind6RepostReference(
			event({
				kind: 6,
				tags: [['e', 'target-id', 'wss://origin.example']]
			})
		);

		expect(reference).toEqual({
			id: 'target-id',
			relayHints: ['wss://origin.example'],
			embeddedEvent: undefined
		});
	});

	it('keeps the embedded event while preferring the required e-tag ID', () => {
		const embeddedEvent = { id: () => 'embedded-id' } as ParsedEvent;
		const reference = kind6RepostReference(
			event({
				kind: 6,
				tags: [['e', 'tag-id', 'wss://origin.example']],
				embeddedEvent
			})
		);

		expect(reference?.id).toBe('tag-id');
		expect(reference?.embeddedEvent).toBe(embeddedEvent);
	});

	it('rejects kind-6 events without a target and non-repost events', () => {
		expect(kind6RepostReference(event({ kind: 6, tags: [] }))).toBeUndefined();
		expect(
			kind6RepostReference(event({ kind: 1, tags: [['e', 'target-id', 'wss://origin.example']] }))
		).toBeUndefined();
	});
});
