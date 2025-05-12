import type { NostrEvent } from 'nostr-tools';
import { type Kind0Parsed } from './kind0';
import { type Kind1Parsed } from './kind1';
import { type Kind3Parsed } from './kind3';
import { type Kind4Parsed } from './kind4';
import { type Kind7Parsed } from './kind7';
import { type Kind17Parsed } from './kind17';
import { type Kind9735Parsed } from './kind9735';
import { type Kind9321Parsed } from './kind9321';

import { type Kind10002Parsed } from './kind10002';
import { type Kind10019Parsed } from './kind10019';
import { type Kind17375Parsed } from './kind17375';
import { type Kind7374Parsed } from './kind7374';
import { type Kind7375Parsed } from './kind7375';
import type { ParsedEvent } from 'src/workers/nipworker';
import type { Kind7376Parsed } from './kind7376';

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
export const isKind7376 = (event: NostrEvent): event is ParsedEvent<Kind7376Parsed> =>
	event?.kind === 7376;

export const isKind = (kind: number) => {
	switch (kind) {
		case 0:
			return isKind0;
		case 1:
			return isKind1;
		case 3:
			return isKind3;
		case 4:
			return isKind4;
		case 6:
			return isKind6;
		case 7:
			return isKind7;
		case 17:
			return isKind17;
		case 9735:
			return isKind9735;
		case 9321:
			return isKind9321;
		case 10002:
			return isKind10002;
		case 10019:
			return isKind10019;
		case 17375:
			return isKind17375;
		case 7374:
			return isKind7374;
		case 7375:
			return isKind7375;
		default:
			return null;
	}
};

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
