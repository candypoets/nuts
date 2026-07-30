// E2E: admin store workflow against a provisioned QA community (qa-bootstrap.mjs).
//   1. Injects the admin session + service base URL mapping
//   2. Creates a product through the store UI (unique run-suffixed name/section)
//   3. Asserts it renders AND that the relay holds the kind 30009 definition with
//      the expected tags (type=product, t=sellable, max_uses=1, price, section)
//   4. Edits the price through the UI; asserts the UI shows the new price AND the
//      relay replaced the addressable event at the SAME d with a newer created_at
//   5. Archives through the UI; asserts it leaves the "current" view, shows under
//      the Archived filter, and the relay's latest event is availability=archived
//      while keeping t=sellable
//
// Run: QA_STATE=/tmp/qa-community-store.json QA_DEV_PORT=5193 node .qa/qa-store-e2e.mjs
import {
	assert,
	browserAccount,
	ensureDevServer,
	launchBrowser,
	loadKeys,
	makePool,
	plantServiceBaseUrl,
	readCommunity,
	seedSession,
	sleep
} from './qa-lib.mjs';

const community = readCommunity();
assert(community?.relay_url, 'community state present (run qa-bootstrap.mjs --api first)');
const keys = loadKeys();
const RELAY = community.relay_url;
const pool = makePool();
const run = Math.floor(Date.now() / 1000).toString(36); // short unique suffix per run
const productName = `QA Brownie ${run}`;
const section = `QA Pastry ${run}`;
// The price input is type=number: Svelte binds it as a number, so trailing zeros
// are dropped before the tag is built (3.50 -> '3.5'). Use normalization-stable
// prices so the UI text and relay tag assertions match exactly.
const price1 = '3.75';
const price2 = '4.25';
const currency = 'EUR';

console.log('target relay:', RELAY, `(provisioned: ${community.name})`);

const tagValue = (event, name, index = 1) =>
	event.tags.find((tag) => tag[0] === name)?.[index];

async function catalogEventsForD(d) {
	return pool.querySync([RELAY], { kinds: [30009], authors: [keys.admin.pub], '#d': [d] });
}

// Relay propagation is not instant: poll querySync until `predicate` matches.
async function pollRelay(label, predicate, timeoutMs = 15000) {
	const deadline = Date.now() + timeoutMs;
	let lastEvents = [];
	while (Date.now() < deadline) {
		const events = await pool
			.querySync([RELAY], { kinds: [30009], authors: [keys.admin.pub] })
			.catch(() => []);
		lastEvents = events;
		const match = predicate(events);
		if (match) return match;
		await sleep(1000);
	}
	console.log('---- relay 30009 events at timeout ----');
	console.log(JSON.stringify(lastEvents, null, 2));
	throw new Error('RELAY ASSERT TIMED OUT: ' + label);
}

const latest = (events) =>
	events.reduce((a, b) => (!a || b.created_at > a.created_at ? b : a), undefined);

const BASE = await ensureDevServer();
const browser = await launchBrowser();

async function dismissNotice(page) {
	try {
		const dismiss = page.getByRole('button', { name: 'Dismiss payment setup notice' });
		await dismiss.first().waitFor({ state: 'visible', timeout: 5000 });
		await dismiss.first().click();
		console.log('   (dismissed the floating payment notice)');
	} catch {
		// notice not present — fine
	}
}

try {
	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	await context.addInitScript(seedSession, browserAccount(keys.admin));
	await context.addInitScript(plantServiceBaseUrl, community);
	const page = await context.newPage();
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
	const relayHost = new URL(RELAY.replace(/^ws/, 'http')).host;
	page.on('websocket', (ws) => {
		if (!ws.url().includes(relayHost)) return;
		ws.on('framesent', (frame) => {
			const payload = String(frame.payload || '');
			if (payload.includes('"EVENT"')) console.log('[ws tx EVENT]', payload.slice(0, 500));
		});
		ws.on('framereceived', (frame) => {
			const payload = String(frame.payload || '');
			if (payload.includes('"OK"')) console.log('[ws rx OK]', payload.slice(0, 300));
		});
	});
	page.on('dialog', (dialog) => {
		console.log('   (confirm dialog accepted:', dialog.message().slice(0, 80) + ')');
		dialog.accept();
	});

	// 1. Open the store page for the target community
	await page.goto(`${BASE}/admin/${encodeURIComponent(RELAY)}/store`, {
		waitUntil: 'networkidle'
	});
	await page.waitForSelector('text=Community catalog', { timeout: 30000 });
	assert(true, 'store page loaded');
	// Regression check: a bare 'store' path segment must NOT open the Pager's
	// 'store:<relay>' public-storefront sub-pane (it previously overlaid the
	// right half of the store manager and swallowed pointer events).
	assert(
		(await page.locator('[data-kind="sub"]').count()) === 0,
		'no phantom storefront sub-pane renders over the store manager'
	);
	assert(
		(await page.getByText('No offers yet').count()) === 0,
		'no public storefront empty-state text leaks into the admin page'
	);
	await dismissNotice(page);

	// 2. Create a product through the UI
	await page.getByRole('button', { name: /^Add / }).first().click();
	await page.waitForSelector('input[placeholder="Flat white"]', { timeout: 15000 });
	// Food products render in the menu presentation AND the catalog grid, so the
	// item card has the same aria-label buttons regardless of community preset.
	await page
		.locator('select')
		.filter({ has: page.locator('option[value="food"]') })
		.selectOption('food');
	await page.fill('input[placeholder="Flat white"]', productName);
	await page.fill('input[placeholder="4.50"]', price1);
	await page.fill('input[placeholder="Drinks"]', section);
	await page
		.locator('footer')
		.getByRole('button', { name: 'Add item', exact: true })
		.click();
	console.log('ok - submitted new product', productName);

	// All UI interaction is scoped to THIS run's item card: leftovers from earlier
	// crashed runs may still be listed, and unscoped .first() clicks hit them.
	// Catalog presentation renders items as <article>; the hospitality menu
	// presentation renders food/drink items as rows (div with h3 + action buttons).
	let card = page.locator('article').filter({ hasText: productName });
	const createdVisible = await card
		.first()
		.waitFor({ timeout: 45000 })
		.then(() => true)
		.catch(() => false);
	if (!createdVisible) {
		card = page
			.locator('div.flex.flex-col.gap-4.p-5')
			.filter({ hasText: productName });
	}
	const cardVisible = await card
		.first()
		.waitFor({ timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	if (!cardVisible) {
		console.log('---- main text at create failure ----');
		console.log(await page.locator('main').innerText().catch(() => '(none)'));
	}
	assert(cardVisible, 'created product renders in the store list');
	assert(await card.locator(`text=${price1}`).count(), 'initial price renders on the item card');

	// 3. Relay-level assertion: kind 30009 with the expected tags
	const created = await pollRelay(
		'created product on the relay',
		(events) => events.find((event) => tagValue(event, 'name') === productName)
	);
	const d = tagValue(created, 'd');
	assert(d, 'product event carries a d tag');
	assert(tagValue(created, 'type') === 'product', 'relay event has type=product');
	assert(
		created.tags.some((tag) => tag[0] === 't' && tag[1] === 'product'),
		'relay event has t=product'
	);
	assert(
		created.tags.some((tag) => tag[0] === 't' && tag[1] === 'sellable'),
		'relay event has t=sellable'
	);
	assert(tagValue(created, 'max_uses') === '1', 'relay event has max_uses=1');
	const priceTag = created.tags.find((tag) => tag[0] === 'price');
	assert(
		priceTag?.[1] === price1 && priceTag?.[2] === currency,
		`relay event has price tag [${price1}, ${currency}]`
	);
	assert(tagValue(created, 'section') === section, 'relay event has the entered section');
	assert(
		tagValue(created, 'availability') === 'available',
		'relay event has availability=available'
	);
	const createdAt = created.created_at;
	console.log('ok - relay holds the product at d =', d);

	// 4. Edit the price through the UI. The relay rejects a replacement whose
	// created_at equals the stored event's ("replaced: have newer event"), and the
	// app's publish path can emit the same-second created_at when create->edit
	// happens too fast (observed via WS sniff: both events carried identical
	// created_at). Cross a second boundary before each successive publish.
	await sleep(2100);
	await card.getByLabel('Edit item').first().click();
	await page.waitForSelector('text=Edit catalog item', { timeout: 15000 });
	await page.fill('input[placeholder="4.50"]', price2);
	await page.getByRole('button', { name: 'Save changes', exact: true }).click();
	console.log('ok - submitted price update', price1, '->', price2);

	const updatedVisible = await card
		.locator(`text=${price2}`)
		.first()
		.waitFor({ timeout: 45000 })
		.then(() => true)
		.catch(() => false);
	if (!updatedVisible) {
		console.log('---- page text at edit failure ----');
		console.log('url:', page.url());
		for (const [index, article] of (await page.locator('article').all()).entries()) {
			console.log(
				`article[${index}]:`,
				(await article.innerText().catch(() => '(err)')).slice(0, 200)
			);
		}
		await page.screenshot({ path: '/tmp/store-edit-debug.png' }).catch(() => {});
	}
	assert(updatedVisible, 'UI shows the new price after edit');
	assert(
		(await card.locator(`text=${price1}`).count()) === 0,
		'item card no longer shows the old price'
	);

	// Relay: same d, newer created_at, new price
	const replacement = await pollRelay(
		'price update replaced the event at the same d',
		(events) => {
			const candidates = events.filter(
				(event) => tagValue(event, 'd') === d && tagValue(event, 'price') === price2
			);
			return candidates.length ? latest(candidates) : undefined;
		}
	);
	assert(tagValue(replacement, 'd') === d, 'replacement keeps the same d tag');
	assert(
		replacement.created_at > createdAt,
		`replacement has newer created_at (${replacement.created_at} > ${createdAt})`
	);
	const newPriceTag = replacement.tags.find((tag) => tag[0] === 'price');
	assert(
		newPriceTag?.[1] === price2 && newPriceTag?.[2] === currency,
		'replacement carries the new price tag'
	);
	assert(tagValue(replacement, 'name') === productName, 'replacement keeps the product name');

	// 5. Archive through the UI (window.confirm is auto-accepted above). Same
	// second-boundary guard as before the edit: this is another publish at the
	// same d.
	await sleep(2100);
	await card.getByLabel('Archive item').first().click();
	const archivedHidden = await page
		.waitForSelector(`text=${productName}`, { state: 'detached', timeout: 45000 })
		.then(() => true)
		.catch(() => false);
	if (!archivedHidden) {
		console.log('---- main text at archive failure ----');
		console.log(await page.locator('main').innerText().catch(() => '(none)'));
	}
	assert(archivedHidden, 'archived product leaves the current items view');

	// It still shows under the Archived availability filter, marked archived.
	const availabilitySelect = page
		.locator('select')
		.filter({ has: page.locator('option', { hasText: 'Current items' }) });
	await availabilitySelect.selectOption('archived');
	const archivedCard = page.locator('article').filter({ hasText: productName });
	await archivedCard.first().waitFor({ timeout: 30000 });
	assert(
		await archivedCard.locator('text=archived').count(),
		'archived product shows under the Archived filter with an archived badge'
	);

	// Relay: latest event for d is archived, still sellable, newer than the edit.
	const archived = await pollRelay(
		'archived state on the relay',
		(events) => {
			const candidates = events.filter(
				(event) => tagValue(event, 'd') === d && tagValue(event, 'availability') === 'archived'
			);
			return candidates.length ? latest(candidates) : undefined;
		}
	);
	assert(
		archived.created_at > replacement.created_at,
		`archive has newer created_at (${archived.created_at} > ${replacement.created_at})`
	);
	assert(
		archived.tags.some((tag) => tag[0] === 't' && tag[1] === 'sellable'),
		'archived event keeps t=sellable'
	);
	const forD = await catalogEventsForD(d);
	assert(
		forD.every((event) => tagValue(event, 'availability') === 'archived'),
		'relay holds only the archived replacement for this d'
	);

	await page.screenshot({ path: '/tmp/store-final.png' });
	console.log('E2E PASS');
	await browser.close();
	pool.destroy([RELAY]);
	process.exit(0);
} catch (error) {
	console.error(String(error?.stack || error).slice(0, 1500));
	try {
		const pages = browser.contexts()[0]?.pages() || [];
		if (pages[0]) await pages[0].screenshot({ path: '/tmp/store-failure.png' });
		console.error('failure screenshot at /tmp/store-failure.png');
	} catch {}
	await browser.close().catch(() => {});
	pool.destroy([RELAY]);
	process.exit(1);
}
