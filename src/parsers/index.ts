import type { NostrEvent } from 'nostr-tools';
import { parseKind0, type Kind0Parsed } from './kind0';
import { parseKind1, type Kind1Parsed } from './kind1';
import { parseKind3, type Kind3Parsed } from './kind3';
import { parseKind4, type Kind4Parsed } from './kind4';
import { parseKind7, type Kind7Parsed } from './kind7';
import { parseKind17, type Kind17Parsed } from './kind17';
import { parseKind9735, type Kind9735Parsed } from './kind9735';
import { parseKind9321, type Kind9321Parsed } from './kind9321';

import { parseKind10002, type Kind10002Parsed } from './kind10002';
import { parseKind10019, type Kind10019Parsed } from './kind10019';
import { parseKind17375, type Kind17375Parsed } from './kind17375';
import { parseKind7374, type Kind7374Parsed } from './kind7374';
import { parseKind7375, type Kind7375Parsed } from './kind7375';
import type { ParsedEvent } from 'src/workers/nipworker';

export * from './kind0';
export * from './kind1';
export * from './kind3';
export * from './kind4';
export * from './kind7';
export * from './kind17';
export * from './kind9735';

export * from './kind9321';
export * from './kind10002';
export * from './kind10019';
export * from './kind17375';
export * from './kind7374';
export * from './kind7375';
export * from './proof';

// Type guard functions for each event kind
export const isKind0 = (event: NostrEvent): event is ParsedEvent<Kind0Parsed> => event?.kind === 0;
export const isKind1 = (event: NostrEvent): event is ParsedEvent<Kind1Parsed> => event?.kind === 1;
export const isKind3 = (event: NostrEvent): event is ParsedEvent<Kind3Parsed> => event?.kind === 3;
export const isKind4 = (event: NostrEvent): event is ParsedEvent<Kind4Parsed> => event?.kind === 4;
export const isKind6 = (event: NostrEvent): event is ParsedEvent<any> => event?.kind === 6;
export const isKind7 = (event: NostrEvent): event is ParsedEvent<Kind7Parsed> => event?.kind === 7;
export const isKind17 = (event: NostrEvent): event is ParsedEvent<Kind17Parsed> =>
	event?.kind === 17;
export const isKind9735 = (event: NostrEvent): event is ParsedEvent<Kind9735Parsed> =>
	event?.kind === 9735;
export const isKind9321 = (event: NostrEvent): event is ParsedEvent<Kind9321Parsed> =>
	event?.kind === 9321;
export const isKind10002 = (event: NostrEvent): event is ParsedEvent<Kind10002Parsed> =>
	event?.kind === 10002;
export const isKind10019 = (event: NostrEvent): event is ParsedEvent<Kind10019Parsed> =>
	event?.kind === 10019;
export const isKind17375 = (event: NostrEvent): event is ParsedEvent<Kind17375Parsed> =>
	event?.kind === 17375;
export const isKind7374 = (event: NostrEvent): event is ParsedEvent<Kind7374Parsed> =>
	event?.kind === 7374;
export const isKind7375 = (event: NostrEvent): event is ParsedEvent<Kind7375Parsed> =>
	event?.kind === 7375;

export type AnyKind =
	| Kind0Parsed
	| Kind1Parsed
	| Kind3Parsed
	| Kind4Parsed
	| Kind7Parsed
	| Kind17Parsed
	| Kind9735Parsed
	| Kind1Parsed // For Kind9321 which seems to use Kind1Parsed
	| Kind10002Parsed
	| Kind10019Parsed
	| Kind17375Parsed
	| Kind7374Parsed
	| Kind7375Parsed;

export const parseEvent = async (event: NostrEvent) => {
	const { kind } = event;
	switch (kind) {
		case 0:
			return parseKind0(event);
		case 1:
			return parseKind1(event);
		case 3:
			return parseKind3(event);
		case 4:
			return parseKind4(event);
		case 7:
			return parseKind7(event);
		case 17:
			return parseKind17(event);
		case 9735:
			return parseKind9735(event);
		case 9321:
			return parseKind9321(event);
		case 10002:
			return parseKind10002(event);
		case 10019:
			return parseKind10019(event);
		case 17375:
			return parseKind17375(event);
		case 7374:
			return parseKind7374(event);
		case 7375:
			return parseKind7375(event);
		default:
			return {};
	}
};
