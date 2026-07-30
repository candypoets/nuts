// Seed the QA relay with a hospitality community profile, a sellable product,
// and an incoming order (kind 8 award) so the admin Orders dashboard has data.
// Usage: node .qa/qa-orders-seed.mjs
import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { readFileSync } from 'fs';

useWebSocketImplementation(WebSocket);

const RELAY = process.env.RELAY || 'ws://127.0.0.1:18082';
const keys = JSON.parse(readFileSync('/tmp/qa-keys.json', 'utf8'));
const sk = (k) => hexToBytes(keys[k].priv);
const pub = (k) => keys[k].pub;

const now = Math.floor(Date.now() / 1000);
const pool = new SimplePool();

async function publish(name, event, label) {
	const signed = finalizeEvent(event, sk(name));
	const results = await Promise.allSettled(pool.publish([RELAY], signed));
	console.log(`${label}: ${results.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason)).join(',')}`);
}

const productAddress = `30009:${pub('admin')}:qa-ramen`;

// 1. Community profile: hospitality archetype (drives the kitchen-queue orders view)
await publish('admin', {
	kind: 30078,
	created_at: now,
	tags: [
		['d', 'nuts-community-profile'],
		['type', 'hospitality'],
		['description', 'QA hospitality community']
	],
	content: ''
}, 'community profile (hospitality)');

// 2. Sellable product definition (kind 30009)
await publish('admin', {
	kind: 30009,
	created_at: now,
	tags: [
		['d', 'qa-ramen'],
		['type', 'product'],
		['t', 'product'],
		['t', 'sellable'],
		['name', 'QA Ramen'],
		['description', 'Test bowl for the orders dashboard'],
		['price', '12.50', 'EUR'],
		['position', '0'],
		['availability', 'available'],
		['product_kind', 'food'],
		['max_uses', '1'],
		['section', 'Mains'],
		['r', RELAY]
	],
	content: ''
}, 'product def: QA Ramen');

// 3. Incoming order: kind 8 award for member1, signed by the relay authority
//    (this relay has no /community/info badge_issuer, so the authority signs).
await publish('admin', {
	kind: 8,
	created_at: now,
	tags: [
		['a', productAddress],
		['p', pub('member1')],
		['order', 'qa-order-ramen-1']
	],
	content: ''
}, 'order award: member1 -> QA Ramen');

// 4. A second order already in progress, to exercise the "Accepted" column.
const award2 = finalizeEvent({
	kind: 8,
	created_at: now - 600,
	tags: [
		['a', productAddress],
		['p', pub('member2')],
		['order', 'qa-order-ramen-2']
	],
	content: ''
}, sk('admin'));
await Promise.allSettled(pool.publish([RELAY], award2)).then((r) =>
	console.log(`order award: member2 -> QA Ramen: ${r.map((x) => (x.status === 'fulfilled' ? 'ok' : x.reason)).join(',')}`)
);
await publish('admin', {
	kind: 37237,
	created_at: now - 300,
	tags: [
		['status', 'accepted'],
		['a', productAddress],
		['e', award2.id],
		['p', pub('member2')],
		['order', 'qa-order-ramen-2'],
		['d', 'order:qa-order-ramen-2']
	],
	content: ''
}, 'status: order-2 accepted');

const counts = await pool.querySync([RELAY], { kinds: [8, 30009, 37237], limit: 100 });
console.log(`relay now holds ${counts.length} commerce events`);
pool.destroy([RELAY]);
process.exit(0);
