// E2E: events workflow — create an event with a paid ticket through the admin
// events UI, seed a ticket award, then drive the attendee check-in through the
// scanner (event context) against a provisioned QA community (see .qa/README.md).
//
//   1. Injects the admin session + service base URL mapping, pins
//      admin/selectedRelayUrl (parallel runs share the admin key)
//   2. Creates an event via /admin/<relay>/events (3-step wizard: details,
//      schedule + capacity 2, admission = "Selected badges or roles" + paid
//      entrance 15.00 EUR). Success = the create modal closes (publishStatus is
//      state-only, never rendered). Publishes kind 30009 event_access ticket
//      definition, then kind 31923 calendar event.
//   3. Relay-level: asserts the 31923 (title/start/end/t/access=restricted/
//      entrance_badge/entrance_price/capacity) and the 30009 (d=event-<d>-entrance,
//      type/t=event_access, t=sellable, max_uses=1, a=<event coordinate>,
//      price, billing=one_time, expiration, availability)
//   4. Seeds a kind 8 ticket award for a random member (admin-signed — the
//      badge gate accepts any event from a configured admin pubkey) and TWO
//      accepted kind 31925 RSVPs from fresh random keys. Random keys need an
//      issuer-signed membership award first (kind 8, a=required_badge, signed
//      with the badge issuer secret from the coordinator) or the badge gate
//      rejects their writes ("blocked: required badge missing") — same
//      precedent as qa-roles-e2e.mjs.
//   5. Events list: the event renders with the paid admission label and
//      Going=2 / 2, then the detail overlay shows the two roster entries and
//      "0 of 2 places remaining", and "Check in attendees" opens the scanner
//      with an event check-in context (encodeCheckInContext)
//   6. Cold scanner, fake camera paints a signed kind 27236 entitlement
//      presentation (`nuts:present:…`, ['event', <coordinate>] context —
//      mirrors entitlementPresentationTemplate() in src/lib/presentation.ts).
//      FIRST scan attempt must reach the confirmation step; "Check in"
//      publishes kind 37237 status=fulfilled with the event context tag
//   7. Relay-level: the 37237 exists (status=fulfilled, e=award id,
//      a=ticket definition, p=member, event=<event coordinate>, admin-signed)
//   8. Second scan of the same ticket reports "already checked in" (the ticket
//      is exhausted: max_uses=1 + fulfilled fulfillment for this event)
//
// Run: QA_STATE=/tmp/qa-community-events.json QA_DEV_PORT=5195 node .qa/qa-events-e2e.mjs
// Screenshots: /tmp/events-final.png (success), /tmp/events-failure.png (failure).
import { createRequire } from 'module';
import {
	assert,
	browserAccount,
	ensureDevServer,
	getRelay,
	getRelaySecrets,
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
const eventTitle = `QA Match Night ${run}`;
const eventSummary = 'E2E event for the ticket check-in workflow';
// The entrance price input is type=number, which normalizes the typed value
// ("15.00" -> "15"); the relay tags carry the normalized value.
const entrancePrice = '15';
const entranceCurrency = 'EUR';
// Capacity is set in the wizard's schedule step (type=number input) and lands
// as a ['capacity', '2'] tag on the kind 31923.
const capacity = '2';
const member = randomKey();
// Two fresh random keys RSVP "accepted" so the event fills up (Going 2 / 2).
const rsvpMembers = [randomKey(), randomKey()];

console.log('target relay:', RELAY, `(provisioned: ${community.name})`);

// Filled in after the event lands on the relay (step 3).
let eventD = '';
let eventAddress = '';
let ticketAddress = '';
let award;

// --- QR payload: signed kind 27236 entitlement presentation, event context ---
// Mirrors entitlementPresentationTemplate() + encodePresentation() in
// src/lib/presentation.ts (90s validity window — sign right before scanning).
// The ticket holder's app presents ['event', <event coordinate>] instead of an
// order id; scan.svelte's verifyEntitlementRedemption matches it against the
// check-in context's eventAddress.
function buildTicketQrPayload() {
	const createdAt = Math.floor(Date.now() / 1000);
	const presentation = signEvent(
		{
			kind: 27236,
			tags: [
				['type', 'nuts_entitlement_presentation'],
				['expiration', String(createdAt + 90)],
				['nonce', crypto.randomUUID()],
				['e', award.id],
				['a', ticketAddress],
				['r', RELAY],
				['event', eventAddress]
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
async function buildQrDataUrl() {
	const payload = buildTicketQrPayload();
	const dataUrl = await QRCode.toDataURL(payload, {
		errorCorrectionLevel: 'L',
		margin: 2,
		scale: 2
	});
	console.log('ok - built ticket presentation QR (payload', payload.length, 'chars)');
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

const hasTag = (event, name, value) => event.tags.some((t) => t[0] === name && t[1] === value);
const tagValue = (event, name) => event.tags.find((t) => t[0] === name)?.[1];

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
	// Diagnostics: trace the 37237 redemption audit traffic. This is how the
	// stale-rescan behavior below was proven.
	page.on('websocket', (ws) => {
		ws.on('framesent', (frame) => {
			const p = typeof frame.payload === 'string' ? frame.payload : '';
			if (p.includes('37237') || p.includes('entitlement_redemption'))
				console.log('[ws >>]', p.slice(0, 400));
		});
		ws.on('framereceived', (frame) => {
			const p = typeof frame.payload === 'string' ? frame.payload : '';
			if (p.includes('37237') || p.includes('entitlement_redemption'))
				console.log('[ws <<]', p.slice(0, 400));
		});
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

	// Selection guard (same pattern as qa-invite-redeem-e2e.mjs): if the layout
	// bounced to /admin, the dashboard auto-select can flip to a foreign
	// community; detect via localStorage and re-navigate through the
	// encoded-relay URL, which re-selects ours.
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

	// ── 2. Create the event (with a paid ticket) through the admin events UI ──
	await gotoAdminSegment('events', 'h1:has-text("Events")');
	assert(true, 'events screen renders for the provisioned community');
	await dismissNotice(page);

	await page.getByRole('button', { name: /Create event/ }).click();
	await page.waitForSelector('text=Step 1 of 3', { timeout: 10000 });

	// Step 1: details
	await page.getByPlaceholder('Saturday training').fill(eventTitle);
	await page.getByPlaceholder(/What members should know/).fill(eventSummary);
	await page.getByRole('button', { name: /Continue/ }).click();
	await page.waitForSelector('text=Step 2 of 3', { timeout: 10000 });

	// Step 2: schedule — defaults (tomorrow, +1h) are valid; set capacity 2 so
	// the two seeded RSVPs fill the event
	await page.getByPlaceholder('24').fill(capacity);
	await page.getByRole('button', { name: /Continue/ }).click();
	await page.waitForSelector('text=Step 3 of 3', { timeout: 10000 });

	// Step 3: admission — restricted entry with a paid ticket for everyone else
	await page.getByRole('button', { name: /Selected badges or roles/ }).click();
	await page.getByRole('button', { name: /Let other people buy entrance/ }).click();
	await page.getByPlaceholder('15.00').fill(entrancePrice);
	assert(true, 'paid entrance configured in the create-event wizard');

	// Publish. Success = the create modal closes (publishStatus is never
	// rendered; resetEventForm() closes the modal after the relay confirms the
	// 31923). The page gives each publish a 5s relay-confirmation window, so
	// under load a retry of the same click is legitimate.
	const createDialog = page.locator('[role="dialog"][aria-modal="true"]');
	let published = false;
	for (let attempt = 0; attempt < 3 && !published; attempt++) {
		await page.getByRole('button', { name: /Publish event/ }).click();
		published = await createDialog
			.waitFor({ state: 'detached', timeout: 25000 })
			.then(() => true)
			.catch(() => false);
		if (!published) console.log('   (event publish not confirmed within 25s, retrying)');
	}
	assert(published, 'event + entrance ticket published through the UI (create modal closed)');

	// ── 3. Relay-level: kind 31923 event + kind 30009 event_access ticket ──────
	const calendarEvents = await pollRelay({ kinds: [31923], authors: [keys.admin.pub], limit: 20 });
	const calendarEvent = calendarEvents.find((event) => hasTag(event, 'title', eventTitle));
	assert(calendarEvent, 'relay stored the kind 31923 calendar event (admin-signed)');
	eventD = tagValue(calendarEvent, 'd');
	eventAddress = `31923:${keys.admin.pub}:${eventD}`;
	ticketAddress = `30009:${keys.admin.pub}:event-${eventD}-entrance`;
	assert(hasTag(calendarEvent, 'd', eventD) && Boolean(eventD), 'event has a d identifier');
	assert(
		Boolean(Number(tagValue(calendarEvent, 'start'))) && Boolean(Number(tagValue(calendarEvent, 'end'))),
		'event carries start and end timestamps'
	);
	assert(hasTag(calendarEvent, 't', 'training'), 'event classified with its category topic');
	assert(hasTag(calendarEvent, 'access', 'restricted'), 'event access=restricted (paid entrance)');
	assert(
		hasTag(calendarEvent, 'entrance_badge', ticketAddress),
		'event references the entrance ticket definition (entrance_badge)'
	);
	assert(
		calendarEvent.tags.some(
			(t) => t[0] === 'entrance_price' && t[1] === entrancePrice && t[2] === entranceCurrency
		),
		`event carries entrance_price ${entrancePrice} ${entranceCurrency}`
	);
	assert(hasTag(calendarEvent, 'capacity', capacity), `event carries capacity ${capacity}`);

	const definitions = await pollRelay({ kinds: [30009], authors: [keys.admin.pub], limit: 50 });
	const ticket = definitions.find((event) => hasTag(event, 'd', `event-${eventD}-entrance`));
	assert(ticket, 'relay stored the kind 30009 event_access ticket definition');
	assert(
		hasTag(ticket, 'type', 'event_access') && hasTag(ticket, 't', 'event_access'),
		'ticket definition classified type=event_access + t=event_access'
	);
	assert(hasTag(ticket, 't', 'sellable'), 'ticket definition is sellable (t=sellable)');
	assert(hasTag(ticket, 'max_uses', '1'), 'ticket definition has max_uses=1 (single admission)');
	assert(hasTag(ticket, 'a', eventAddress), 'ticket definition references the event coordinate');
	assert(
		ticket.tags.some((t) => t[0] === 'price' && t[1] === entrancePrice && t[2] === entranceCurrency),
		'ticket definition carries the entrance price'
	);
	assert(hasTag(ticket, 'billing', 'one_time'), 'ticket definition billing=one_time');
	assert(
		Boolean(Number(tagValue(ticket, 'expiration'))) &&
			Number(tagValue(ticket, 'expiration')) === Number(tagValue(calendarEvent, 'end')),
		'ticket definition expires at the event end'
	);
	assert(hasTag(ticket, 'availability', 'available'), 'ticket definition availability=available');

	// ── 4. Seed: ticket award (kind 8) for the member + two member RSVPs ───────
	award = signEvent(
		{
			kind: 8,
			tags: [
				['a', ticketAddress],
				['p', member.pub]
			]
		},
		keys.admin.priv
	);
	await Promise.allSettled(pool.publish([RELAY], award));
	console.log('ok - seeded ticket award', award.id.slice(0, 12), 'for member', member.pub.slice(0, 12));

	// Two accepted RSVPs from fresh random keys fill the event (capacity 2).
	// Random keys can only write once the badge gate knows them as members, so
	// first plant issuer-signed membership awards (kind 8, a=required_badge) —
	// the gate applies those to its membership cache synchronously while
	// deciding the award write itself (gate/src/main.rs decide()).
	const relayView = await getRelay(community.id, keys);
	assert(relayView.badge_issuer_pubkey, 'coordinator RelayView exposes badge_issuer_pubkey');
	const secrets = await getRelaySecrets(community.id, keys);
	assert(secrets?.badge_issuer_secret_key, 'coordinator exposes the badge issuer secret key');
	for (const rsvpMember of rsvpMembers) {
		const membershipAward = signEvent(
			{ kind: 8, tags: [['a', relayView.required_badge], ['p', rsvpMember.pub]] },
			secrets.badge_issuer_secret_key
		);
		await Promise.allSettled(pool.publish([RELAY], membershipAward));
	}
	const membershipStored = await pollRelay(
		{ kinds: [8], authors: [relayView.badge_issuer_pubkey], limit: 10 },
		30000
	);
	assert(
		rsvpMembers.every((rsvpMember) =>
			membershipStored.some(
				(event) =>
					hasTag(event, 'a', relayView.required_badge) && hasTag(event, 'p', rsvpMember.pub)
			)
		),
		'issuer-signed membership awards for both RSVP members on the relay'
	);
	const rsvps = rsvpMembers.map((rsvpMember) =>
		signEvent(
			{
				kind: 31925,
				tags: [
					['a', eventAddress],
					['status', 'accepted']
				]
			},
			rsvpMember.priv
		)
	);
	for (const rsvp of rsvps) await Promise.allSettled(pool.publish([RELAY], rsvp));
	const storedRsvps = await pollRelay({ kinds: [31925], limit: 20 }, 30000);
	assert(
		rsvps.every((rsvp) => storedRsvps.some((event) => event.id === rsvp.id)),
		'both accepted member RSVPs round-trip on the relay (gate accepted member writes)'
	);

	// ── 5. Events list renders the event with admission + attendee count ──────
	// The QR references the award id and has a 90s validity window, so the fake
	// camera is only registered now; the newest addInitScript registration wins.
	await context.addInitScript(fakeQrCamera, await buildQrDataUrl());
	await gotoAdminSegment('events', 'h1:has-text("Events")');
	await dismissNotice(page);

	const eventRow = page.locator('main button', { has: page.locator('h2', { hasText: eventTitle }) });
	let rowVisible = await eventRow
		.first()
		.waitFor({ timeout: 30000 })
		.then(() => true)
		.catch(() => false);
	if (!rowVisible) {
		console.log('   (event not listed yet, reloading the events page once)');
		await gotoAdminSegment('events', 'h1:has-text("Events")');
		rowVisible = await eventRow
			.first()
			.waitFor({ timeout: 30000 })
			.then(() => true)
			.catch(() => false);
	}
	assert(rowVisible, 'event renders in the admin events list');
	const rowText = await eventRow.first().innerText();
	assert(rowText.includes(`${entrancePrice} ${entranceCurrency}`), 'list shows the paid admission label');
	assert(
		new RegExp(`Going\\s*\\n\\s*${rsvpMembers.length} / ${capacity}`).test(rowText),
		`list shows Going=${rsvpMembers.length} / ${capacity} from the seeded RSVPs`
	);

	// ── 6. Check-in: detail overlay -> scanner with event context ─────────────
	await eventRow.first().click();
	const detailDialog = page.locator('[role="dialog"][aria-modal="true"]', {
		has: page.locator('h2#event-detail-title', { hasText: eventTitle })
	});
	await detailDialog.waitFor({ timeout: 10000 });
	assert(true, 'event detail overlay opens from the list');

	// Capacity bookkeeping: the roster lists both RSVP members (shortPubkey
	// rendering, members/+page.svelte shortPubkey shape) and the event is full.
	const shortPubkey = (pubkey) => `${pubkey.slice(0, 10)}…${pubkey.slice(-8)}`;
	const detailText = await detailDialog.innerText();
	for (const rsvpMember of rsvpMembers) {
		assert(
			detailText.includes(shortPubkey(rsvpMember.pub)),
			`roster lists RSVP member ${rsvpMember.pub.slice(0, 12)}`
		);
	}
	assert(
		detailText.includes(`0 of ${capacity} places remaining`),
		`detail overlay shows "0 of ${capacity} places remaining" when full`
	);

	await detailDialog.getByRole('button', { name: /Check in attendees/ }).click();
	await page.waitForSelector('text=Event check-in', { timeout: 10000 });
	assert(true, 'scanner opened with the event check-in context');

	// First scan attempt on this cold page must reach the confirmation step
	// (the entitlement redemption resolves after every filter's EOSE; a
	// first-attempt rejection is a hard failure).
	const confirmButton = () => page.getByRole('button', { name: 'Check in', exact: true });
	const dumpBody = async (label) => {
		console.log(`---- body text ${label} ----`);
		console.log(
			await page
				.locator('body')
				.innerText()
				.catch(() => '(none)')
		);
	};
	const outcome = await Promise.race([
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
	if (outcome === 'rejected') {
		await dumpBody('at first-attempt rejection');
		assert(false, 'first scan attempt rejected (cold-page entitlement resolution must succeed)');
	}
	if (outcome !== 'confirm') await dumpBody('at confirmation failure');
	assert(outcome === 'confirm', 'first scan attempt reached the check-in confirmation step');
	assert(
		await page.locator('h1', { hasText: eventTitle }).count(),
		'event title shown on the confirmation step'
	);

	// Confirm the check-in -> kind 37237 status=fulfilled publish
	await confirmButton().first().click();
	const admitted = await page
		.waitForSelector('text=Ticket checked in.', { timeout: 20000 })
		.then(() => true)
		.catch(() => false);
	if (!admitted) await dumpBody('at admitted failure');
	assert(admitted, 'UI confirmed the check-in (Ticket checked in.)');
	assert(await page.locator('text=Admitted').count(), 'result label "Admitted" shown');

	// ── 7. Relay-level: kind 37237 status=fulfilled with the event context ────
	const statuses = await pollRelay({ kinds: [37237], authors: [keys.admin.pub] });
	const fulfilled = statuses.find(
		(event) =>
			hasTag(event, 'status', 'fulfilled') &&
			hasTag(event, 'e', award.id) &&
			hasTag(event, 'a', ticketAddress) &&
			hasTag(event, 'p', member.pub) &&
			hasTag(event, 'event', eventAddress)
	);
	assert(
		fulfilled,
		'relay stored kind 37237 status=fulfilled with the ["event", <coordinate>] context tag (admin-signed)'
	);
	assert(
		fulfilled.kind === 37237,
		`check-in status is kind 37237 (got kind ${fulfilled.kind})`
	);
	assert(
		hasTag(fulfilled, 'd', `event:${eventAddress}`),
		'kind 37237 carries d=event:<coordinate> (addressable status context)'
	);

	// ── 8. Second scan of the same ticket: already checked in ─────────────────
	// max_uses=1 and this event's fulfillment is fulfilled, so the ticket is
	// exhausted. "Scan next" restarts the SAME scanner session and the fake
	// camera serves the BYTE-IDENTICAL QR (still inside its 90s validity
	// window); the app must re-query the relay (its audit subscription id is
	// unique per scan attempt) and report the ticket as already checked in.
	// The ws sniffer above proves the relay round-trip: a fresh REQ for the
	// 37237 filter followed by the fulfilled status EVENT.
	await page.locator('button', { hasText: 'Scan next' }).first().click();
	const recheckWait = () =>
		Promise.race([
			page
				.waitForSelector('text=This ticket was already checked in.', { timeout: 30000 })
				.then(() => 'already')
				.catch(() => null),
			confirmButton()
				.waitFor({ timeout: 30000 })
				.then(() => 'confirm')
				.catch(() => null)
		]);
	let recheckOutcome = await recheckWait();
	if (!recheckOutcome) {
		// Flake guard: a vite full-reload (shared dev server, other agents edit
		// src/) reloads the page at the /admin/<relay>/events/scan:... URL, which
		// has no SvelteKit route and renders "404 Not Found" mid-verification.
		// Re-open the scanner via the click-through; the camera init script
		// still serves the SAME byte-identical QR (no re-registration).
		console.log('   (page reloaded mid-rescan (404), re-opening the scanner with the same QR)');
		await dumpBody('at rescan interruption');
		await gotoAdminSegment('events', 'h1:has-text("Events")');
		await eventRow.first().click();
		await detailDialog.waitFor({ timeout: 10000 });
		await detailDialog.getByRole('button', { name: /Check in attendees/ }).click();
		await page.waitForSelector('text=Event check-in', { timeout: 10000 });
		recheckOutcome = await recheckWait();
	}
	if (recheckOutcome !== 'already') await dumpBody('at second-scan failure');
	assert(
		recheckOutcome === 'already',
		'second scan of the same ticket reports already checked in'
	);

	await page.screenshot({ path: '/tmp/events-final.png' });
	await browser.close();
	pool.destroy([RELAY]);
	console.log('E2E PASS');
	process.exit(0);
}

main().catch(async (error) => {
	console.error('E2E FAIL:', error.message);
	try {
		if (page) await page.screenshot({ path: '/tmp/events-failure.png', fullPage: true });
	} catch {}
	await browser.close().catch(() => {});
	pool.destroy([RELAY]);
	process.exit(1);
});
