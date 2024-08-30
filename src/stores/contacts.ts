import type { Contact } from '../model/contact';
import * as nostrTools from 'nostr-tools';
import { derived, get, writable } from 'svelte/store';
import { contacts, db, key } from './db';
import { browser } from '$app/environment';
import { pool } from './relays';

if (browser) {
	derived([key, db], async ([$key, $db]) => {
		// console.info('fetching contacts');
		if (!$key?.pub) return;
		try {
			// find the last added contact
			const last = await $db.contacts.orderBy('createdAt').last();

			const follows = get(pool).req([
				{
					kinds: [nostrTools.kinds.Contacts],
					limit: 30,
					authors: [$key.pub],
					since: last?.createdAt
				}
			]);

			for await (const follow of follows) {
				if (follow[0] === 'CLOSED') break;
				if (follow[0] !== 'EVENT') continue;
				console.log('contact', follow[2]);
				const profiles = get(pool).req([
					{
						kinds: [0],
						authors: follow[2].tags.filter((t) => t[0] == 'p').map((t) => t[1])
						// since: last?.createdAt
					}
				]);
				for await (const profile of profiles) {
					if (profile[0] === 'CLOSED') break;
					if (profile[0] !== 'EVENT') continue;
					const contact = JSON.parse(profile[2].content);
					console.log(contact);
					// add the contact to the db
					await $db.contacts.put({
						createdAt: follow[2].created_at,
						pubkey: profile[2].pubkey,
						name: contact.name || contact.display_name || contact.displayName,
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
				// console.log(event);
				resolve({ ...JSON.parse(event.content), pubkey: event.pubkey });
			}
		} catch (e) {
			reject(e);
		}
	});
	return contact;
}
