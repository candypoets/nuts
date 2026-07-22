// Quick relay query: node .qa/qa-query.mjs '<filter-json>'
import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';

useWebSocketImplementation(WebSocket);
const pool = new SimplePool();
const filter = JSON.parse(process.argv[2] || '{}');
const RELAY = process.env.RELAY || 'ws://127.0.0.1:18082';
const events = await pool.querySync([RELAY], filter, { maxWait: 4000 });
console.log('count:', events.length);
for (const e of events.slice(0, 20)) {
	const d = e.tags.find((t) => t[0] === 'd')?.[1] || '';
	const name = e.tags.find((t) => t[0] === 'name')?.[1] || '';
	let content = e.content || '';
	try { content = JSON.parse(content).name || content.slice(0, 60); } catch { content = content.slice(0, 60); }
	console.log(`kind=${e.kind} author=${e.pubkey.slice(0, 8)} d=${d} name=${name} content=${content} created=${e.created_at}`);
}
pool.destroy([RELAY]);
process.exit(0);
