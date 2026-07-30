// E2E: sports pass check-in workflow — a 10-session gym pass checked in ten
// times through the staff "Active passes" board, against a SPORTS provisioned
// QA community (run qa-bootstrap.mjs --type sports first; see .qa/README.md).
//
//   1. Injects the admin session + service base URL mapping, pins
//      admin/selectedRelayUrl (parallel runs share the admin key)
//   2. Seeds a kind 30009 pass definition (type=pass, t=sellable, max_uses=10)
//      and a kind 8 award held by a random member (admin-signed — the badge
//      gate accepts any event from a configured admin pubkey)
//   3. Opens /admin/<relay>/orders: sports communities get the check-ins view
//      ("Today's check-ins" + "Active passes", orders.ts ordersViewFor). The
//      pass card renders with "10 uses left".
//   4. Clicks "Check in" 10 times. Each click publishes kind 37237
//      status=fulfilled with a fresh ['order', 'checkin-<awardId>-<now>']
//      context (orders.ts checkInContextTag). The "N uses left" label only
//      decrements when the status round-trips through the live subscription
//      (and the button is disabled in publishingKeys meanwhile), so the
//      script waits for the text to actually change between clicks
//      (10 → 9 → … → 1).
//   5. After the 10th check-in the pass drops out of "Active passes"
//      (remainingAwardUses == 0) and "Today's check-ins" lists 10 cards.
//   6. Relay-level: 10 fulfilled checkin-<awardId>-* contexts exist for the
//      award, and the remainingAwardUses derivation (ported to plain events
//      below, mirroring src/lib/orders.ts) cross-checks to 0.
//   7. 11th check-in rejection: the holder's entitlement QR (fresh order
//      context) is scanned once more through the fake camera; the scanner
//      reports "This entitlement has no uses remaining." (scan.svelte
//      maxUses check). Enforcement is client-side — the relay itself would
//      accept an 11th admin-signed status.
//
// Screenshots: /tmp/passes-final.png (success), /tmp/passes-failure.png (failure).
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
if (!community) throw new Error('no community state file — run qa-bootstrap.mjs --type sports first');
const keys = loadKeys();
const RELAY = community.relay_url;
const pool = makePool();
const run = Math.floor(Date.now() / 1000).toString(36); // short unique suffix per run
const passD = `qa-pass-${run}`;
const passAddress = `30009:${keys.admin.pub}:${passD}`;
const passName = `QA 10-Session Pass ${run}`;
const MAX_USES = 10;
const member = randomKey();

console.log('target relay:', RELAY, `(provisioned: ${community.name}, type: ${community.type || 'unknown'})`);
if (community.type && community.type !== 'sports') {
	console.log(`warn - community type is "${community.type}", not sports — the check-ins view only`);
	console.log('warn - renders for sports communities (qa-bootstrap.mjs --type sports)');
}

// --- Seed: pass definition + award -------------------------------------------
await Promise.allSettled(
	pool.publish(
		[RELAY],
		signEvent(
			{
				kind: 30009,
				tags: [
					['d', passD],
					['type', 'pass'],
					['t', 'pass'],
					['t', 'sellable'],
					['name', passName],
					['description', 'E2E pass for the 10-session check-in workflow'],
					['price', '60.00', 'EUR'],
					['availability', 'available'],
					['max_uses', String(MAX_USES)],
					['section', 'Passes']
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
			['a', passAddress],
			['p', member.pub]
		]
	},
	keys.admin.priv
);
await Promise.allSettled(pool.publish([RELAY], award));
console.log('ok - seeded pass', passD, 'with award', award.id.slice(0, 12), 'for member', member.pub.slice(0, 12));

// --- remainingAwardUses derivation, ported to plain events ---------------------
// Faithful port of src/lib/orders.ts (fulfilledUseCount/remainingAwardUses) and
// src/routes/notifications/notifications.ts (latestStatusEvents) to plain
// {kind, tags, created_at, id} events — the relay-level cross-check that the
// client-side "N uses left" math agrees with what the relay stored.
const BADGE_STATUSES = ['pending', 'accepted', 'processing', 'ready', 'fulfilled', 'cancelled'];
const tagValue = (tags, name) => tags.find((tag) => tag[0] === name)?.[1] || '';

function positiveInteger(value) {
	if (value === undefined) return undefined;
	if (!/^[1-9]\d*$/.test(value)) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function catalogType(definition) {
	const value = tagValue(definition.tags, 'type');
	return ['product', 'membership', 'pass', 'event_access'].includes(value) ? value : undefined;
}

function catalogMaxUses(definition) {
	const maxUses = positiveInteger(tagValue(definition.tags, 'max_uses') || undefined);
	if (maxUses) return maxUses;
	return catalogType(definition) === 'product' ? 1 : undefined;
}

// The latest valid kind 37237 status per fulfillment context for one award.
// Valid = kind/e/a/p/d match, a badge status, and exactly ONE context tag
// (order=<id> or event=<address>). Ties on created_at break by LOWER event id.
function latestStatusEvents(awardEvent, statuses) {
	const awardId = awardEvent.id;
	const address = tagValue(awardEvent.tags, 'a');
	const recipient = tagValue(awardEvent.tags, 'p');
	const latest = new Map();
	for (const event of statuses) {
		if (
			event.kind !== 37237 ||
			tagValue(event.tags, 'e') !== awardId ||
			tagValue(event.tags, 'a') !== address ||
			tagValue(event.tags, 'p') !== recipient ||
			!BADGE_STATUSES.includes(tagValue(event.tags, 'status'))
		) {
			continue;
		}
		const order = tagValue(event.tags, 'order');
		const eventContext = tagValue(event.tags, 'event');
		if (Boolean(order) === Boolean(eventContext)) continue; // exactly one context tag
		const contextKey = order ? `order:${order}` : `event:${eventContext}`;
		if (tagValue(event.tags, 'd') !== contextKey) continue;
		const current = latest.get(contextKey);
		if (
			!current ||
			event.created_at > current.created_at ||
			(event.created_at === current.created_at && (event.id || '') < (current.id || ''))
		) {
			latest.set(contextKey, event);
		}
	}
	return Array.from(latest.values());
}

function fulfilledUseCount(awardEvent, statuses) {
	return latestStatusEvents(awardEvent, statuses).filter(
		(event) => tagValue(event.tags, 'status') === 'fulfilled'
	).length;
}

function remainingAwardUses(awardEvent, definition, statuses) {
	const maxUses = catalogMaxUses(definition);
	if (!maxUses) return undefined;
	return Math.max(0, maxUses - fulfilledUseCount(awardEvent, statuses));
}

// --- QR payload: signed kind 27236 entitlement presentation (11th scan) ------
// Mirrors entitlementPresentationTemplate() + encodePresentation() in
// src/lib/presentation.ts (90s validity window — sign right before scanning).
// A fresh order context: the presented context has no status, so the scanner
// falls through to the maxUses check and must reject with "no uses remaining".
function buildEntitlementQrPayload(orderId) {
	const createdAt = Math.floor(Date.now() / 1000);
	const presentation = signEvent(
		{
			kind: 27236,
			tags: [
				['type', 'nuts_entitlement_presentation'],
				['expiration', String(createdAt + 90)],
				['nonce', crypto.randomUUID()],
				['e', award.id],
				['a', passAddress],
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

// Geometry mirrors qa-scan-e2e.mjs: 800x800 stream, scale=2 QR dead center
// inside html5-qrcode's 250px center crop.
async function buildQrDataUrl(orderId) {
	const payload = buildEntitlementQrPayload(orderId);
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

// vite dev occasionally drops the generated client manifest after a dep
// re-optimization; a retry a few seconds later recovers.
async function gotoRetry(page, url, selector, timeout = 20000) {
	let lastError;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
			await page.waitForSelector(selector, { timeout });
			return;
		} catch (error) {
			lastError = error;
			console.log(`   (navigation to ${url} failed, retrying: ${error.message.split('\n')[0]})`);
			await page.waitForTimeout(2500);
		}
	}
	throw lastError;
}

// Pre-select OUR relay before the app's own init runs (parallel QA runs share
// the admin key; the dashboard auto-selects adminRelays[0]).
function plantSelectedRelay(relayUrl) {
	try {
		const normalized = relayUrl.replace(/\/+$/, '').toLowerCase() + '/';
		localStorage.setItem('admin/selectedRelayUrl', JSON.stringify(normalized));
	} catch {
		// best effort
	}
}

async function pollRelay(filter, timeoutMs = 20000) {
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
let page;

async function main() {
	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	await context.addInitScript(seedSession, browserAccount(keys.admin));
	await context.addInitScript(plantServiceBaseUrl, community);
	await context.addInitScript(plantSelectedRelay, RELAY);
	page = await context.newPage();
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
	page.on('console', (msg) => {
		const text = msg.text();
		if (text.includes('[scan]')) console.log('[console]', text.slice(0, 200));
	});

	const adminRelayPath = `/admin/${encodeURIComponent(RELAY)}`;
	const relayHost = new URL(RELAY.replace(/^ws/, 'http')).host;
	const selectedRelayMatches = () =>
		page
			.evaluate((host) => {
				try {
					const stored = JSON.parse(localStorage.getItem('admin/selectedRelayUrl') || '""');
					if (typeof stored !== 'string' || !stored) return false;
					return new URL(stored.replace(/^ws/, 'http')).host === host;
				} catch {
					return false;
				}
			}, relayHost)
			.catch(() => false);

	// Selection guard (same pattern as qa-events-e2e.mjs): if the layout bounced
	// to /admin, the dashboard auto-select can flip to a foreign community.
	async function gotoAdminSegment(segment, selector) {
		const url = `${BASE}${adminRelayPath}/${segment}`;
		let lastError;
		for (let attempt = 0; attempt < 4; attempt++) {
			try {
				await gotoRetry(page, url, selector, 30000);
				if (await selectedRelayMatches()) return;
				console.log('   (admin relay selection pointed at a foreign community, re-selecting ours)');
			} catch (error) {
				lastError = error;
			}
			await page.waitForTimeout(2000);
		}
		throw lastError || new Error(`admin relay selection did not stick on ${RELAY}`);
	}

	const dumpBody = async (label) => {
		console.log(`---- body text ${label} ----`);
		console.log(
			await page
				.locator('body')
				.innerText()
				.catch(() => '(none)')
		);
	};

	// ── 3. Sports check-ins view: the pass renders under "Active passes" ──────
	await gotoAdminSegment('orders', 'h1:has-text("Check-ins & passes")');
	assert(true, 'orders screen renders the sports check-ins view');
	await dismissNotice(page);

	const activePassesSection = page
		.locator('main section')
		.filter({ has: page.locator('h2', { hasText: 'Active passes' }) })
		.first();
	const passCard = activePassesSection.locator('article', { hasText: passName }).first();
	const usesLeft = (n) => new RegExp(`^${n} uses? left$`);

	let cardVisible = await passCard
		.getByText(usesLeft(MAX_USES))
		.waitFor({ timeout: 45000 })
		.then(() => true)
		.catch(() => false);
	if (!cardVisible) {
		console.log('   (pass not listed yet, reloading the orders page once)');
		await gotoAdminSegment('orders', 'h1:has-text("Check-ins & passes")');
		await dismissNotice(page);
		cardVisible = await passCard
			.getByText(usesLeft(MAX_USES))
			.waitFor({ timeout: 45000 })
			.then(() => true)
			.catch(() => false);
	}
	if (!cardVisible) await dumpBody('at active-passes failure');
	assert(cardVisible, `pass renders under Active passes with "${MAX_USES} uses left"`);

	// ── 4. Check the pass in 10 times ──────────────────────────────────────────
	// checkInContextTag(awardId) stamps the context with SECONDS precision, so
	// two clicks inside the same second would collide on one context and the
	// remaining count would not decrement; the 1.1s pacing plus the text-change
	// wait below keep every check-in on its own context.
	const checkInButton = passCard.getByRole('button', { name: 'Check in', exact: true });
	for (let used = 0; used < MAX_USES; used++) {
		const remaining = MAX_USES - used;
		await page.waitForTimeout(1100);
		await checkInButton.click();
		if (remaining > 1) {
			const decremented = await passCard
				.getByText(usesLeft(remaining - 1))
				.waitFor({ timeout: 30000 })
				.then(() => true)
				.catch(() => false);
			if (!decremented) await dumpBody(`at check-in ${used + 1}`);
			assert(
				decremented,
				`check-in ${used + 1}/${MAX_USES} round-tripped ("${remaining - 1} uses left")`
			);
		}
	}

	// ── 5. Exhausted pass drops out of "Active passes" ─────────────────────────
	const dropped = await passCard
		.waitFor({ state: 'detached', timeout: 30000 })
		.then(() => true)
		.catch(async () => (await passCard.count()) === 0);
	if (!dropped) await dumpBody('at pass-exhaustion failure');
	assert(dropped, 'exhausted pass no longer renders under Active passes (0 uses left)');
	assert(
		(await activePassesSection.getByRole('button', { name: 'Check in', exact: true }).count()) === 0,
		'no actionable Check in button remains for the exhausted pass'
	);

	const checkinsSection = page
		.locator('main section')
		.filter({ has: page.locator('h2', { hasText: "Today's check-ins" }) })
		.first();
	assert(
		(await checkinsSection.locator('article', { hasText: passName }).count()) === MAX_USES,
		`Today's check-ins lists all ${MAX_USES} check-ins for the pass`
	);

	// ── 6. Relay-level: 10 fulfilled checkin- contexts, derivation cross-check ──
	const statuses = await pollRelay({ kinds: [37237], authors: [keys.admin.pub], '#e': [award.id] });
	const checkinContexts = new Set(
		statuses
			.filter(
				(event) =>
					tagValue(event.tags, 'status') === 'fulfilled' &&
					tagValue(event.tags, 'a') === passAddress &&
					tagValue(event.tags, 'p') === member.pub &&
					tagValue(event.tags, 'order').startsWith(`checkin-${award.id}-`)
			)
			.map((event) => tagValue(event.tags, 'order'))
	);
	assert(
		checkinContexts.size === MAX_USES,
		`relay stored ${MAX_USES} distinct fulfilled checkin- contexts for the award (admin-signed)`
	);

	const awardEvents = await pollRelay({ kinds: [8], ids: [award.id] });
	const definitions = await pollRelay({ kinds: [30009], authors: [keys.admin.pub], '#d': [passD] });
	assert(awardEvents.length === 1 && definitions.length >= 1, 'award + pass definition queryable on the relay');
	const remaining = remainingAwardUses(awardEvents[0], definitions[0], statuses);
	assert(remaining === 0, `remainingAwardUses derivation cross-checks to 0 (got ${remaining})`);

	// ── 7. 11th check-in: scanner rejects "no uses remaining" ──────────────────
	// Cold scanner page, fake camera paints the freshly-signed presentation
	// (fresh nonce/id, so nipworker does not dedupe the redemption audit
	// subscription — see the byte-identical-rescan note in qa-events-e2e.mjs).
	await context.addInitScript(fakeQrCamera, await buildQrDataUrl(`checkin-extra-${run}`));
	const scanPage = await context.newPage();
	scanPage.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
	await scanPage.goto(`${BASE}/home/scan`, { waitUntil: 'domcontentloaded' });
	await dismissNotice(scanPage);
	const exhausted = await Promise.race([
		scanPage
			.waitForSelector('text=This entitlement has no uses remaining.', { timeout: 45000 })
			.then(() => 'exhausted')
			.catch(() => null),
		scanPage
			.getByRole('button', { name: 'Check in', exact: true })
			.waitFor({ timeout: 45000 })
			.then(() => 'confirm')
			.catch(() => null)
	]);
	if (exhausted !== 'exhausted') {
		console.log('---- body text at 11th-scan failure ----');
		console.log(
			await scanPage
				.locator('body')
				.innerText()
				.catch(() => '(none)')
		);
	}
	assert(exhausted === 'exhausted', '11th scan reports "This entitlement has no uses remaining."');

	await page.screenshot({ path: '/tmp/passes-final.png' });
	await browser.close();
	pool.destroy([RELAY]);
	console.log('E2E PASS');
	process.exit(0);
}

main().catch(async (error) => {
	console.error('E2E FAIL:', error.message);
	try {
		if (page) await page.screenshot({ path: '/tmp/passes-failure.png', fullPage: true });
	} catch {}
	await browser.close().catch(() => {});
	pool.destroy([RELAY]);
	process.exit(1);
});
