// E2E: admin Orders dashboard. Two modes:
//   - provisioned (default when qa-bootstrap.mjs has run): targets the fresh
//     relay from the QA community state file, signed by the bootstrap admin.
//   - legacy fixed relay: RELAY=ws://127.0.0.1:18082 KEYS_JSON=/tmp/qa-keys.json
//     (or just run without a community state file present).
//
//   1. Injects the admin session (deterministic; the UI login needs a kind-0
//      on default relays, which a freshly created account may not have yet)
//   2. Seeds a FRESH product + two orders for this run (unique suffix)
//   3. Opens /admin/<relay>/orders and verifies the seeded orders render in New
//   4. Publishes a NEW kind 8 award mid-session and verifies it appears live
//   5. Advances order-1 with the Accept button and verifies it moves to Accepted
//   6. Confirms the relay broadcast the addressable kind 37237 status.
//   7. Walks order-1 through the full kitchen progression via the UI buttons
//      (accepted -> processing -> ready -> fulfilled): after EACH step the card
//      must move to the next column AND the relay must broadcast a NEW kind
//      37237 with the expected status, the SAME award (e tag) and the SAME
//      ['order', orderId] context tag, signed by the admin.
//   8. Cancels order-2 via the UI: the relay must carry status=cancelled and
//      the card must leave the active queue (cancelled orders are listed
//      separately, struck through, below the board).
//   9. Regression: order-1 shows as Served and no longer counts as outstanding.
//
// Kind 8 awards are signed with the community admin key: the stock badge-gate
// accepts any event from a configured admin pubkey (crates/gate/src/main.rs).
import { existsSync } from 'fs';
import {
	assert,
	browserAccount,
	ensureDevServer,
	launchBrowser,
	loadKeys,
	makePool,
	randomKey,
	readCommunity,
	seedSession,
	signEvent,
	sleep
} from './qa-lib.mjs';

const community = readCommunity();
const legacyKeys = '/tmp/qa-keys.json';
const keys = loadKeys(
	process.env.KEYS_JSON || (community || !existsSync(legacyKeys) ? undefined : legacyKeys)
);
const RELAY = process.env.RELAY || community?.relay_url || 'ws://127.0.0.1:18082';
const pool = makePool();
const run = Math.floor(Date.now() / 1000).toString(36); // short unique suffix per run
const productD = `qa-ramen-${run}`;
const productAddress = `30009:${keys.admin.pub}:${productD}`;
const productName = `QA Ramen ${run}`;
const order1 = `o${run}-1`;
const order2 = `o${run}-2`;
const member1 = keys.member1?.pub ? keys.member1 : randomKey();
const member2 = keys.member2?.pub ? keys.member2 : randomKey();

console.log('target relay:', RELAY, community ? `(provisioned: ${community.name})` : '(fixed)');

const BASE = await ensureDevServer();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(seedSession, browserAccount(keys.admin));
const page = await context.newPage();
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));

// 1. Seed this run's product + orders (self-contained, no cross-run state)
// (qa-bootstrap.mjs --api plants the kind 30078 hospitality community profile
// itself; the orders page derives its archetype from it.)
await Promise.allSettled(
	pool.publish(
		[RELAY],
		signEvent(
			{
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
			},
			keys.admin.priv
		)
	)
);
// Keep the signed award events: their ids are the e tag every kind 37237
// status update for that order must carry.
const award1Event = signEvent(
	{
		kind: 8,
		tags: [
			['a', productAddress],
			['p', member1.pub],
			['order', order1]
		]
	},
	keys.admin.priv
);
const award2Event = signEvent(
	{
		kind: 8,
		tags: [
			['a', productAddress],
			['p', member2.pub],
			['order', order2]
		]
	},
	keys.admin.priv
);
await Promise.allSettled(pool.publish([RELAY], award1Event));
await Promise.allSettled(pool.publish([RELAY], award2Event));
console.log('ok - seeded product', productD, 'with orders', order1, order2);

// 2. Open the orders dashboard for the target community
await page.goto(`${BASE}/admin/${encodeURIComponent(RELAY)}/orders`, { waitUntil: 'networkidle' });
await page.waitForSelector(`text=${productName}`, { timeout: 30000 });
assert(await page.locator('h1', { hasText: 'Orders & kitchen' }).count(), 'hospitality queue title');

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

// 3. Simulate a fresh incoming order mid-session (what /redeem would issue after payment)
await page.waitForTimeout(3000); // let the live subscriptions settle
const order3 = `o${run}-3`;
const liveAward = signEvent(
	{
		kind: 8,
		tags: [
			['a', productAddress],
			['p', member2.pub],
			['order', order3]
		]
	},
	keys.admin.priv
);
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

// 4. Advance order-1: New -> Accepted via the Accept button.
// Kind 37237 is listened to live from Node to prove the relay accepted and
// broadcast the status event.
const seenStatuses = [];
const statusSub = pool.subscribeMany([RELAY], [{ kinds: [37237], authors: [keys.admin.pub] }], {
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

// 5. Confirm the relay broadcast the kind 37237 status event for order-1.
// The subscription stays open for the whole run: every progression step below
// must broadcast a NEW kind 37237 for the same award + order context.
await page.waitForTimeout(2000);
assert(
	seenStatuses.some(
		(event) =>
			event.kind === 37237 &&
			event.tags.some((t) => t[0] === 'status' && t[1] === 'accepted') &&
			event.tags.some((t) => t[0] === 'order' && t[1] === order1)
	),
	'accepted status event broadcast by the relay'
);

// Polls until the relay broadcast a kind 37237 with the expected status for
// this exact award (e tag) + ['order', orderId] context, signed by the admin.
// Returns the matching event (its created_at paces the next transition).
async function waitStatusBroadcast(status, awardId, orderId, timeoutMs = 20000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const found = seenStatuses.find(
			(event) =>
				event.kind === 37237 &&
				event.pubkey === keys.admin.pub &&
				event.tags.some((t) => t[0] === 'status' && t[1] === status) &&
				event.tags.some((t) => t[0] === 'e' && t[1] === awardId) &&
				event.tags.some((t) => t[0] === 'order' && t[1] === orderId)
		);
		if (found) return found;
		await sleep(250);
	}
	return undefined;
}

// Dumps the 37237 timeline for an order as wire-level evidence on failure.
function logStatusTimeline(orderId) {
	console.log(`---- relay 37237 timeline for ${orderId} ----`);
	for (const event of seenStatuses
		.filter((e) => e.tags.some((t) => t[0] === 'order' && t[1] === orderId))
		.sort((a, b) => a.created_at - b.created_at)) {
		const status = event.tags.find((t) => t[0] === 'status')?.[1];
		console.log(
			`id=${event.id.slice(0, 12)} kind=${event.kind} created_at=${event.created_at} status=${status}`
		);
	}
}

// Queue columns are matched via their h2 header: a plain section text filter
// for e.g. 'Preparing' would also match the Accepted column, whose card
// carries a "Start preparing" button.
const columnByHeader = (label) =>
	page.locator('main section', { has: page.locator('h2', { hasText: label }) });
const preparingColumn = columnByHeader('Preparing');
const readyColumn = columnByHeader('Ready to serve');
const servedColumn = columnByHeader('Served');

// 6. Walk order-1 through the full kitchen progression via the UI buttons:
// Accepted -> Preparing -> Ready to serve -> Served. After EACH step the card
// must land in the next column AND the relay must broadcast the new 37237
// status with the same award (e tag) and the same ['order', order1] context.
// The transitions are clicked through as fast as the UI allows - a regression
// check for the same-created_at-second tie-break bug (readers tie-break equal
// created_at by smallest event id; publishers must now keep created_at
// strictly monotonic per context via nextStatusCreatedAt).
const progression = [
	{ button: 'Start preparing', from: acceptedColumn, to: preparingColumn, status: 'processing' },
	{ button: 'Mark ready', from: preparingColumn, to: readyColumn, status: 'ready' },
	{ button: 'Mark served', from: readyColumn, to: servedColumn, status: 'fulfilled' }
];
for (const step of progression) {
	await step.from
		.locator('article', { hasText: order1 })
		.first()
		.locator('button', { hasText: step.button })
		.click();
	const moved = await step.to
		.locator('article', { hasText: order1 })
		.waitFor({ timeout: 30000 })
		.then(() => true)
		.catch(() => false);
	if (!moved) {
		console.log(`---- main text at ${step.status} failure ----`);
		console.log(
			await page
				.locator('main')
				.innerText()
				.catch(() => '(none)')
		);
		logStatusTimeline(order1);
	}
	assert(moved, `order-1 moved to ${step.status} column after "${step.button}"`);
	assert(
		await waitStatusBroadcast(step.status, award1Event.id, order1),
		`kind 37237 "${step.status}" broadcast: same award e tag + ['order', '${order1}'], admin-signed`
	);
}

// Rapid-click regression: the relay timeline for order-1 must carry the full
// accepted -> processing -> ready -> fulfilled chain with strictly monotonic
// created_at, so the latest status always wins regardless of event id.
const order1Chain = seenStatuses
	.filter(
		(event) =>
			event.kind === 37237 && // kind-migration pin: chain must be 37237-only
			event.tags.some((t) => t[0] === 'e' && t[1] === award1Event.id) &&
			event.tags.some((t) => t[0] === 'order' && t[1] === order1)
	)
	.sort((a, b) => a.created_at - b.created_at);
const order1Statuses = order1Chain.map((event) => event.tags.find((t) => t[0] === 'status')?.[1]);
if (!['accepted', 'processing', 'ready', 'fulfilled'].every((s) => order1Statuses.includes(s))) {
	logStatusTimeline(order1);
}
assert(
	['accepted', 'processing', 'ready', 'fulfilled'].every((s) => order1Statuses.includes(s)),
	'relay holds the full accepted->processing->ready->fulfilled chain for order-1'
);
const createdAts = order1Chain.map((event) => event.created_at);
const monotonic = createdAts.every((value, index) => index === 0 || value > createdAts[index - 1]);
if (!monotonic) logStatusTimeline(order1);
assert(monotonic, 'order-1 status created_at strictly monotonic per order context');

// 7. Fulfilled regression: order-1 shows as Served (hospitality language for
// fulfilled) and no longer counts as outstanding - absent from every active
// column, and its card exposes no further action buttons.
await page.waitForTimeout(1000); // let the board settle after the last move
assert(
	await servedColumn.locator('article', { hasText: order1 }).count(),
	'order-1 shows as Served after fulfillment'
);
for (const [label, active] of [
	['New', newColumn],
	['Accepted', acceptedColumn],
	['Preparing', preparingColumn],
	['Ready to serve', readyColumn]
]) {
	assert(
		(await active.locator('article', { hasText: order1 }).count()) === 0,
		`order-1 no longer outstanding in the ${label} column`
	);
}
assert(
	(await servedColumn.locator('article', { hasText: order1 }).first().locator('button').count()) ===
		0,
	'fulfilled order-1 card exposes no further actions'
);

// 8. Cancel order-2 from New via the cancel button. The relay must carry a
// 37237 status=cancelled (same award e tag + order context), and the card must
// leave the active queue: cancelled orders render in a separate struck-through
// section that shows the product name but NOT the order ref, so the order id
// text disappearing from <main> proves it left the board.
await newColumn
	.locator('article', { hasText: order2 })
	.first()
	.locator('button[aria-label="Cancel order"]')
	.click();
await page
	.waitForSelector(`main article:has-text("${order2}")`, { state: 'detached', timeout: 30000 })
	.catch(() => {});
assert(
	(await page.locator('main article', { hasText: order2 }).count()) === 0,
	'cancelled order-2 left the active board'
);
const cancelledListed = await columnByHeader('Cancelled')
	.locator('article', { hasText: productName })
	.waitFor({ timeout: 30000 })
	.then(() => true)
	.catch(() => false);
assert(cancelledListed, 'cancelled order-2 listed under Cancelled (struck through)');
assert(
	await waitStatusBroadcast('cancelled', award2Event.id, order2),
	`kind 37237 "cancelled" broadcast: same award e tag + ['order', '${order2}'], admin-signed`
);

// Tally every status event seen per kind as wire-level evidence.
const kindTally = seenStatuses.reduce((acc, e) => ((acc[e.kind] = (acc[e.kind] || 0) + 1), acc), {});
console.log('status events by kind:', JSON.stringify(kindTally));

statusSub.close();

await page.screenshot({ path: '/tmp/orders-final.png' });
await browser.close();
pool.destroy([RELAY]);
console.log('E2E PASS');
process.exit(0);
