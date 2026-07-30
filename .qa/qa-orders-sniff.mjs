// Sniff: does a live 37237 EVENT frame reach the orders page on the provisioned
// relay, and does the board apply it? Publishes an 'accepted' status from Node
// for a seeded order and watches both the raw WS frames and the UI columns.
import {
	browserAccount,
	ensureDevServer,
	launchBrowser,
	loadKeys,
	makePool,
	randomKey,
	readCommunity,
	seedSession,
	signEvent
} from './qa-lib.mjs';

const community = readCommunity();
const keys = loadKeys();
const RELAY = process.env.RELAY || community.relay_url;
const relayHost = new URL(RELAY.replace('ws://', 'http://')).host;
const pool = makePool();
const run = Math.floor(Date.now() / 1000).toString(36);
const productD = `qa-sniff-${run}`;
const productAddress = `30009:${keys.admin.pub}:${productD}`;
const order1 = `s${run}-1`;
const member = randomKey();

const BASE = await ensureDevServer();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(seedSession, browserAccount(keys.admin));
const page = await context.newPage();
page.on('websocket', (ws) => {
	if (!ws.url().includes(relayHost)) return;
	console.log('[ws open]', ws.url());
	ws.on('framereceived', (frame) => {
		const payload = String(frame.payload || '');
		if (payload.includes('37237')) console.log('[ws rx 37237]', payload.slice(0, 220));
	});
	ws.on('framesent', (frame) => {
		const payload = String(frame.payload || '');
		if (payload.includes('37237') || payload.includes('REQ')) console.log('[ws tx]', payload.slice(0, 220));
	});
});
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));

// seed product + one order
await pool.publish(
	[RELAY],
	signEvent(
		{
			kind: 30009,
			tags: [
				['d', productD],
				['type', 'product'],
				['t', 'product'],
				['t', 'sellable'],
				['name', `QA Sniff ${run}`],
				['price', '5.00', 'EUR'],
				['availability', 'available'],
				['max_uses', '1']
			]
		},
		keys.admin.priv
	)
);
const award = signEvent(
	{
		kind: 8,
		tags: [
			['a', productAddress],
			['p', member.pub],
			['order', order1]
		]
	},
	keys.admin.priv
);
await pool.publish([RELAY], award);
console.log('seeded', productD, order1);

await page.goto(`${BASE}/admin/${encodeURIComponent(RELAY)}/orders`, { waitUntil: 'networkidle' });
await page.waitForSelector(`article:has-text("${order1}")`, { timeout: 30000 });
console.log('order visible; publishing accepted status from Node in 5s…');
await page.waitForTimeout(5000);

await pool.publish(
	[RELAY],
	signEvent(
		{
			kind: 37237,
			tags: [
				['status', 'accepted'],
				['a', productAddress],
				['e', award.id],
				['p', member.pub],
				['order', order1],
				['d', `order:${order1}`]
			]
		},
		keys.admin.priv
	)
);
console.log('published 37237 accepted for', order1);

for (const t of [5, 10, 20]) {
	await page.waitForTimeout(t === 5 ? 5000 : t === 10 ? 5000 : 10000);
	const accepted = await page
		.locator('main section')
		.filter({ hasText: 'ACCEPTED' })
		.first()
		.innerText()
		.catch(() => '(no ACCEPTED column)');
	console.log(`---- t+${t}s ACCEPTED column ----\n${accepted.slice(0, 300)}`);
}

await page.screenshot({ path: '/tmp/orders-sniff.png', fullPage: true });
await browser.close();
pool.destroy([RELAY]);
process.exit(0);
