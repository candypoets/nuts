import type { ParsedEvent } from 'src/types';

export interface ListMetadata {
	title?: string;
	description?: string;
	image?: string;
}

export interface Kind30000Parsed {
	list_identifier: string;
	people: string[];
	metadata: ListMetadata;
}

export function isKind30000(event: ParsedEvent<unknown>): event is ParsedEvent<Kind30000Parsed> {
	return event.kind === 30000;
}