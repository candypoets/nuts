import { derived, get, writable, type Writable } from 'svelte/store';
import {
	db,
	key,
	notesCache,
	reactionsCache,
	type Reaction,
	type Zap,
	zapsCache,
	repostsCache,
	type Repost,
	type Note,
	type Contact
} from './db';
import { pool } from './relays';
import { browser } from '$app/environment';
import { kinds, type NostrEvent } from 'nostr-tools';
import type { NPool } from '@nostrify/nostrify';
import { nutKinds } from 'src/lib';

let abortController = new AbortController();

// used to fetch reactions and zap events given a set of notes
export const refreshed: Writable<number> = writable(Math.ceil(Date.now() / 1000));

export async function* fetchThread(
	pool: NPool,
	contacts: Contact[],
	abortController: AbortController,
	since?: number
) {
	if (!browser) return;
	let newMessages: { [key: string]: Note } = {};
	let loaded = false;
	// Calculate 2 days ago in seconds since epoch
	const oneDayAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
	// console.log('ongoing feed request', lastEvent?.created_at);
	try {
		const messages = pool.req(
			[
				{
					kinds: [kinds.ShortTextNote, kinds.Repost],
					authors: contacts.map((c) => c.pubkey),
					since: since || oneDayAgo,
					limit: 500
				}
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] == 'EOSE') {
				if (!loaded) {
					yield Object.values(newMessages);
					loaded = true;
				}
				continue;
			}
			if (message[0] !== 'EVENT') continue;
			const event = message[2];
			// console.log(event);
			//
			if (event.kind == kinds.Repost) {
				const post = {
					...JSON.parse(event.content),
					reposted_by: event.pubkey,
					created_at: event.created_at
				};
				if (loaded && !newMessages[event.id]) {
					yield [post];
				}
				newMessages[event.id] = post;
				notesCache.add(post);
				continue;
			}
			// if the e tag is present, it means the note is a reply to another note, add reply_to field
			const replies = event.tags.filter((t) => t[0] == 'e');
			if (replies.length > 1) continue;

			let replyTo;
			let replyToPubkey: string | undefined;

			if (!!replies.length) {
				if (!replies.find((r) => r[3] == 'root')) continue;
				replyTo = replies.find((r) => r[3] == 'root');
			}
			if (replyTo) {
				// console.log('reply event', event);
				replyToPubkey = event.tags.find((t) => t[0] == 'p')?.[1];
				if (event.tags.filter((t) => t[0] === 'p').length > 1) {
					replyToPubkey = event.tags.filter((t) => t[0] === 'p')[0][1];
				}
			}
			const note = {
				...event,
				reply_to: replyTo ? replyTo[1] : undefined,
				reply_to_pubkey: replyToPubkey
			};
			newMessages[event.id] = note;
			if (loaded && !newMessages[event.id]) {
				yield [note];
			}
			notesCache.add(note);
		}
	} catch (e) {
		// console.error(e);
	}
}

export async function* fetchReactions(
	pool: NPool,
	note: NostrEvent,
	abortController: AbortController,
	since?: number
) {
	let newReactions: { [key: string]: Reaction } = {};
	let loaded = false;
	try {
		const messages = pool.req(
			[
				{
					kinds: [kinds.Reaction],
					// '#e': [postId], // Reference to the specific post

					'#e': [note.id],
					since: since || note?.created_at
				}
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] == 'EOSE') {
				if (!loaded) {
					yield Object.values(newReactions);
					loaded = true;
				}
				continue;
			}

			if (message[0] !== 'EVENT') continue;

			const event = message[2];

			let reaction: Reaction = {
				id: event.id,
				kind: event.kind,
				created_at: event.created_at,
				ref: event.tags.find((t) => t[0] === 'e')?.[1],
				pubkey: event.pubkey
			};

			if (loaded && !newReactions[event.id]) {
				yield [reaction];
			}
			reactionsCache.add(reaction);
			newReactions[event.id] = reaction;
		}
	} catch (e) {
		// console.error(e);
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
		return amount / 1000; // in satoshis
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

export async function* fetchZaps(
	pool: NPool,
	note: NostrEvent,
	abortController: AbortController,
	since?: number
) {
	let newZaps: { [key: string]: Zap } = {};
	let loaded = false;
	try {
		const messages = pool.req(
			[
				{
					kinds: [kinds.Zap, nutKinds.NutzapRedeemed],
					// '#e': [postId], // Reference to the specific post

					'#e': [note.id],
					since: since || note?.created_at
				}
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] == 'EOSE') {
				if (!loaded) {
					yield Object.values(newZaps);
					loaded = true;
				}
				continue;
			}
			if (message[0] !== 'EVENT') continue;
			const event = message[2];
			let amount = 0;
			if (event.kind == nutKinds.NutzapRedeemed) {
				console.log('nutszap redeeemed ---------------');
				amount = Number(event.tags.find((t) => t[0] == 'amount')?.[1] || 0);
				const eventID = event.tags.find((t) => t[0] == 'e' && t[3] == 'redeemed')?.[1];
				if (eventID) {
					// remove the zap that was optimistacally added
					zapsCache.delete(eventID);
				}
			} else {
				amount = getAmountFromBolt11(event.tags.find((t) => t[0] === 'bolt11')?.[1]) || 0;
			}

			// const memo = getMemoFromBolt11(event.tags.find((t) => t[0] === 'bolt11')?.[1]);

			// console.log(
			// 	event,
			// 	amount,
			// 	memo,
			// 	JSON.parse(event.tags.find((t) => t[0] === 'description')?.[1] || '').content
			// );
			//

			let zap: Zap = {
				id: event.id,
				kind: event.kind,
				content: event.content,
				created_at: event.created_at,
				ref: note.id,
				pubkey: event.pubkey,
				amount: amount || 0
			};
			if (loaded && !newZaps[event.id]) {
				yield [zap];
			}
			zapsCache.add(zap);
			newZaps[event.id] = zap;
		}
	} catch (e) {
		// console.error(e);
	}
}

export async function* fetchReplies(
	pool: NPool,
	note: NostrEvent,
	abortController: AbortController,
	since?: number
) {
	let newReplies: { [key: string]: Note } = {};
	let loaded = false;
	try {
		const messages = pool.req(
			[
				{
					kinds: [kinds.ShortTextNote],
					// '#e': [postId], // Reference to the specific post

					'#e': [note.id],
					since: since || note?.created_at
				}
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] == 'EOSE') {
				if (!loaded) {
					yield Object.values(newReplies);
					loaded = true;
				}
				continue;
			}
			if (message[0] !== 'EVENT') continue;
			const event = message[2];

			if (loaded && !newReplies[event.id]) {
				yield [{ ...event, reply_to: note.id }];
			}
			newReplies[event.id] = { ...event, reply_to: note.id };
			notesCache.add({ ...event, reply_to: note.id });
		}
	} catch (e) {
		// console.error(e);
	}
}

export async function* fetchRepost(
	pool: NPool,
	note: NostrEvent,
	abortController: AbortController,
	since?: number
) {
	let newReposts: { [key: string]: Repost } = {};
	let loaded = false;
	try {
		const messages = pool.req(
			[
				{
					kinds: [kinds.Repost],
					// '#e': [postId], // Reference to the specific post

					'#e': [note.id],
					since: since || note?.created_at
				}
			],
			{ signal: abortController.signal }
		);

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] == 'EOSE') {
				if (!loaded) {
					yield Object.values(newReposts);
					loaded = true;
				}
				continue;
			}
			if (message[0] !== 'EVENT') continue;
			if (message[1] === 'EOSE') {
				abortController.abort();
				break;
			}
			const event = message[2];
			const repost: Repost = {
				id: event.id,
				kind: event.kind,
				ref: note.id,
				created_at: event.created_at,
				pubkey: event.pubkey
			};

			if (loaded && !newReposts[event.id]) {
				yield [repost];
			}
			newReposts[event.id] = repost;
			repostsCache.add(repost);
		}
	} catch (e) {
		// console.error(e);
	}
}

export async function fetchNote(pool: NPool, noteId: string, abortController: AbortController) {
	return new Promise<Note>(async (resolve, reject) => {
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
			resolve({ ...event, reply_to: reply_to });
			abortController.abort();
			break;
		}
	});
}
