// E2E: scan / check-in workflow (fulfill a badge award by scanning the
// holder's QR) against a provisioned QA community (see .qa/README.md).
//
//   1. Injects the admin session + service base URL mapping
//   2. Seeds a FRESH drink product (kind 30009, QR-fulfillment eligible) and a
//      kind 8 award held by a random member, with an `order` context tag
//   3. Builds the exact QR payload the member's app would present: a signed
//      kind 27236 entitlement presentation (src/lib/presentation.ts), encoded
//      as `nuts:present:<base64url(json)>` and rendered into a QR image
//   4. Opens /home/scan with a fake camera: navigator.mediaDevices.getUserMedia
//      is replaced by an init script that returns a canvas stream painting the
//      QR (headless Chromium has no camera; the scanner is camera-only via
//      html5-qrcode — src/routes/modals/scan.svelte)
//   5. Waits for the confirmation step, clicks "Mark served", and asserts the
//      admitted state ("Order marked as served.")
//   6. Relay-level: polls for the kind 37237 status=fulfilled event (e = award
//      id, order = order id, authored by the admin)
//   7. UI-level: the orders dashboard moves the order to the fulfilled column
//      (Served/Checked in/Collected, depending on community type), i.e. the
//      award is no longer outstanding
//
// Screenshots: /tmp/scan-final.png (success), /tmp/scan-failure.png (failure).
import { createRequire } from 'module';
import {
	assert,
	browserAccount,
	ensureDevServer,
	launchBrowser,
	loadKeys,
	makePool,
	plantServiceBaseUrl,
	randomKey,
	readCommunity,
	seedSession,
	signEvent,
	sleep
} from './qa-lib.mjs';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');

const community = readCommunity();
if (!community) throw new Error('no community state file — run qa-bootstrap.mjs --api first');
const keys = loadKeys();
const RELAY = community.relay_url;
const pool = makePool();
const run = Math.floor(Date.now() / 1000).toString(36); // short unique suffix per run
const productD = `qa-scan-${run}`;
const productAddress = `30009:${keys.admin.pub}:${productD}`;
const productName = `QA Matcha ${run}`;
const orderId = `o${run}-scan`;
const member = randomKey();

console.log('target relay:', RELAY, `(provisioned: ${community.name})`);

// --- Seed: product definition + award ----------------------------------------
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
					['product_kind', 'drink'], // drink/food products use QR fulfillment (catalogUsesQrFulfillment)
					['name', productName],
					['description', 'E2E product for the scan check-in workflow'],
					['price', '4.50', 'EUR'],
					['availability', 'available'],
					['max_uses', '1'],
					['section', 'Drinks']
				]
			},
			keys.admin.priv
		)
	)
);
const award = signEvent(
	{
		kind: 8,
		tags: [
			['a', productAddress],
			['p', member.pub],
			['order', orderId]
		]
	},
	keys.admin.priv
);
await Promise.allSettled(pool.publish([RELAY], award));
console.log('ok - seeded product', productD, 'with award', award.id.slice(0, 12), 'order', orderId);

// --- QR payload: signed kind 27236 entitlement presentation ------------------
// Mirrors entitlementPresentationTemplate() + encodePresentation() in
// src/lib/presentation.ts (90s validity window — sign right before scanning).
function buildEntitlementQrPayload() {
	const createdAt = Math.floor(Date.now() / 1000);
	const presentation = signEvent(
		{
			kind: 27236,
			tags: [
				['type', 'nuts_entitlement_presentation'],
				['expiration', String(createdAt + 90)],
				['nonce', crypto.randomUUID()],
				['e', award.id],
				['a', productAddress],
				['r', RELAY],
				['order', orderId]
			]
		},
		member.priv
	);
	const base64url = Buffer.from(JSON.stringify(presentation), 'utf8')
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	return 'nuts:present:' + base64url;
}

// Geometry matters: scan.svelte sets html5-qrcode qrbox 250x250, and the
// library crops the center 250*(videoWidth/clientWidth) px of the video and
// scales it into a 250x250 decode canvas. The reader renders the video at
// ~800px, so an 800x800 fake stream gives a 1:1 center 250px crop; a scale=2
// QR (~210px for this ~925-char payload, low EC keeps the module count down)
// painted dead center is fully inside the crop and decodes in ~1s.
async function buildQrDataUrl() {
	const payload = buildEntitlementQrPayload();
	const dataUrl = await QRCode.toDataURL(payload, {
		errorCorrectionLevel: 'L',
		margin: 2,
		scale: 2
	});
	console.log('ok - built entitlement presentation QR (payload', payload.length, 'chars)');
	return dataUrl;
}

// Runs in the page: replaces the camera with a canvas stream painting the QR.
function fakeQrCamera(dataUrl) {
	const canvas = document.createElement('canvas');
	canvas.width = 800;
	canvas.height = 800;
	const ctx = canvas.getContext('2d');
	let ready = false;
	const img = new Image();
	img.onload = () => {
		ready = true;
	};
	img.src = dataUrl;
	function draw() {
		if (!ready) return;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(img, (800 - img.width) / 2, (800 - img.height) / 2);
	}
	setInterval(draw, 50);
	const original = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
	navigator.mediaDevices.getUserMedia = async (constraints) => {
		if (constraints && constraints.video) {
			const start = Date.now();
			while (!ready && Date.now() - start < 5000) await new Promise((r) => setTimeout(r, 50));
			draw();
			// Fresh stream per call: html5-qrcode stops the tracks on stop(), so a
			// reused stream would be dead when the scanner restarts (Scan next).
			return canvas.captureStream(15);
		}
		if (original) return original(constraints);
		throw new Error('fake camera: audio not supported');
	};
}

// The floating Stripe notice overlays buttons on admin screens.
async function dismissNotice(page) {
	try {
		const dismiss = page.getByRole('button', { name: 'Dismiss payment setup notice' });
		await dismiss.first().waitFor({ state: 'visible', timeout: 5000 });
		await dismiss.first().click();
		console.log('ok - dismissed the floating payment notice');
	} catch {
		// notice not present — fine
	}
}

async function pollStatusEvent(filter, timeoutMs = 15000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const events = await pool.querySync([RELAY], filter);
		if (events.length) return events;
		await sleep(1000);
	}
	return [];
}

const BASE = await ensureDevServer();
const browser = await launchBrowser();

try {
	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	await context.addInitScript(seedSession, browserAccount(keys.admin));
	await context.addInitScript(plantServiceBaseUrl, community);
	const t0 = Date.now();
	let page;

	function attachListeners(p) {
		p.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
		p.on('console', (msg) => {
			const text = msg.text();
			if (text.includes('[scan]'))
				console.log(`[console +${((Date.now() - t0) / 1000).toFixed(1)}s]`, text.slice(0, 200));
		});
	}

	// 1. Open the scanner as the admin (camera-only component, fed by the fake QR
	//    stream). Deliberately COLD: no warm-up page first — scan.svelte now
	//    resolves the entitlement after all subscription EOSEs (12s backstop),
	//    so the first scan attempt on a fresh page must succeed. The QR is
	//    signed fresh for each page (90s validity window); the newest
	//    addInitScript registration wins, so re-registering swaps the QR in.
	async function openScannerPage() {
		await context.addInitScript(fakeQrCamera, await buildQrDataUrl());
		if (page) await page.close().catch(() => {});
		page = await context.newPage();
		attachListeners(page);
		await page.goto(`${BASE}/home/scan`, { waitUntil: 'domcontentloaded' });
	}
	await openScannerPage();
	// Soft wait: detection can beat us to the verification view (where #reader is
	// hidden), so a miss here is not fatal — the outcome wait below is the real gate.
	const scannerVisible = await page
		.waitForSelector('#reader', { timeout: 20000 })
		.then(() => true)
		.catch(() => false);
	console.log(scannerVisible ? 'ok - scanner view visible' : 'ok - scanner already past the scan view');
	await dismissNotice(page);

	// 2. The QR should be detected, verified, and land on the confirmation step.
	//    product_kind=drink -> redemptionAction 'Mark served' (scan.svelte).
	//    A first-attempt rejection ("Scan next") is a hard failure — in
	//    particular the cold-cache "The entitlement could not be found" race
	//    that the EOSE-driven resolution fixed. The only retry allowed is a
	//    fresh page when there is no scan outcome at all (camera/decode flake,
	//    or vite's transient dynamic-import failure where the app never boots).
	const confirmButton = () => page.locator('button', { hasText: 'Mark served' });
	const waitScanOutcome = () =>
		Promise.race([
			confirmButton()
				.waitFor({ timeout: 45000 })
				.then(() => 'confirm')
				.catch(() => null),
			page
				.locator('button', { hasText: 'Scan next' })
				.waitFor({ timeout: 45000 })
				.then(() => 'rejected')
				.catch(() => null)
		]);
	const dumpBody = async (label) => {
		console.log(`---- body text ${label} ----`);
		console.log(
			await page
				.locator('body')
				.innerText()
				.catch(() => '(none)')
		);
	};

	let outcome = await waitScanOutcome();
	if (outcome === 'rejected') {
		await dumpBody('at first-attempt rejection');
		assert(false, 'first scan attempt rejected (must not happen since the EOSE fix)');
	}
	if (outcome !== 'confirm') {
		console.log('ok - no scan outcome within 45s; retrying once on a fresh page (flake guard)');
		await openScannerPage();
		outcome = await waitScanOutcome();
		if (outcome === 'rejected') {
			await dumpBody('at rejection after page retry');
			assert(false, 'scan attempt after page retry rejected');
		}
	}
	const confirming = outcome === 'confirm';
	if (!confirming) await dumpBody('at confirmation failure');
	assert(confirming, 'scan reached the fulfillment confirmation step');
	assert(await page.locator('h1', { hasText: productName }).count(), 'product name shown on confirm step');

	// 3. Confirm the fulfillment
	await confirmButton().first().click();
	const admitted = await page
		.waitForSelector('text=Order marked as served.', { timeout: 20000 })
		.then(() => true)
		.catch(() => false);
	if (!admitted) {
		console.log('---- body text at admitted failure ----');
		console.log(
			await page
				.locator('body')
				.innerText()
				.catch(() => '(none)')
		);
	}
	assert(admitted, 'UI confirmed the check-in (Order marked as served.)');
	assert(await page.locator('text=Served').count(), 'result label "Served" shown');

	// 4. Relay-level: the addressable kind 37237 status event exists on the relay.
	const statuses = await pollStatusEvent({ kinds: [37237], authors: [keys.admin.pub] });
	const fulfilled = statuses.find(
		(event) =>
			event.tags.some((t) => t[0] === 'status' && t[1] === 'fulfilled') &&
			event.tags.some((t) => t[0] === 'e' && t[1] === award.id) &&
			event.tags.some((t) => t[0] === 'order' && t[1] === orderId) &&
			event.tags.some((t) => t[0] === 'a' && t[1] === productAddress) &&
			event.tags.some((t) => t[0] === 'p' && t[1] === member.pub)
	);
	assert(fulfilled, 'relay stored kind 37237 status=fulfilled for the award (admin-signed)');

	// 5. UI-level: orders dashboard shows the order as fulfilled, no longer in New.
	//    The fulfilled column label depends on community type: 'Served'
	//    (hospitality), 'Checked in' (sports), 'Collected' (store) — orders.ts.
	await page.goto(`${BASE}/admin/${encodeURIComponent(RELAY)}/orders`, { waitUntil: 'networkidle' });
	await dismissNotice(page);
	const fulfilledColumn = page
		.locator('main section')
		.filter({ has: page.locator('h2', { hasText: /^(Served|Checked in|Collected)$/ }) })
		.first();
	const inFulfilledColumn = await fulfilledColumn
		.locator('article', { hasText: orderId })
		.waitFor({ timeout: 45000 })
		.then(() => true)
		.catch(() => false);
	if (!inFulfilledColumn) {
		console.log('---- main text at orders failure ----');
		console.log(
			await page
				.locator('main')
				.innerText()
				.catch(() => '(none)')
		);
	}
	assert(inFulfilledColumn, 'fulfilled order renders in the fulfilled (Served/Collected) column');
	const newColumn = page
		.locator('main section')
		.filter({ has: page.locator('h2', { hasText: 'New' }) })
		.first();
	assert(
		(await newColumn.locator('article', { hasText: orderId }).count()) === 0,
		'fulfilled order no longer outstanding in the New column'
	);

	await page.screenshot({ path: '/tmp/scan-final.png' });
	await browser.close();
	pool.destroy([RELAY]);
	console.log('E2E PASS');
	process.exit(0);
} catch (error) {
	console.error('FAIL:', error.message);
	try {
		const page = (await browser.contexts()[0]?.pages())?.[0];
		if (page) await page.screenshot({ path: '/tmp/scan-failure.png' });
	} catch {}
	await browser.close().catch(() => {});
	pool.destroy([RELAY]);
	process.exit(1);
}
