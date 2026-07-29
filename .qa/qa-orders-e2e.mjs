// E2E: admin Orders dashboard against the QA relay.
//   1. Logs in as the QA relay admin (kind0 must exist on a default relay - see .qa/README)
//   2. Seeds a FRESH product + two orders for this run (unique suffix, no cross-run state)
//   3. Opens /admin/<qa-relay>/orders and verifies the seeded orders render in New
//   4. Publishes a NEW kind 8 award mid-session and verifies it appears live
//   5. Advances order-1 with the Accept button and verifies it moves to Accepted
//
// Usage: PLAYWRIGHT_PKG=<path-to-playwright-node_modules> node .qa/qa-orders-e2e.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_PKG || 'playwright';
const { chromium } = require(playwrightPath + '/playwright');
import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import { readFileSync } from 'fs';

useWebSocketImplementation(WebSocket);

const BASE = process.env.BASE_URL || 'http://localhost:5190';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:18082';
const keys = JSON.parse(readFileSync('/tmp/qa-keys.json', 'utf8'));
const pool = new SimplePool();
const run = Math.floor(Date.now() / 1000).toString(36); // short unique suffix per run
const productD = `qa-ramen-${run}`;
const productAddress = `30009:${keys.admin.pub}:${productD}`;
const productName = `QA Ramen ${run}`;
const order1 = `o${run}-1`;
const order2 = `o${run}-2`;
const now = Math.floor(Date.now() / 1000);

function assert(condition, label) {
	if (!condition) throw new Error('ASSERT FAILED: ' + label);
	console.log('ok -', label);
}

function sign(template) {
	return finalizeEvent({ created_at: now, content: '', ...template }, hexToBytes(keys.admin.priv));
}

const browser = await chromium.launch({
	headless: true,
	args: [
		// nipworker's live-event path relies on sweeper timers inside workers;
		// headless Chromium can throttle those, which stalls live delivery.
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
		'--disable-backgrounding-occluded-windows',
		'--disable-features=IntensiveWakeUpThrottling'
	]
});
const page = await (
	await browser.newContext({ viewport: { width: 1600, height: 1000 } })
).newPage();
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));

// 1. Login
await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.fill('input[placeholder="nsec or bunker url"]', keys.admin.nsec);
await page.click('button[type="submit"]');
await page.waitForFunction(
	() => JSON.parse(localStorage.getItem('key') || '{}').pub?.length === 64,
	{ timeout: 30000 }
);
console.log('ok - logged in as QA admin');

// 2. Seed this run's product + orders (self-contained, no cross-run state)
await Promise.allSettled(
	pool.publish(
		[RELAY],
		sign({
			kind: 30009,
			tags: [
				['d', productD],
				['type', 'product'],
				['t', 'product'],
				['t', 'sellable'],
				['name', productName],
				['description', 'E2E product for the orders dashboard'],
				['price', '12.50', 'EUR'],
				['availability', 'available'],
				['max_uses', '1'],
				['section', 'Mains']
			]
		})
	)
);
await Promise.allSettled(
	pool.publish(
		[RELAY],
		sign({
			kind: 8,
			tags: [
				['a', productAddress],
				['p', keys.member1.pub],
				['order', order1]
			]
		})
	)
);
await Promise.allSettled(
	pool.publish(
		[RELAY],
		sign({
			kind: 8,
			tags: [
				['a', productAddress],
				['p', keys.member2.pub],
				['order', order2]
			]
		})
	)
);
console.log('ok - seeded product', productD, 'with orders', order1, order2);

// 3. Open the orders dashboard for the QA community
await page.goto(`${BASE}/admin/${encodeURIComponent(RELAY)}/orders`, { waitUntil: 'networkidle' });
await page.waitForSelector(`text=${productName}`, { timeout: 30000 });
assert(
	await page.locator('h1', { hasText: 'Orders & kitchen' }).count(),
	'hospitality queue title'
);

const newColumn = page.locator('main section').filter({ hasText: 'New' }).first();
const acceptedColumn = page.locator('main section').filter({ hasText: 'Accepted' }).first();
// Awards arrive after the catalog; wait for the derivation instead of racing it.
await page.waitForSelector(`article:has-text("${order1}")`, { timeout: 30000 });
assert(
	await newColumn.locator('article', { hasText: order1 }).count(),
	'seeded order-1 pending in New column'
);
assert(
	await newColumn.locator('article', { hasText: order2 }).count(),
	'seeded order-2 pending in New column'
);

// 4. Simulate a fresh incoming order mid-session (what /redeem would issue after payment)
await page.waitForTimeout(3000); // let the live subscriptions settle
const order3 = `o${run}-3`;
const liveAward = sign({
	kind: 8,
	tags: [
		['a', productAddress],
		['p', keys.member2.pub],
		['order', order3]
	]
});
await Promise.allSettled(pool.publish([RELAY], liveAward));
console.log('ok - published live order', order3);
const liveAppeared = await page
	.waitForSelector(`text=${order3}`, { timeout: 45000 })
	.then(() => true)
	.catch(() => false);
if (!liveAppeared) {
	console.log('---- main text at live-order failure ----');
	console.log(
		await page
			.locator('main')
			.innerText()
			.catch(() => '(none)')
	);
}
assert(liveAppeared, 'live order text appeared');
assert(
	await newColumn.locator('article', { hasText: order3 }).count(),
	'live order appeared in New column without reload'
);

// 5. Advance order-1: New -> Accepted via the Accept button.
// kind 27237 is ephemeral on this QA relay: listen live from Node to prove the
// relay accepted and broadcast the status event (it will not persist).
const seenStatuses = [];
const statusSub = pool.subscribeMany([RELAY], [{ kinds: [27237], authors: [keys.admin.pub] }], {
	onevent: (event) => seenStatuses.push(event)
});
await newColumn
	.locator('article', { hasText: order1 })
	.first()
	.locator('button', { hasText: 'Accept' })
	.click();
const movedToAccepted = await acceptedColumn
	.locator('article', { hasText: order1 })
	.waitFor({ timeout: 30000 })
	.then(() => true)
	.catch(() => false);
if (!movedToAccepted) {
	console.log('---- main text at accept failure ----');
	console.log(
		await page
			.locator('main')
			.innerText()
			.catch(() => '(none)')
	);
}
assert(movedToAccepted, 'order-1 moved to Accepted after publish');

// 6. Confirm the relay broadcast the kind 27237 status event for order-1
await page.waitForTimeout(2000);
statusSub.close();
assert(
	seenStatuses.some(
		(event) =>
			event.tags.some((t) => t[0] === 'status' && t[1] === 'accepted') &&
			event.tags.some((t) => t[0] === 'order' && t[1] === order1)
	),
	'accepted status event broadcast by the relay'
);

await page.screenshot({ path: '/tmp/orders-final.png' });
await browser.close();
pool.destroy([RELAY]);
console.log('E2E PASS');
process.exit(0);
