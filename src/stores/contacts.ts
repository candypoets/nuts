import type { Contact } from '../model/contact';
import * as nostrTools from 'nostr-tools';
import { derived, get, writable } from 'svelte/store';
import { contacts, contactsCache, db, key, usersCache } from './db';
import { browser } from '$app/environment';
import { pool } from './relays';
import { kinds } from 'nostr-tools';
import type { NPool } from '@nostrify/nostrify';

export const followingSub = derived([key, db], async ([$key, $db]) => {
	// console.info('fetching contacts');
	if (!$key?.pub) return;
	// find the last added contact
	// const last = await contactsCache.;

	const follows = get(pool).req([
		{
			kinds: [nostrTools.kinds.Contacts],
			limit: 30,
			authors: [$key.pub]
			// since: last?.createdAt
		}
	]);

	for await (const follow of follows) {
		if (follow[0] === 'CLOSED') break;
		if (follow[0] !== 'EVENT') continue;
		if (!follow[2]) return;
		// $db.contacts.bulkPut();
		follow[2].tags.map((t) => $db.contacts.add({ pubkey: t[1] }));
	}
});

// export const profileSub = derived([key, contacts, db], async ([$key, $contacts, $db]) => {
// 	if (!$db) return;
// 	// filter contact that have been claimed already
// 	const contacts = $contacts.filter((c) => !c.createdAt);
// 	if (!contacts.length) return;
// 	const profiles = get(pool).req([
// 		{
// 			kinds: [0],
// 			authors: contacts.map((c) => c.pubkey)
// 			// since: last?.createdAt
// 		}
// 	]);
// 	for await (const profile of profiles) {
// 		if (profile[0] === 'CLOSED') break;
// 		if (profile[0] !== 'EVENT') continue;
// 		const contact = JSON.parse(profile[2].content);
// 		console.log(contact);
// 		// add the contact to the db
// 		$db.contacts.put({
// 			createdAt: profile[2].created_at,
// 			pubkey: profile[2].pubkey,
// 			name: contact.name || contact.display_name || contact.displayName,
// 			about: contact.about,
// 			picture: contact.picture
// 		});
// 	}
// });

export async function getContact(pubkey: string): Promise<Contact> {
	// try to get the contact from the db
	const local = get(contactsCache).get(pubkey) || get(usersCache).get(pubkey);
	if (local && !!local.createdAt) return local;
	// console.log(pubkey, get(contacts));
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

				const contact = JSON.parse(event.content);

				contactsCache.put({
					createdAt: event.created_at,
					pubkey: event.pubkey,
					name: contact.name || contact.display_name || contact.displayName,
					about: contact.about,
					nip05: contact?.lud16 || contact?.nip05,
					picture: contact.picture
				});
				resolve({ ...JSON.parse(event.content), pubkey: event.pubkey });
			}
		} catch (e) {
			reject(e);
		}
	});
	return contact;
}

export async function fetchProfile(pool: NPool, npub: string, abortController: AbortController) {
	console.log('fetching profile', npub);
	return new Promise<Contact>(async (resolve, reject) => {
		const messages = pool.req(
			[
				{
					kinds: [0],
					authors: [npub]
				}
			],
			{ signal: abortController.signal }
		);
		for await (const message of messages) {
			console.log('profile message', message);
			if (message[0] === 'CLOSED') break;
			if (message[0] === 'EOSE') abortController.abort();
			if (message[0] !== 'EVENT') continue;
			const event = message[2];

			const user = JSON.parse(event.content);
			console.log('--------user--------', user, event);
			const profile = {
				createdAt: event.created_at,
				pubkey: event.pubkey,
				name: user.name || user.display_name || user.displayName,
				about: user.about,
				nip05: user?.nip05,
				picture: user.picture
			};

			usersCache.put(profile);
			resolve(profile);

			abortController.abort();
			break;
		}
	});
}
