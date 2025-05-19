import type { NostrEvent } from 'nostr-tools';
import type { ParsedEvent, Kind1Parsed } from './index';

export type Kind6Parsed = {
	repostedEvent?: ParsedEvent<Kind1Parsed>;
};