// Seed the QA strfry-badge relay with members, roles, profiles, events.
import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { readFileSync } from 'fs';

useWebSocketImplementation(WebSocket);

const RELAY = 'ws://127.0.0.1:18082';
const keys = JSON.parse(readFileSync('/tmp/qa-keys.json', 'utf8'));
const sk = (k) => hexToBytes(keys[k].priv);
const pub = (k) => keys[k].pub;

const now = Math.floor(Date.now() / 1000);
const DAY = 86400;
const pool = new SimplePool();

function pub_(name, event) {
	const signed = finalizeEvent(event, sk(name));
	return pool.publish([RELAY], signed);
}

async function publish(name, event, label) {
	const results = await Promise.allSettled(pub_(name, event));
	const state = results.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason)).join(',');
	console.log(`${label}: ${state}`);
}

const badgeAddr = `30009:${pub('issuer')}:members`;

// 1. Badge/role definitions
await publish('issuer', {
	kind: 30009,
	created_at: now - 10 * DAY,
	tags: [['d', 'members'], ['name', 'Member'], ['type', 'membership'], ['description', 'Community membership']],
	content: ''
}, 'badge def: members (issuer)');

await publish('admin', {
	kind: 30009,
	created_at: now - 9 * DAY,
	tags: [['d', 'coach'], ['name', 'Coach'], ['description', 'Can create events and post'], ['permission', 'posts'], ['permission', 'media'], ['permission', 'events']],
	content: ''
}, 'role def: coach (admin)');

await publish('admin', {
	kind: 30009,
	created_at: now - 9 * DAY,
	tags: [['d', 'greeter'], ['name', 'Greeter'], ['description', 'Welcomes new members'], ['permission', 'posts']],
	content: ''
}, 'role def: greeter (admin)');

// 2. Membership awards (issuer -> members)
await publish('issuer', {
	kind: 8,
	created_at: now - 8 * DAY,
	tags: [['a', badgeAddr], ['p', pub('member1')]],
	content: ''
}, 'award member1 (permanent)');

await publish('issuer', {
	kind: 8,
	created_at: now - 8 * DAY,
	tags: [['a', badgeAddr], ['p', pub('member2')], ['expiration', String(now + 10 * DAY)]],
	content: ''
}, 'award member2 (expiring soon)');

await publish('issuer', {
	kind: 8,
	created_at: now - 8 * DAY,
	tags: [['a', badgeAddr], ['p', pub('member3')], ['expiration', String(now - DAY)]],
	content: ''
}, 'award member3 (expired)');

// give the gate a moment to ingest awards into its membership cache
await new Promise((r) => setTimeout(r, 3000));

// 3. Profiles (admin + active members)
await publish('admin', {
	kind: 0,
	created_at: now - 7 * DAY,
	tags: [],
	content: JSON.stringify({ name: 'QA Admin', about: 'Admin of the QA test community' })
}, 'profile admin');

await publish('member1', {
	kind: 0,
	created_at: now - 7 * DAY,
	tags: [],
	content: JSON.stringify({ name: 'Alice Anders', about: 'First member', nip05: 'alice@example.com' })
}, 'profile member1 (Alice)');

await publish('member2', {
	kind: 0,
	created_at: now - 7 * DAY,
	tags: [],
	content: JSON.stringify({ name: 'Bob Berg', about: 'Second member' })
}, 'profile member2 (Bob)');

// 4. Role award: admin -> member1 as Coach
await publish('admin', {
	kind: 8,
	created_at: now - 6 * DAY,
	tags: [['a', `30009:${pub('admin')}:coach`], ['p', pub('member1')]],
	content: ''
}, 'role award member1=Coach');

// 5. Calendar events (kind 31923) published by admin
const eventD = 'saturday-training-' + now;
await publish('admin', {
	kind: 31923,
	created_at: now - 5 * DAY,
	tags: [
		['d', eventD],
		['title', 'Saturday training'],
		['summary', 'Weekly training session'],
		['start', String(now + 2 * DAY)],
		['end', String(now + 2 * DAY + 5400)],
		['t', 'training'],
		['location', 'Club field'],
		['capacity', '24'],
		['access', 'open']
	],
	content: 'Weekly training session'
}, 'event: Saturday training (upcoming)');

await publish('admin', {
	kind: 31923,
	created_at: now - 20 * DAY,
	tags: [
		['d', 'old-meeting-' + now],
		['title', 'Spring meeting'],
		['summary', 'Past seasonal meeting'],
		['start', String(now - 15 * DAY)],
		['end', String(now - 15 * DAY + 3600)],
		['t', 'meeting'],
		['location', 'Clubhouse'],
		['access', 'open']
	],
	content: 'Past seasonal meeting'
}, 'event: Spring meeting (past)');

// 6. RSVP from member1 (Going) to the upcoming event
await publish('member1', {
	kind: 31925,
	created_at: now - 4 * DAY,
	tags: [
		['a', `31923:${pub('admin')}:${eventD}`],
		['e', ''],
		['status', 'accepted']
	],
	content: ''
}, 'RSVP member1 -> Going');

pool.destroy([RELAY]);
console.log('seed complete');
process.exit(0);
