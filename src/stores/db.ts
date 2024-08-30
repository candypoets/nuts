import Dexie, { liveQuery, type EntityTable } from 'dexie';
import { derived, writable, type Readable, type Writable } from 'svelte/store';
import type { MintKeyset, Proof, RequestMintResponse } from '@cashu/cashu-ts';
import type { HistoryItem } from 'src/model/historyItem';
import type { HistoryData } from 'src/model/data/HistoryData';
import type { Contact } from 'src/model/contact';
import type { NostrMessage } from 'src/model/nostrMessage';

export type Invoice = RequestMintResponse & { date: number; mint: string };

export type Endpoint = {
	url: string;
	enabled: boolean;
};

export type Setting = {
	key: string;
	visible: boolean;
	unit: 'sat' | 'btc' | 'usd' | 'eur';
};

export type Key = {
	pub: string;
	npub: string;
	priv?: string;
	nsec?: string;
};

export type DB = Dexie & {
	proofs: EntityTable<Proof, 'secret'>;
	pendingProofs: EntityTable<Proof, 'secret'>;
	spentProofs: EntityTable<Proof, 'secret'>;
	history: EntityTable<HistoryItem<HistoryData>, 'date'>;
	contacts: EntityTable<Contact, 'pubkey'>;
	messages: EntityTable<NostrMessage & { id: string }, 'id'>;
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

export const keys: Writable<Key[]> = writable([]);

liveQuery(() => {
	console.log('liveQuery');
	keyDB.keys
		.toArray()
		.then((res) => {
			console.log('ok', res);
			keys.set(res);
		})
		.catch((e) => console.error(e));
}).subscribe();

export const key: Readable<Key | undefined> = derived(
	[keys, activeAccount],
	([$keys, $activeAccount], set) => {
		set($keys[$activeAccount]);
	}
);

export const db: Readable<DB> = derived([activeAccount, keys], ([$activeAccount, $keys], set) => {
	if (!$keys[$activeAccount]?.pub) return;
	const dex = new Dexie($keys[$activeAccount]?.pub) as DB;
	console.log('dex');
	dex.version(1).stores({
		proofs: 'secret,id,amount,C',
		pendingProofs: 'secret,id,amount,C',
		spentProofs: 'secret,id,amount,C',
		history: 'date,type,amount,data.mint,data.keyset,data.send,data.returnChange,data.encodedToken',
		contacts: 'pubkey,name,picture,about,createdAt',
		messages:
			'++id,event.id,event.kind,event.tags,event.content,event.created_at,event.pubkey,event.sig,token.proofs,token.mint,token.memo,isAccepted',
		keysets: 'id,unit,active,input_fee_ppk,mint',
		invoices: 'quote,request,date,mint',
		relays: 'url, enabled',
		mints: 'url, enabled',
		keys: 'pub,npub,priv,nsec',
		settings: 'key,visible,unit'
	});
	set(dex);
});

export const proofs = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		liveQuery(() => $db.proofs.toArray()).subscribe((proofs) => {
			set(proofs);
		});
	},
	[] as Proof[]
);

export const pendingProofs = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		liveQuery(() => $db.pendingProofs.toArray()).subscribe((proofs) => {
			set(proofs);
		});
	},
	[] as Proof[]
);

export const spentProofs = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		liveQuery(() => $db.spentProofs.toArray()).subscribe((proofs) => {
			set(proofs);
		});
	},
	[] as Proof[]
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

export const history = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		liveQuery(() => $db.history.toArray()).subscribe((history) => {
			set(history.sort((a, b) => b.date - a.date));
		});
	},
	[] as HistoryItem<HistoryData>[]
);

export const contacts = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		liveQuery(() => $db.contacts.toArray()).subscribe((contacts) => {
			set(contacts);
		});
	},
	[] as Contact[]
);

export const dbMints = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		// iniialize the new db with the original set of mints servers
		$db.mints.toArray().then((res) => {
			if (!res.length) {
				$db.mints.bulkAdd([
					{ url: 'https://mint.minibits.cash/Bitcoin', enabled: true },
					{ url: 'https://mint.lnserver.com/', enabled: true }
				]);
			}
		});
		liveQuery(() => $db.mints.toArray()).subscribe((mints) => {
			// you need at least one mint
			if (mints.length) {
				set(mints);
			}
		});
	},
	[
		{ url: 'https://mint.minibits.cash/Bitcoin', enabled: true },
		{ url: 'https://mint.lnserver.com/', enabled: true }
	] as Endpoint[]
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

export const settings = derived(
	[db],
	([$db], set) => {
		if (!$db) return;
		liveQuery(() => $db.settings.get('settings')).subscribe((settings) => {
			if (settings) {
				set(settings);
			}
		});
	},
	{ key: 'settings', visible: true, unit: 'sat' } as Setting
);
