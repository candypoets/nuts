import { type NostrEvent, parseReferences, SimplePool } from 'nostr-tools';
import { parse } from 'nostr-tools/nip10';
import type { AddressPointer, EventPointer, ProfilePointer } from 'nostr-tools/nip19';
import { addEvent, getProfile, nostrDb, queryEvents } from 'src/db';
import { normalizeURL, parseContent, type Request } from 'src/workers/utils';
import type { ContentBlock } from 'src/workers/utils';

const INDEX_RELAYS = (import.meta.env.VITE_INDEXER_RELAYS || '').split(',').filter(Boolean);

type Reference = ReturnType<typeof parseReferences>[0];

export type Kind1Parsed = {
	content: string;
	parsedContent: ContentBlock[];
	references: Reference[];
	quotes: ProfilePointer[];
	mentions: EventPointer[];
	reply?: EventPointer | undefined; // direct reply
	root?: EventPointer | undefined; // thread root
};

export async function parseKind1(
	event: NostrEvent,
	EOSERequests?: Request[]
): Promise<Kind1Parsed | null> {
	const db = await nostrDb;
	if (!event || event.kind !== 1 || !db) return null;

	try {
		const { mentions, profiles, reply, root } = parse(event);

		// extract references from content
		const references = parseReferences(event);

		let pending: { [key: string]: boolean } = {};
		let promises: Promise<void | NostrEvent[]>[] = [];

		const pool = new SimplePool();

		// check if the event author is in indexedDB
		if (!(await getProfile(db, event.pubkey))) {
			promises.push(
				(async function () {
					if (EOSERequests) {
						EOSERequests.push({
							kinds: [0],
							authors: [event.pubkey],
							relays: event.relays || INDEX_RELAYS
						});
					} else {
						const result = await pool.querySync(event.relays || INDEX_RELAYS, {
							kinds: [0],
							authors: [event.pubkey]
						});
						if (!result.length) {
							console.warn('Failed to fetch profile for author: ', event.pubkey);
						}
						console.info('Fetched profile for author:', event.pubkey, result?.[0]);
						await addEvent(db, result?.[0]);
					}
				})()
			);
		}
		for (let ref of [
			...references.flatMap((ref) => [ref.profile, ref.event, ref.address]),
			// ...mentions,
			...profiles,
			reply,
			root
		]) {
			if (!ref) continue;
			// normalize reference relays
			let normalizedRelays = ref.relays && ref.relays.map(normalizeURL).filter(Boolean);
			if (!normalizedRelays?.length) normalizedRelays = undefined;
			// we have an naddr
			if ('identifier' in ref) {
				const reference = ref as AddressPointer;
				const exist = await queryEvents(db, {
					kinds: [reference.kind],
					authors: [reference.pubkey],
					['#d']: [reference.identifier as string]
				});
				if (!exist && !pending[reference.identifier]) {
					if (EOSERequests) {
						EOSERequests.push({
							kinds: [reference.kind],
							authors: [reference.pubkey],
							['#d']: [reference.identifier as string],
							relays: normalizedRelays || event.relays || INDEX_RELAYS
						});
					} else {
						pending[reference.identifier] = true;
						promises.push(
							(async () => {
								const event = await pool.get(reference.relays || INDEX_RELAYS, {
									kinds: [reference.kind],
									authors: [reference.pubkey],
									['#d']: [reference.identifier as string]
								});
								if (event) {
									await addEvent(db, event);
								} else {
									console.warn('NostrEvent not found ', reference.identifier);
								}
							})()
						);
					}
				}
			} else if ('id' in ref) {
				// we have an event
				const reference = ref as EventPointer;
				// check if that event id is in the database
				const exists = await db.get('events', reference.id);
				if (!exists && !pending[reference.id]) {
					if (EOSERequests) {
						EOSERequests.push({
							ids: [reference.id],
							relays: normalizedRelays || event.relays
						});
					} else {
						pending[reference.id] = true;
						promises.push(
							(async () => {
								const result = await pool.get(reference.relays || event.relays || INDEX_RELAYS, {
									ids: [reference.id]
								});
								if (result) {
									await addEvent(db, {
										...result,
										parsed: { parsedContent: await parseContent(result.content) }
									} as NostrEvent);
								} else {
									console.warn(`NostrEvent ${reference.id} not found`);
								}
							})()
						);
					}
				}
			} else if ('pubkey' in ref) {
				// we have a profile
				const reference = ref as ProfilePointer;
				// check if that profile pubkey is in the database
				const exists = await queryEvents(db, {
					authors: [reference.pubkey],
					kinds: [0]
				});
				if (!exists && !pending[reference.pubkey]) {
					if (EOSERequests) {
						EOSERequests.push({
							authors: [reference.pubkey],
							kinds: [0],
							relays: normalizedRelays || event.relays
						});
					} else {
						pending[reference.pubkey] = true;
						promises.push(
							(async () => {
								const event = await pool.get(ref.relays || INDEX_RELAYS, {
									authors: [reference.pubkey],
									kinds: [0]
								});
								if (event) {
									await addEvent(db, event);
								} else {
									console.warn(`NostrEvent ${reference.pubkey} not found`);
								}
							})()
						);
					}
				}
			}
		}
		// trigger all promises in parallel
		await Promise.all(promises);
		const parsedContent = await parseContent(event.content);

		return {
			content: event.content,
			parsedContent,
			references,
			quotes: profiles,
			mentions,
			reply,
			root
		};
	} catch (error) {
		console.error('Failed to parse text note:', error);
		return null;
	}
}
