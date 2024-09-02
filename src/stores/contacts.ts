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
			if (!follow[2]) return;
			// $db.contacts.bulkPut();
			follow[2].tags.map((t) => $db.contacts.add({ pubkey: t[1] }));
		}
	}).subscribe((n) => n);

	derived([key, contacts, db], async ([$key, $contacts, $db]) => {
		// if (!$db) return;
		// if (!$key?.pub) return;
		// // filter contact that have been claimed already
		// const contacts = $contacts.filter((c) => !c.createdAt);
		// if (!contacts.length) return;
		// const profiles = get(pool).req([
		// 	{
		// 		kinds: [0],
		// 		authors: contacts.map((c) => c.pubkey)
		// 		// since: last?.createdAt
		// 	}
		// ]);
		// for await (const profile of profiles) {
		// 	if (profile[0] === 'CLOSED') break;
		// 	if (profile[0] !== 'EVENT') continue;
		// 	const contact = JSON.parse(profile[2].content);
		// 	console.log(contact);
		// 	// add the contact to the db
		// 	$db.contacts.put({
		// 		createdAt: profile[2].created_at,
		// 		pubkey: profile[2].pubkey,
		// 		name: contact.name || contact.display_name || contact.displayName,
		// 		about: contact.about,
		// 		picture: contact.picture
		// 	});
		// }
	}).subscribe((n) => n);
}

export async function getContact(pubkey: string): Promise<Contact> {
	// try to get the contact from the db
	const local = get(contacts).find((c) => c.pubkey === pubkey);
	if (local) return local;
	console.log(pubkey);
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
