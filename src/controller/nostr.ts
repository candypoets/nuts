import type {
	Kind0Parsed,
	Kind10002Parsed,
	Kind10019Parsed,
	Kind3Parsed,
	Kind7375Parsed
} from 'src/parsers';
import type { Kind17375Parsed } from 'src/parsers/kind17375';
import type { ParsedEvent } from 'src/workers/nipworker';
import { writable, type Writable } from 'svelte/store';

export const kind0: Writable<ParsedEvent<Kind0Parsed> | undefined> = writable();

export const kind3: Writable<ParsedEvent<Kind3Parsed> | undefined> = writable();

export const kind10002: Writable<ParsedEvent<Kind10002Parsed> | undefined> = writable();

export const kind10019: Writable<ParsedEvent<Kind10019Parsed> | undefined> = writable();

export const kind17375: Writable<ParsedEvent<Kind17375Parsed> | undefined> = writable();

export const kinds7375: Writable<ParsedEvent<Kind7375Parsed>[]> = writable([]);
