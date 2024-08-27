import type { Contact } from '../model/contact';
import * as nostrTools from 'nostr-tools';
import { derived, get, writable } from 'svelte/store';
import { nostrPrivKey, nostrPubKey } from './nostr';
import { contacts, db } from './db';
import { browser } from '$app/environment';
import { pool } from './relays';

if (browser) {
	derived([nostrPubKey, nostrPrivKey, db], async ([$pubkey, $privkey, $db]) => {
		// console.info('fetching contacts');
		if (!$pubkey) return;
		try {
			// find the last added contact
			const last = await $db.contacts.orderBy('createdAt').last();

			const messages = get(pool).req([
				{
					kinds: [nostrTools.kinds.Contacts],
					limit: 30,
					authors: [$pubkey],
					since: last?.createdAt
				}
			]);

			for await (const message of messages) {
				if (message[0] === 'CLOSED') break;
				if (message[0] !== 'EVENT') continue;
				const event = message[2];
				const follows = get(pool).req([
					{
						kinds: [0],
						authors: event.tags.filter((t) => t[0] == 'p').map((t) => t[1]),
						since: last?.createdAt
					}
				]);
				for await (const follow of follows) {
					if (follow[0] === 'CLOSED') break;
					if (follow[0] !== 'EVENT') continue;
					const event = follow[2];
					// console.log(event);
					const contact = JSON.parse(event.content);

					// console.log(contact, event.created_at);

					// add the contact to the db
					await $db.contacts.put({
						createdAt: event.created_at,
						pubkey: event.pubkey,
						name: contact.name,
						about: contact.about,
						picture: contact.picture
					});
				}
			}
		} catch (e) {
			console.error(e);
		}
	}).subscribe((n) => n);
}

export async function getContact(pubkey: string): Promise<Contact> {
	console.log(pubkey);
	// try to get the contact from the db
	const local = get(contacts).find((c) => c.pubkey === pubkey);
	if (local) return local;
	const contact = new Promise<Contact>(async (resolve, reject) => {
		try {
			const follows = get(pool).req([
				{
					kinds: [0],
					authors: [pubkey]
				}
			]);
			for await (const follow of follows) {
				if (follow[0] === 'CLOSED') break;
				if (follow[0] !== 'EVENT') continue;
				const event = follow[2];
				console.log(event);
				resolve(JSON.parse(event.content));
			}
		} catch (e) {
			reject(e);
		}
	});
	return contact;
}
