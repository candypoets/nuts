import Dexie, { liveQuery, type EntityTable } from 'dexie';
import { derived, type Readable } from 'svelte/store';
import { nostrPubKey } from './nostr';
import type { Proof, RequestMintResponse } from '@cashu/cashu-ts';
import type { HistoryItem } from 'src/model/historyItem';
import type { HistoryData } from 'src/model/data/HistoryData';
import type { Contact } from 'src/model/contact';
import type { NostrMessage } from 'src/model/nostrMessage';

export type Invoice = RequestMintResponse & { date: number; mint: string };

export type Setting = {
	visible: boolean;
	units: 'sats' | 'btc' | 'usd';
};

export type DB = Dexie & {
	proofs: EntityTable<Proof, 'secret'>;
	pendingProofs: EntityTable<Proof, 'secret'>;
	spentProofs: EntityTable<Proof, 'secret'>;
	history: EntityTable<HistoryItem<HistoryData>, 'date'>;
	contacts: EntityTable<Contact, 'pubkey'>;
	messages: EntityTable<NostrMessage & { id: string }, 'id'>;
	keysets: EntityTable<{ id: string; mint: string }, 'id'>;
	invoices: EntityTable<Invoice, 'quote'>;
	settings: EntityTable<Setting, 'visible'>;
};

export const db: Readable<DB> = derived([nostrPubKey], ([pubkey], set) => {
	if (!pubkey) return;
	const dex = new Dexie(pubkey) as DB;
	console.log('dex');
	dex.version(1).stores({
		proofs: 'secret,id,amount,C',
		pendingProofs: 'secret,id,amount,C',
		spentProofs: 'secret,id,amount,C',
		history: 'date,type,amount,data.mint,data.keyset,data.send,data.returnChange,data.encodedToken',
		contacts: 'pubkey,name,picture,about,createdAt',
		messages:
			'++id,event.id,event.kind,event.tags,event.content,event.created_at,event.pubkey,event.sig,token.proofs,token.mint,token.memo,isAccepted',
		keysets: 'id,mint',
		invoices: 'quote,request,date,mint'
	});

	set(dex);
});

export const proofs = derived(
	[db],
	([$db], set) => {
		if (!$db) set([]);
		liveQuery(() => $db.proofs.toArray()).subscribe((proofs) => {
			set(proofs);
		});
	},
	[] as Proof[]
);

export const pendingProofs = derived(
	[db],
	([$db], set) => {
		if (!$db) set([]);
		liveQuery(() => $db.pendingProofs.toArray()).subscribe((proofs) => {
			set(proofs);
		});
	},
	[] as Proof[]
);

export const spentProofs = derived(
	[db],
	([$db], set) => {
		if (!$db) set([]);
		liveQuery(() => $db.spentProofs.toArray()).subscribe((proofs) => {
			set(proofs);
		});
	},
	[] as Proof[]
);

export const invoices = derived(
	[db],
	([$db], set) => {
		if (!$db) set([]);
		liveQuery(() => $db.invoices.toArray()).subscribe((invoices) => {
			set(invoices);
		});
	},
	[] as Invoice[]
);

export const history = derived(
	[db],
	([$db], set) => {
		if (!$db) set([]);
		liveQuery(() => $db.history.toArray()).subscribe((history) => {
			set(history.sort((a, b) => b.date - a.date));
		});
	},
	[] as HistoryItem<HistoryData>[]
);

export const contacts = derived(
	[db],
	([$db], set) => {
		if (!$db) set([]);
		liveQuery(() => $db.contacts.toArray()).subscribe((contacts) => {
			set(contacts);
		});
	},
	[] as Contact[]
);
