import type { NostrEvent } from 'nostr-tools';
import { parseKind0 } from './kind0';
import { parseKind1 } from './kind1';
import { parseKind3 } from './kind3';
import { parseKind7 } from './kind7';
import { parseKind17 } from './kind17';
import { parseKind9735 } from './kind9735';
import { parseKind9321 } from './kind9321';
import { parseKind10002 } from './kind10002';
import { parseKind10019 } from './kind10019';

export * from './kind0';
export * from './kind1';
export * from './kind3';
export * from './kind7';
export * from './kind17';
export * from './kind9735';
export * from './kind9321';
export * from './kind10002';
export * from './kind10019';

export const parseEvent = async (event: NostrEvent) => {
	const { kind } = event;
	switch (kind) {
		case 0:
			return parseKind0(event);
		case 1:
			return parseKind1(event);
		case 3:
			return parseKind3(event);
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
		default:
			return {};
	}
};
