import { derived, get, writable, type Writable } from 'svelte/store';
import {
	contacts,
	db,
	key,
	notesCache,
	reactionsCache,
	type Reaction,
	type Zap,
	zapsCache
} from './db';
import { pool } from './relays';
import { browser } from '$app/environment';
import { kinds, type NostrEvent } from 'nostr-tools';
import type { NPool } from '@nostrify/nostrify';

let abortController = new AbortController();

// used to fetch reactions and zap events given a set of notes
export const refreshed: Writable<number> = writable(Math.ceil(Date.now() / 1000));

export const notesSub = derived(
	[key, pool, db, contacts],
	async ([$key, $pool, $db, $contacts]) => {
		if (!browser) return;
		if (!$key?.pub) return;
		if (!$pool) return;

		abortController.abort();

		abortController = new AbortController();
		// Calculate 2 days ago in seconds since epoch
		const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
		const lastEvent = await $db.notes.orderBy('created_at').last();

		const messages = get(pool).req(
			[
				{
					kinds: [kinds.ShortTextNote],
					authors: $contacts.map((c) => c.pubkey),
					since: lastEvent?.created_at || twoDaysAgo
				}
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] !== 'EVENT') continue;
			const event = message[2];
			console.log(event);

			notesCache.add(event);
		}
	}
);

let reactionController = new AbortController();
// fetch reactions from most recent posts, or posts that were explicitly requested (profile page and so on)
export const reactionSub = derived(
	[key, pool, db, refreshed],
	async ([$key, $pool, $db, $refreshed]) => {
		if (!browser) return;
		if (!$key?.pub) return;
		if (!$pool) return;

		reactionController.abort();

		reactionController = new AbortController();

		// Calculate 2 days ago in seconds since epoch
		const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
		// const lastEvent = await $db.notes.orderBy('created_at').first();
		// get all then notes that are less than 3 days old
		const notes = await $db.notes.where('created_at').above(threeDaysAgo).toArray();

		const since = await $db.reactions.orderBy('created_at').last();

		const messages = get(pool).req(
			[
				{
					kinds: [kinds.Reaction],
					// '#e': [postId], // Reference to the specific post

					'#e': notes.map((n) => n.id),
					since: since?.created_at || threeDaysAgo
				}
			],
			{ signal: reactionController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] !== 'EVENT') continue;
			const event = message[2];
			// console.log(event);
			let reaction: Reaction = {
				id: event.id,
				kind: event.kind,
				created_at: event.created_at,
				ref: event.tags.find((t) => t[0] === 'e')?.[1],
				pubkey: event.pubkey
			};
			reactionsCache.add(reaction);
		}
	}
);

export async function fetchReactions(
	pool: NPool,
	note: NostrEvent,
	abortController: AbortController
) {
	const messages = pool.req(
		[
			{
				kinds: [kinds.Reaction],
				// '#e': [postId], // Reference to the specific post

				'#e': [note.id],
				since: note?.created_at
			}
		],
		{ signal: abortController.signal }
	);

	for await (const message of messages) {
		if (message[0] === 'CLOSED') break;
		if (message[0] !== 'EVENT') continue;
		const event = message[2];
		// console.log(event);
		let reaction: Reaction = {
			id: event.id,
			kind: event.kind,
			created_at: event.created_at,
			ref: event.tags.find((t) => t[0] === 'e')?.[1],
			pubkey: event.pubkey
		};
		reactionsCache.add(reaction);
	}
}

function getAmountFromBolt11(bolt11: string) {
	// This is a simplified regex. A full implementation would be more robust.
	const match = bolt11.match(/ln([^1-9]*)([1-9][0-9]*[munp]?)/);
	if (match) {
		let amount = parseInt(match[2]);
		const unit = match[2].slice(-1);
		switch (unit) {
			case 'p':
				amount /= 10;
				break; // pico
			case 'n':
				amount *= 100;
				break; // nano
			case 'u':
				amount *= 100000;
				break; // micro
			case 'm':
				amount *= 100000000;
				break; // milli
		}
		return amount; // in millisatoshis
	}
	return null;
}

function getMemoFromBolt11(bolt11: string): string | null {
	// This regex looks for the description part of the BOLT11 invoice
	const match = bolt11.match(/(?<=^ln(?:bc|tb)1)[^\d]+(?=1[02-9])([^1-9]+)([0-9a-zA-Z]+)/);
	// console.log(match);
	if (match && match[2]) {
		try {
			// The memo is typically base64 encoded
			const decodedMemo = atob(match[2]);
			// Try parsing as JSON
			try {
				const jsonMemo = JSON.parse(decodedMemo);
				return jsonMemo.content || jsonMemo.message || decodedMemo;
			} catch {
				// If not valid JSON, return the decoded string
				return decodedMemo;
			}
		} catch (error) {
			console.error('Error decoding memo:', error);
			return null;
		}
	}
	return null;
}

let zapController = new AbortController();
// fetch reactions from most recent posts, or posts that were explicitly requested (profile page and so on)
export const zapSub = derived(
	[key, pool, db, refreshed],
	async ([$key, $pool, $db, $refreshed]) => {
		if (!browser) return;
		if (!$key?.pub) return;
		if (!$pool) return;

		zapController.abort();

		zapController = new AbortController();

		// Calculate 2 days ago in seconds since epoch
		const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
		// const lastEvent = await $db.notes.orderBy('created_at').first();
		// get all then notes that are less than 3 days old
		const notes = await $db.notes.where('created_at').above(threeDaysAgo).toArray();

		const lastZap = await $db.zaps.orderBy('created_at').last();

		console.log(
			'notes',
			notes
			// notes.map((n) => n.id)
		);
		const messages = get(pool).req(
			[
				{
					kinds: [kinds.Zap],
					// '#e': [postId], // Reference to the specific post

					'#e': notes.map((n) => n.id),
					since: lastZap?.created_at || threeDaysAgo
				}
			],
			{ signal: zapController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] !== 'EVENT') continue;
			const event = message[2];

			const amount = getAmountFromBolt11(event.tags.find((t) => t[0] === 'bolt11')?.[1]);

			// console.log(amount);

			let zap: Zap = {
				id: event.id,
				kind: event.kind,
				content: event.content,
				created_at: event.created_at,
				ref: event.tags.find((t) => t[0] === 'e')?.[1],
				pubkey: event.pubkey,
				amount: amount || 0
			};

			zapsCache.add(zap);
		}
	}
);

export async function fetchZaps(pool: NPool, note: NostrEvent, abortController: AbortController) {
	const messages = pool.req(
		[
			{
				kinds: [kinds.Zap],
				// '#e': [postId], // Reference to the specific post

				'#e': [note.id],
				since: note?.created_at
			}
		],
		{ signal: abortController.signal }
	);

	for await (const message of messages) {
		if (message[0] === 'CLOSED') break;
		if (message[0] !== 'EVENT') continue;
		const event = message[2];

		const amount = getAmountFromBolt11(event.tags.find((t) => t[0] === 'bolt11')?.[1]);

		const memo = getMemoFromBolt11(event.tags.find((t) => t[0] === 'bolt11')?.[1]);

		// console.log(
		// 	event,
		// 	amount,
		// 	memo,
		// 	JSON.parse(event.tags.find((t) => t[0] === 'description')?.[1] || '').content
		// );

		let zap: Zap = {
			id: event.id,
			kind: event.kind,
			content: event.content,
			created_at: event.created_at,
			ref: event.tags.find((t) => t[0] === 'e')?.[1],
			pubkey: event.pubkey,
			amount: amount || 0
		};

		zapsCache.add(zap);
	}
}

export async function fetchReplies(
	pool: NPool,
	note: NostrEvent,
	abortController: AbortController
) {
	const messages = pool.req(
		[
			{
				kinds: [kinds.ShortTextNote],
				// '#e': [postId], // Reference to the specific post

				'#e': [note.id],
				since: note?.created_at
			}
		],
		{ signal: abortController.signal }
	);

	for await (const message of messages) {
		if (message[0] === 'CLOSED') break;
		if (message[0] !== 'EVENT') continue;
		const event = message[2];

		notesCache.add({ ...event, reply_to: note.id });
	}
}

export async function fetchNote(pool: NPool, noteId: string, abortController: AbortController) {
	const messages = pool.req(
		[
			{
				kinds: [kinds.ShortTextNote],
				ids: [noteId]
			}
		],
		{ signal: abortController.signal }
	);
	for await (const message of messages) {
		if (message[0] === 'CLOSED') break;
		if (message[0] !== 'EVENT') continue;
		const event = message[2];
		const reply_to = event.tags.find((t) => t[0] === 'e')?.[1];
		notesCache.add({ ...event, reply_to: reply_to });
	}
}
