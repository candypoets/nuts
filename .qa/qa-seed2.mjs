// Fix-up seed: member3 permanent award + proper RSVP with real event id.
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

async function publish(name, event, label) {
	const signed = finalizeEvent(event, sk(name));
	const results = await Promise.allSettled(pool.publish([RELAY], signed));
	console.log(`${label}: ${results.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason)).join(',')}`);
}

// member3: permanent award (expired awards are auto-deleted by strfry / NIP-40)
await publish('issuer', {
	kind: 8,
	created_at: now - 8 * DAY,
	tags: [['a', `30009:${pub('issuer')}:members`], ['p', pub('member3')]],
	content: ''
}, 'award member3 (permanent)');

// find the upcoming event to RSVP to
const events = await pool.querySync([RELAY], { kinds: [31923], limit: 10 });
const upcoming = events.filter((e) => {
	const start = Number(e.tags.find((t) => t[0] === 'start')?.[1] || 0);
	return start > now;
}).sort((a, b) => b.created_at - a.created_at)[0];

if (upcoming) {
	const d = upcoming.tags.find((t) => t[0] === 'd')?.[1];
	await new Promise((r) => setTimeout(r, 3000)); // let gate cache member3 award (member1 already cached)
	await publish('member1', {
		kind: 31925,
		created_at: now - 4 * DAY,
		tags: [
			['a', `31923:${upcoming.pubkey}:${d}`],
			['e', upcoming.id],
			['status', 'accepted']
		],
		content: ''
	}, 'RSVP member1 -> Going');
	await publish('member2', {
		kind: 31925,
		created_at: now - 3 * DAY,
		tags: [
			['a', `31923:${upcoming.pubkey}:${d}`],
			['e', upcoming.id],
			['status', 'tentative']
		],
		content: ''
	}, 'RSVP member2 -> Interested');
} else {
	console.log('no upcoming event found!');
}

const count8 = await pool.querySync([RELAY], { kinds: [8], limit: 100 });
const count30009 = await pool.querySync([RELAY], { kinds: [30009], limit: 100 });
const count31923 = await pool.querySync([RELAY], { kinds: [31923], limit: 100 });
console.log(`relay state: ${count8.length} awards, ${count30009.length} badge defs, ${count31923.length} events`);
pool.destroy([RELAY]);
process.exit(0);
