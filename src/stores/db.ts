import Dexie, { liveQuery, type EntityTable } from 'dexie';
import { derived, writable, type Readable, type Writable, get } from 'svelte/store';
import type { MintKeyset, Proof, RequestMintResponse } from '@cashu/cashu-ts';
import type { HistoryItem } from 'src/model/historyItem';
import type { HistoryData } from 'src/model/data/HistoryData';
import type { Contact } from 'src/model/contact';

import _ from 'lodash';
import { browser } from '$app/environment';
import { createCache, restore, type DBCache } from './cache';
import type { NostrEvent } from '@nostrify/nostrify';
import { createTableCache } from './tableCache';

export type Invoice = RequestMintResponse & { date: number; mint: string };

export type Endpoint = {
	url: string;
	enabled?: boolean;
};

export type Setting = {
	key?: string;
	visible: boolean;
	unit: 'sat' | 'btc' | 'usd' | 'eur';
	zap: {
		amount: number;
		message: string;
	};
};

export type Key = {
	pub: string;
	npub: string;
	priv?: string;
	nsec?: string;
};

export enum Status {
	Confirmed = 0,
	Spent = 1
}

// the default state for the proofs is pending
export type DbProof = Proof & {
	status?: Status;
};

export type Zap = {
	id: string;
	kind: number;
	ref?: string; // id of the event zapped
	content: string;
	created_at: number;
	pubkey: string;
	amount: number;
};

export type Reaction = {
	id: string;
	kind: number;
	ref?: string; // id of the event liked
	created_at: number;
	pubkey: string;
};

export type Repost = {
	id: string;
	kind: number;
	ref?: string; // id of the event liked
	created_at: number;
	pubkey: string;
};

export type Note = NostrEvent & {
	reply_to?: string;
	reply_to_pubkey?: string;
	reposted_by?: string;
	// reposted_from?: string;
};

export type DB = Dexie & {
	proofs: EntityTable<DbProof, 'secret'>;
	// pendingProofs: EntityTable<Proof, 'secret'>;
	// spentProofs: EntityTable<Proof, 'secret'>;
	history: EntityTable<HistoryItem<HistoryData>, 'date'>;
	contacts: EntityTable<Contact, 'pubkey'>;
	users: EntityTable<Contact, 'pubkey'>;
	// messages: EntityTable<NostrMessage & { id: string }, 'id'>;
	dms: EntityTable<NostrEvent, 'id'>;
	notes: EntityTable<Note, 'id'>;
	reactions: EntityTable<Reaction, 'id'>;
	reposts: EntityTable<Repost, 'id'>;
	zaps: EntityTable<Zap, 'id'>;
	keysets: EntityTable<MintKeyset & { input_fee_ppk?: number; mint: string }, 'id'>;
	invoices: EntityTable<Invoice, 'quote'>;
	relays: EntityTable<Endpoint, 'url'>;
	mints: EntityTable<Endpoint, 'url'>;
	settings: Dexie.Table<Setting, string, 'key'>;
};

export type KeyDB = Dexie & {
	keys: EntityTable<Key, 'pub'>;
};

export const keyDB = new Dexie('key') as KeyDB;

keyDB.version(1).stores({
	keys: 'pub,npub,priv,nsec'
});

export const activeAccount = writable(0);

export const keysCache = createCache<Key, 'pub'>(keyDB.keys);

export const key: Readable<Key | undefined> = derived(
	[keysCache, activeAccount],
	([$keysCache, $activeAccount], set) => {
		if (!browser) return;
		const currentKey = Array.from($keysCache.values())[$activeAccount];
		console.log($activeAccount, currentKey);
		if (!currentKey) {
			set(undefined);
		} else if (!currentKey?.priv) {
			(async () => {
				if (window.nostr?.nip04) {
					try {
						// await new Promise((resolve) => window.addEventListener('load', resolve));
						console.log('getpubkey', window.nostr.getPublicKey);
						const pubkey = await window.nostr.getPublicKey();
						console.log('hey', pubkey);
						const isLogged = await keyDB.keys.get(pubkey);
						if (isLogged) {
							// $activeAccount = Array.from($keysCache.values()).findIndex((k) => k.pub == pubKey);
							set(isLogged);
						}
					} catch (error) {
						console.error('Failed to get public key:', error);
						// Handle the error appropriately, e.g., set a default value or show an error message
					}
				}
			})();
		} else {
			set(currentKey);
		}
	}
);

export const db: Readable<DB> = derived([activeAccount, key], ([$activeAccount, $key], set) => {
	if (!$key?.pub) return;
	const dex = new Dexie($key.pub) as DB;
	console.log('dex');
	dex.version(1.3).stores({
		proofs: 'secret,id,amount,C,status',
		// pendingProofs: 'secret,id,amount,C',
		// spentProofs: 'secret,id,amount,C',
		history: 'date,type,amount,data.mint,data.keyset,data.send,data.returnChange,data.encodedToken',
		contacts: 'pubkey,name,picture,about,createdAt,nip05',
		users: 'pubkey,name,picture,about,createdAt,nip05',
		dms: 'id,kind,tags,content,created_at,pubkey,token',
		notes:
			'id,kind,tags,content,reply_to,reply_to_pubkey,reposted_by,reposted_from,created_at,pubkey',
		reactions: 'id,kind,ref,created_at,pubkey',
		zaps: 'id,kind,ref,created_at,content,pubkey,amount',
		reposts: 'id,kind,ref,created_at,pubkey',
		keysets: 'id,unit,active,input_fee_ppk,mint',
		invoices: 'quote,request,date,mint',
		relays: 'url,enabled',
		mints: 'url,enabled',
		settings: 'key,visible,unit'
	});
	set(dex);
});

export const initialize = derived([db], async ([$db]) => {
	if (!browser) return;
	if (!$db) return;
	console.log('-------restoring------');
	await settings.restore($db.settings, {
		unit: 'sat',
		visible: true,
		zap: { message: 'freedom unleashed', amount: 21 }
	});
	await dmCache.restore($db.dms);
	await notesCache.restore($db.notes);
	await reactionsCache.restore($db.reactions);
	await repostsCache.restore($db.reposts);
	await zapsCache.restore($db.zaps);
	await historyCache.restore($db.history);
	await keysetsCache.restore($db.keysets);
	await contactsCache.restore($db.contacts);
	await usersCache.restore($db.users);
	await mintsCache.restore($db.mints, [
		{ url: 'https://mint.minibits.cash/Bitcoin', enabled: true },
		{ url: 'https://mint.lnserver.com/', enabled: true }
	]);
	await proofsCache.restore($db.proofs);
	console.log('--------restored-------');
});

export const settings = createTableCache('settings', get(db)?.settings);

export const keysetsCache = createCache<
	MintKeyset & { input_fee_ppk?: number; mint: string },
	'id'
>(get(db)?.keysets, 'id');

export const keysets = derived(
	[keysetsCache],
	([$keysetsCache], set) => {
		set(Array.from($keysetsCache.values()));
	},
	[] as (MintKeyset & { input_fee_ppk?: number; mint: string })[]
);

export const proofsCache = createCache<DbProof, 'secret'>(get(db)?.proofs);

export const proofs = derived(
	[proofsCache],
	([$proofsCache], set) => {
		set(Array.from($proofsCache.values()).filter((p) => p.status == Status.Confirmed));
	},
	[] as DbProof[]
);

export const pendingProofs = derived(
	[proofsCache],
	([$proofsCache], set) => {
		set(
			Array.from($proofsCache.values()).filter(
				(p) => p.status != Status.Spent && p.status != Status.Confirmed
			)
		);
	},
	[] as DbProof[]
);

export const spentProofs = derived(
	[proofsCache],
	([$proofsCache], set) => {
		set(Array.from($proofsCache.values()).filter((p) => p.status == Status.Spent));
	},
	[] as DbProof[]
);

export const invoices = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		liveQuery(() => $db.invoices.toArray()).subscribe((invoices) => {
			set(invoices);
		});
	},
	[] as Invoice[]
);

export const historyCache = createCache<HistoryItem<HistoryData>, 'date'>(get(db)?.history);

export const history = derived(
	[historyCache],
	([$historycache], set) => {
		// console.log('history', $historycache.values());
		set(Array.from($historycache.values()).sort((a, b) => b.date - a.date));
	},
	[] as HistoryItem<HistoryData>[]
);

export const contactsCache = createCache<Contact, 'pubkey'>(get(db)?.contacts);

export const contacts = derived(
	[contactsCache],
	([$contactsCache], set) => {
		set(Array.from($contactsCache.values()));
	},
	[] as Contact[]
);

export const usersCache = createCache<Contact, 'pubkey'>(get(db)?.users);

export const mintsCache = createCache<Endpoint, 'url'>(get(db)?.mints);

export const dbMints = derived(
	[mintsCache],
	([$mintsCache], set) => {
		set(Array.from($mintsCache.values()));
	},
	[] as Endpoint[]
);

export const dbRelays = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		// iniialize the new db with the original set of relay servers
		$db.relays.toArray().then((res) => {
			if (!res.length) {
				$db.relays.bulkAdd([
					{ url: 'wss://relay.damus.io', enabled: true },
					{ url: 'wss://nostr.einundzwanzig.space/', enabled: true },
					{ url: 'wss://relay.primal.net', enabled: true },
					{ url: 'wss://relay.nuts.cash', enabled: true }
				]);
			}
		});
		liveQuery(() => $db.relays.toArray()).subscribe((relays) => {
			// you need at least one relay
			if (relays.length) {
				set(relays);
			}
		});
	},
	[
		{ url: 'wss://relay.damus.io', enabled: true },
		{ url: 'wss://nostr.einundzwanzig.space/', enabled: true },
		{ url: 'wss://relay.primal.net', enabled: true },
		{ url: 'wss://relay.nuts.cash', enabled: true }
	] as Endpoint[]
);

export const dmCache = createCache<NostrEvent, 'id'>(get(db)?.dms);

export const notesCache = createCache<Note, 'id'>(get(db)?.notes);

export const notes = derived(
	[notesCache],
	([$notesCache], set) => {
		set(Array.from($notesCache.values()));
	},
	[] as NostrEvent[]
);

export const reactionsCache = createCache<Reaction, 'id'>(get(db)?.reactions);

// export const reactions = derived(
//   [reaction]
export const zapsCache = createCache<Zap, 'id'>(get(db)?.zaps);

export const repostsCache = createCache<Repost, 'id'>(get(db)?.reposts);

export type Preview = {
	url: string;
	title: string;
	siteName: string | undefined;
	description: string | undefined;
	mediaType: string;
	contentType: string | undefined;
	images: string[];
	videos: {
		url: string | undefined;
		secureUrl: string | null | undefined;
		type: string | null | undefined;
		width: string | undefined;
		height: string | undefined;
	}[];
	favicons: string[];
};

export const previewCache = createCache<Preview, 'url'>(undefined, 'url');

export const previews = derived([previewCache], ([$previewCache], set) => {
	set(Array.from($previewCache.values()));
});
