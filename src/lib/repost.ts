import { extractTag, type ParsedEvent } from '@candypoets/nipworker';
import { asKind6 } from '@candypoets/nipworker/utils';

export interface Kind6RepostReference {
	id: string;
	relayHints: string[];
	embeddedEvent: ParsedEvent | undefined;
}

function isRelayUrl(value: string | null | undefined): value is string {
	return Boolean(value && /^wss?:\/\//i.test(value));
}

/** Resolve both embedded and NIP-18 ID-only kind-6 reposts without unpacking the event. */
export function kind6RepostReference(event: ParsedEvent): Kind6RepostReference | undefined {
	if (event.kind() !== 6) return undefined;

	const eventTag = extractTag(event, 'e');
	const embeddedEvent = asKind6(event)?.repostedEvent() || undefined;
	const id = eventTag?.[1] || embeddedEvent?.id() || '';
	if (!id) return undefined;

	return {
		id,
		relayHints: eventTag?.[2] && isRelayUrl(eventTag[2]) ? [eventTag[2]] : [],
		embeddedEvent
	};
}
