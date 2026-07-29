import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG + '/playwright');
import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { readFileSync } from 'fs';

useWebSocketImplementation(WebSocket);
const BASE = 'http://localhost:5190';
const RELAY = 'ws://127.0.0.1:18082';
const keys = JSON.parse(readFileSync('/tmp/qa-keys.json', 'utf8'));
const pool = new SimplePool();

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => { if (m.text().startsWith('[orders]')) console.log(m.text()); });
page.on('websocket', (ws) => {
	if (!ws.url().includes('18082')) return;
	console.log('[ws open]', ws.url());
	ws.on('framereceived', (frame) => {
		const payload = String(frame.payload || '');
		console.log('[ws rx]', payload.slice(0, 100));
	});
});

await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.fill('input[placeholder="nsec or bunker url"]', keys.admin.nsec);
await page.click('button[type="submit"]');
await page.waitForFunction(
	() => JSON.parse(localStorage.getItem('key') || '{}').pub?.length === 64,
	{ timeout: 30000 }
);
await page.goto(`${BASE}/admin/${encodeURIComponent(RELAY)}/orders`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=QA Ramen', { timeout: 30000 });
console.log('dashboard loaded, publishing live order...');

const orderId = 'qa-order-live-' + Math.floor(Date.now() / 1000);
const liveAward = finalizeEvent(
	{
		kind: 8,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['a', `30009:${keys.admin.pub}:qa-ramen`],
			['p', keys.member2.pub],
			['order', orderId]
		],
		content: ''
	},
	hexToBytes(keys.admin.priv)
);
const res = await Promise.allSettled(pool.publish([RELAY], liveAward));
console.log('publish result:', res.map((r) => (r.status === 'fulfilled' ? 'ok' : String(r.reason))).join(','), orderId);
await page.waitForTimeout(45000);
const newText = await page.locator('main section').first().innerText();
console.log('---- New column ----');
console.log(newText);
await browser.close();
pool.destroy([RELAY]);
process.exit(0);
