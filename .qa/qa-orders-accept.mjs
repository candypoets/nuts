// Focused test: Accept button moves order-1 from New to Accepted.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG + '/playwright');
import { readFileSync } from 'fs';

const BASE = 'http://localhost:5190';
const RELAY = 'ws://127.0.0.1:18082';
const keys = JSON.parse(readFileSync('/tmp/qa-keys.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
page.on('console', (msg) => {
	if (msg.type() === 'error' || msg.text().includes('orders')) console.log('[console]', msg.text().slice(0, 200));
});
page.on('websocket', (ws) => {
	if (!ws.url().includes('18082')) return;
	ws.on('framesent', (f) => {
		const p = String(f.payload || '');
		if (p.includes('EVENT')) console.log('[ws tx]', p.slice(0, 160));
	});
	ws.on('framereceived', (f) => {
		const p = String(f.payload || '');
		if (p.includes('37237') || p.includes('OK')) console.log('[ws rx]', p.slice(0, 160));
	});
});

await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.fill('input[placeholder="nsec or bunker url"]', keys.admin.nsec);
await page.click('button[type="submit"]');
await page.waitForFunction(
	() => JSON.parse(localStorage.getItem('key') || '{}').pub?.length === 64,
	{ timeout: 30000 }
);
console.log('ok - logged in');

await page.goto(`${BASE}/admin/${encodeURIComponent(RELAY)}/orders`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=QA Ramen', { timeout: 30000 });
await page.waitForTimeout(3000);

const newColumn = page.locator('main section').filter({ hasText: 'New' }).first();
const acceptedColumn = page.locator('main section').filter({ hasText: 'Accepted' }).first();
const order1 = newColumn.locator('article', { hasText: 'qa-order-ramen-1' }).first();
console.log('order-1 in New:', await order1.count());

await order1.locator('button', { hasText: 'Accept' }).click();
await page.waitForTimeout(6000);
const moved = await acceptedColumn.locator('article', { hasText: 'qa-order-ramen-1' }).count();
console.log('order-1 in Accepted after click:', moved);
await page.screenshot({ path: '/tmp/orders-accept.png' });
console.log(moved ? 'ACCEPT FLOW PASS' : 'ACCEPT FLOW FAIL');
await browser.close();
process.exit(moved ? 0 : 1);
