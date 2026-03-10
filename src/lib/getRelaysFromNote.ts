import type { ParsedEvent } from '@candypoets/nipworker';
import { fbArray } from '@candypoets/nipworker/utils';

export function getRelaysFromNote(note: ParsedEvent): string[] {
	return fbArray(note, 'relays')?.map((r) => String(r)) ?? [];
}
