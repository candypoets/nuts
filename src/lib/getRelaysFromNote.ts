import type { ParsedEvent } from '@candypoets/nipworker';
import { fbArray } from '@candypoets/nipworker/utils';

export function getRelaysFromNote(note: ParsedEvent): string[] {
	let relays: string[] = [];
	return fbArray(note, 'relays').map((r) => r.toString());
}
