// E2E: scanner REJECTION paths for entitlement verification (negative paths of
// qa-scan-e2e.mjs) against a provisioned QA community (see .qa/README.md):
//
//   1. Seeds ONE QR-fulfillment product (kind 30009, admin-signed) and FOUR
//      kind-8 awards held by four different random members:
//        a. VALID      — control, no expiration, not revoked
//        b. EXPIRED    — `expiration` tag lapsed by scan time (NIP-40); seeded
//                        with a short FUTURE expiration because strfry rejects
//                        already-expired writes (see the seeding comment)
//        c. REVOKED    — plus a kind-5 deletion (`e` = award id) signed by the
//                        AWARD ISSUER (admin here, matching the award signer)
//        d. WRONG-SIGNER DELETE — a badge_issuer-signed award plus a kind-5
//                        deletion signed by the ADMIN (an authority, but NOT
//                        the award issuer): must NOT revoke
//   2. Drives a COLD /home/scan page per case (fake camera paints a freshly
//      signed nuts:present QR, fresh nonce per scan) and asserts the
//      FIRST-attempt outcome:
//        a. valid       -> confirmation step, then "Mark served" fulfills
//        b. expired     -> "This entitlement has expired."
//        c. revoked     -> first-attempt rejection; see the design note for why
//                          the reachable message is entitlement-not-found
//        d. wrong-signer -> still reaches the confirmation step
//
// Scanner logic under test (src/routes/modals/scan.svelte
// prepareEntitlementRedemption): the revocation branch only fires when the
// kind-5 signer equals the award pubkey (`revocationSigners.has(award.pubkey())`);
// the expiration branch fires when the award's `expiration` tag <= now.
//
// Design note — case (c) — FINDING, wire-verified: the scanner's dedicated
// "This entitlement has been revoked." branch is UNREACHABLE against this
// strfry relay. The branch requires the award and an issuer-signed kind-5 to
// coexist on the relay, but strfry enforces NIP-09 on exactly the same
// condition (deletion author == event author): it evicts the award when the
// kind-5 lands (qa-roles-e2e.mjs asserts this), and if the kind-5 was ingested
// first it rejects the award write outright — verified on the wire:
//   ["OK",<award-id>,false,"deleted: user requested deletion"]
// With the award gone, the scanner's award lookup comes up empty and the
// not-found check (which runs BEFORE the revocation check) rejects with
// "The entitlement could not be found on this community relay." This script
// therefore seeds the real production flow (award first, issuer delete second,
// eviction asserted at relay level) and asserts the production-true outcome:
// a FIRST-attempt rejection with the not-found message — never confirmation.
//
// Design note — case (d): the badge-gate (strfry-badge-node/crates/gate) only
// accepts kind 5 from the badge_issuer or an admin pubkey, so a deletion signed
// by a RANDOM key never lands (asserted absent below). The provable
// unauthorized-delete case within the gate rules is therefore: a kind-5 delete
// signed by a DIFFERENT authority than the award issuer. This script signs the
// award with the ADMIN key and the delete with the BADGE_ISSUER key — both
// gate-accepted authorities, so the delete IS stored — but the scanner must
// ignore it because the signer != award issuer. strfry also must not physically
// delete the award (author mismatch) — asserted at relay level.
// (The inverse arrangement — badge_issuer award + admin delete — is
// unreachable at the scanner in dev: fetchCommunityTrust derives
// /community/info from the relay URL, where strfry answers its HTML landing
// page instead of the invite service JSON, so trust.badgeIssuer never resolves
// and issuer-signed awards are rejected as "not issued by this community"
// before revocation is even consulted. Reported as a bug; see the header of
// the run report.)
//
// Screenshots: /tmp/expiry-revocation-final.png (success),
//              /tmp/expiry-revocation-failure.png (failure).
import { createRequire } from 'module';
import {
	assert,
	browserAccount,
	ensureDevServer,
	getRelaySecrets,
	launchBrowser,
	loadKeys,
	makePool,
	nowSeconds,
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
const productD = `qa-exprev-${run}`;
const productAddress = `30009:${keys.admin.pub}:${productD}`;
const productName = `QA Espresso ${run}`;

console.log('target relay:', RELAY, `(provisioned: ${community.name})`);

// --- Relay helpers -----------------------------------------------------------
async function pollRelay(filter, timeoutMs = 20000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const events = await pool.querySync([RELAY], filter);
		if (events.length) return events;
		await sleep(1000);
	}
	return [];
}

async function pollAbsent(filter, waitMs = 5000) {
	const deadline = Date.now() + waitMs;
	while (Date.now() < deadline) {
		const events = await pool.querySync([RELAY], filter);
		if (events.length) return events;
		await sleep(750);
	}
	return [];
}

const assertStored = async (event, label) =>
	assert((await pollRelay({ kinds: [event.kind], ids: [event.id] })).length, label);

// --- Badge issuer (service key from the coordinator) -------------------------
const secrets = await getRelaySecrets(community.id, keys);
assert(secrets?.badge_issuer_secret_key, 'coordinator exposes the badge issuer secret key');
const badgeIssuer = {
	priv: secrets.badge_issuer_secret_key,
	// derive the pubkey via a throwaway signature (qa-lib exports no getPublicKey)
	pub: signEvent({ kind: 0, tags: [] }, secrets.badge_issuer_secret_key).pubkey
};
assert(badgeIssuer.pub !== keys.admin.pub, 'badge issuer is the service key, not the admin');

// --- Seed: product definition -------------------------------------------------
const product = signEvent(
	{
		kind: 30009,
		tags: [
			['d', productD],
			['type', 'product'],
			['t', 'product'],
			['t', 'sellable'],
			['product_kind', 'drink'], // drink/food products use QR fulfillment (catalogUsesQrFulfillment)
			['name', productName],
			['description', 'E2E product for the expiry/revocation scanner rejections'],
			['price', '3.50', 'EUR'],
			['availability', 'available'],
			['max_uses', '1'],
			['section', 'Drinks']
		]
	},
	keys.admin.priv
);
await Promise.allSettled(pool.publish([RELAY], product));
await assertStored(product, 'product definition stored on the relay');

// --- Seed: four awards for four different holders ------------------------------
const orderId = (name) => `o${run}-${name}`;
const awardTemplate = (holder, order) => ({
	kind: 8,
	tags: [
		['a', productAddress],
		['p', holder.pub],
		['order', order]
	]
});

// a. VALID control award (admin-signed, no expiration)
const memberValid = randomKey();
const orderValid = orderId('valid');
const awardValid = signEvent(awardTemplate(memberValid, orderValid), keys.admin.priv);
await Promise.allSettled(pool.publish([RELAY], awardValid));
await assertStored(awardValid, 'valid award stored on the relay');

// b. EXPIRED award (admin-signed, NIP-40). Relay workaround: strfry enforces
//    NIP-40 at WRITE time — an already-expired event is rejected outright
//    (`["OK",<id>,false,"invalid: event expired"]`, verified on the wire), so a
//    past-expiration award can never be seeded. But strfry does NOT evict
//    stored events once their expiration passes (also verified on the wire:
//    post-expiry queries still return them). So the award is seeded with a
//    short future expiration, and the scan for case (b) waits until it lapses;
//    the scanner then sees the award and applies its own expiration check.
const EXPIRED_AWARD_TTL_SECONDS = 75; // > seeding time; lapsed before case (b) scans
const memberExpired = randomKey();
const orderExpired = orderId('expired');
const expiredAwardExpiration = nowSeconds() + EXPIRED_AWARD_TTL_SECONDS;
const awardExpired = signEvent(
	{
		...awardTemplate(memberExpired, orderExpired),
		tags: [...awardTemplate(memberExpired, orderExpired).tags, ['expiration', String(expiredAwardExpiration)]]
	},
	keys.admin.priv
);
await Promise.allSettled(pool.publish([RELAY], awardExpired));
await assertStored(awardExpired, 'to-be-expired award stored on the relay (expiration still in the future)');

// c. REVOKED award (admin-signed). Real production flow: the award is issued
//    and stored first, then the issuer revokes it with a kind-5. strfry
//    enforces NIP-09 physically (deletion author == event author), so the
//    award is evicted — there is no relay state in which an award coexists
//    with its issuer-signed deletion (re-publishing the award after the delete
//    is rejected with "deleted: user requested deletion"; verified on the
//    wire). The scanner's "revoked" branch is therefore unreachable here; the
//    reachable outcome is a first-attempt "entitlement could not be found"
//    rejection (see the header design note).
const memberRevoked = randomKey();
const orderRevoked = orderId('revoked');
const awardRevoked = signEvent(awardTemplate(memberRevoked, orderRevoked), keys.admin.priv);
await Promise.allSettled(pool.publish([RELAY], awardRevoked));
await assertStored(awardRevoked, 'to-be-revoked award stored on the relay');
const revocation = signEvent({ kind: 5, tags: [['e', awardRevoked.id]] }, keys.admin.priv);
assert(
	revocation.pubkey === awardRevoked.pubkey,
	'revocation signer equals the award issuer (a valid NIP-09 deletion)'
);
await Promise.allSettled(pool.publish([RELAY], revocation));
await assertStored(revocation, 'issuer-signed kind-5 revocation stored on the relay');
assert(
	(await pollAbsent({ kinds: [8], ids: [awardRevoked.id] }, 15000)).length === 0,
	'revoked award physically evicted by the issuer-signed NIP-09 deletion (strfry)'
);

// d. WRONG-SIGNER delete: admin-signed award, badge_issuer-signed kind-5.
//    Both keys are gate-accepted authorities so the delete IS stored, but the
//    scanner must ignore it (revocationSigners.has(award.pubkey()) is false)
//    and strfry must not evict the award (NIP-09 author mismatch). See the
//    header design note for why the award is admin-signed rather than
//    issuer-signed (dev-mode /community/info resolution bug).
const memberWrongSigner = randomKey();
const orderWrongSigner = orderId('wrongsigner');
const awardWrongSigner = signEvent(awardTemplate(memberWrongSigner, orderWrongSigner), keys.admin.priv);
await Promise.allSettled(pool.publish([RELAY], awardWrongSigner));
await assertStored(awardWrongSigner, 'wrong-signer case award (admin-signed) stored on the relay');
const wrongRevocation = signEvent({ kind: 5, tags: [['e', awardWrongSigner.id]] }, badgeIssuer.priv);
assert(
	wrongRevocation.pubkey !== awardWrongSigner.pubkey,
	'wrong-signer delete signer (badge_issuer) differs from the award issuer (admin)'
);
await Promise.allSettled(pool.publish([RELAY], wrongRevocation));
await assertStored(wrongRevocation, 'issuer-signed delete of the admin award stored (gate accepts badge_issuer kind 5)');
await assertStored(
	awardWrongSigner,
	'award NOT physically deleted by the foreign-signer kind-5 (strfry author-mismatch)'
);

// d-bis. A delete signed by a RANDOM unrelated key must not even land: the gate
//        only accepts kind 5 from the badge_issuer or admin pubkeys.
const randomStranger = randomKey();
const strangerRevocation = signEvent({ kind: 5, tags: [['e', awardWrongSigner.id]] }, randomStranger.priv);
await Promise.allSettled(pool.publish([RELAY], strangerRevocation));
assert(
	(await pollAbsent({ kinds: [5], ids: [strangerRevocation.id] })).length === 0,
	'random-key kind-5 rejected by the badge gate (never stored)'
);

console.log('ok - seeded 1 product + 4 awards (valid / expired / revoked / wrong-signer delete)');

// --- QR payload: signed kind 27236 entitlement presentation ------------------
// Mirrors entitlementPresentationTemplate() + encodePresentation() in
// src/lib/presentation.ts (90s validity window — sign right before scanning).
function buildEntitlementQrPayload(award, member, order) {
	const createdAt = nowSeconds();
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
				['order', order]
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
async function buildQrDataUrl(award, member, order) {
	const payload = buildEntitlementQrPayload(award, member, order);
	return QRCode.toDataURL(payload, {
		errorCorrectionLevel: 'L',
		margin: 2,
		scale: 2
	});
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
	// Blank the canvas the instant the FIRST QR decode is reported. html5-qrcode's
	// stop() is async, so a continuously painted QR can be decoded a SECOND time
	// before the camera actually halts (observed on a loaded machine: duplicate
	// [scan] detections 4.6s and 11s after the first). A duplicate detection
	// spawns a concurrent prepareEntitlementRedemption attempt (scan.svelte has
	// no re-entrancy guard) which OVERWRITES the first attempt's correct outcome
	// with a wrong "The entitlement could not be found" rejection (observed with
	// the award provably served — reported as an app bug). scan.svelte logs
	// '[scan] QR detected' synchronously at the top of its success callback,
	// before any state change, so hooking console.log blanks the canvas in the
	// same tick as the first detection — queued/late decode passes then find a
	// white canvas and fire nothing. (Two alternatives failed on the loaded
	// shared machine: a fixed 3s paint window raced slow camera startup and
	// produced zero detections; a MutationObserver on #reader removal correlated
	// with verification stalling. This hook touches neither the DOM nor the
	// stream.)
	function blank() {
		ready = false;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	const originalLog = console.log.bind(console);
	console.log = (...args) => {
		try {
			if (args.some((arg) => String(arg).includes('[scan] QR detected'))) blank();
		} catch {}
		return originalLog(...args);
	};
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

const BASE = await ensureDevServer();
const browser = await launchBrowser();

try {
	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	await context.addInitScript(seedSession, browserAccount(keys.admin));
	await context.addInitScript(plantServiceBaseUrl, community);
	const t0 = Date.now();
	let page;
	let scanDetections = 0; // '[scan] QR detected' logs on the CURRENT page

	function attachListeners(p) {
		p.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
		p.on('console', (msg) => {
			const text = msg.text();
			if (text.includes('[scan] QR detected')) scanDetections += 1;
			if (text.includes('[scan]'))
				console.log(`[console +${((Date.now() - t0) / 1000).toFixed(1)}s]`, text.slice(0, 200));
		});
	}

	// Deliberately COLD page per case: no warm-up. The QR is signed fresh per
	// page (90s validity window); the newest addInitScript registration wins, so
	// re-registering swaps the QR in.
	async function openScannerPage(award, member, order) {
		await context.addInitScript(fakeQrCamera, await buildQrDataUrl(award, member, order));
		if (page) await page.close().catch(() => {});
		scanDetections = 0;
		page = await context.newPage();
		attachListeners(page);
		await page.goto(`${BASE}/home/scan`, { waitUntil: 'domcontentloaded' });
		// Soft wait: detection can beat us to the verification view (where #reader
		// is hidden), so a miss here is not fatal — the outcome wait is the gate.
		await page
			.waitForSelector('#reader', { timeout: 20000 })
			.then(() => console.log('ok - scanner view visible'))
			.catch(() => console.log('ok - scanner already past the scan view'));
		await dismissNotice(page);
	}

	const confirmButton = () => page.locator('button', { hasText: 'Mark served' });
	const scanNextButton = () => page.locator('button', { hasText: 'Scan next' });
	const dumpBody = async (label) => {
		console.log(`---- body text ${label} ----`);
		console.log(
			await page
				.locator('body')
				.innerText()
				.catch(() => '(none)')
		);
	};

	const NOT_FOUND_MESSAGE = 'The entitlement could not be found on this community relay.';

	// One cold-page scan case. expect = { type: 'confirm' } or
	// { type: 'reject', message }.
	//
	// The expected outcome is the FIRST verification's honest conclusion, so
	// it is polled for TRANSIENTLY (500ms cadence, 45s window) instead of
	// read once at the end: on this loaded shared machine html5-qrcode's
	// decode backlog can fire the success callback a second time 6-17s late
	// (canvas blanking cannot undo already-queued decodes), and the duplicate
	// spawns a concurrent prepareEntitlementRedemption that OVERWRITES the
	// correct outcome with a wrong "entitlement could not be found" rejection
	// seconds later (scan.svelte has no re-entrancy guard — reported as an app
	// bug). The expected marker can only be produced by the branch under test
	// (a confirm step requires a successful verification; the expired/not-found
	// messages come only from their own rejection branches), so observing it
	// even briefly is conclusive, and a later overwrite cannot fabricate it.
	// A CLEAN single-detection attempt whose (final) outcome is wrong is a
	// hard first-attempt failure.
	// Three retryable situations, all harness artifacts of the loaded shared
	// machine, never app-behavior passes:
	//   - no scan outcome at all within 45s (camera/decode/vite flake), or
	//   - duplicate QR detections (>1 '[scan] QR detected' for ONE painted QR)
	//     and the expected outcome was never observed: the duplicate's racing
	//     attempt pre-empted/overwrote the first verification's conclusion, or
	//   - the scanner rejected with the generic "could not be found" while the
	//     relay verifiably SERVES the award (probed live with the same
	//     {kinds:[8], ids:[awardId]} filter the app uses): the app's
	//     verification resolves on the FIRST of (all-EOSE, 12s backstop —
	//     scan.svelte:757), so a relay round trip slowed past 12s on this
	//     loaded machine fires the backstop with nothing loaded and
	//     misreports a served award as not-found (observed on the wire: the
	//     award returned by Node-side queries seconds before and after such
	//     a scan). The contradiction makes the attempt's outcome
	//     untrustworthy → retry; a deterministic not-found (revoked case, or
	//     a real regression) still hard-fails after MAX_ATTEMPTS.
	async function scanCase(label, award, member, order, expect) {
		console.log(`--- case ${label} ---`);
		const MAX_ATTEMPTS = 4;
		// True when the page shows the not-found rejection but the relay
		// provably serves the award right now (see above).
		const notFoundContradicted = async () => {
			if (!(await page.locator(`text=${NOT_FOUND_MESSAGE}`).count())) return false;
			return (await pollRelay({ kinds: [8], ids: [award.id] }, 8000)).length > 0;
		};
		// The expected outcome marker, including this case's extra assertion:
		// the confirm step must name the product; a rejection must not offer a
		// fulfillment action. Both are checked again below via assert() so the
		// pass lines read like the other assertions.
		const expectedVisible = async () => {
			if (expect.type === 'confirm') {
				return (
					(await confirmButton().count()) > 0 &&
					(await page.locator('h1', { hasText: productName }).count()) > 0
				);
			}
			return (
				(await page.locator(`text=${expect.message}`).count()) > 0 &&
				(await confirmButton().count()) === 0
			);
		};
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			await openScannerPage(award, member, order);
			const deadline = Date.now() + 45000;
			let passed = false;
			while (Date.now() < deadline) {
				if (await expectedVisible()) {
					passed = true;
					break;
				}
				await page.waitForTimeout(500);
			}
			const duplicates = scanDetections > 1;
			if (duplicates)
				console.log(`ok - note: ${scanDetections} duplicate QR detections on this page (decode backlog under load)`);
			if (passed) {
				if (expect.type === 'confirm') {
					assert(
						await page.locator('h1', { hasText: productName }).count(),
						`${label}: product name shown on confirm step`
					);
				} else {
					assert(
						(await confirmButton().count()) === 0,
						`${label}: no fulfillment action offered for the rejected entitlement`
					);
				}
				return;
			}
			const observed = (await confirmButton().count())
				? 'confirm'
				: (await scanNextButton().count())
					? 'rejected'
					: null;
			const retry = (why) =>
				console.log(`ok - ${why}; retrying case on a fresh cold page (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
			if (attempt < MAX_ATTEMPTS) {
				if (observed === null) {
					retry('no scan outcome within 45s (camera/decode/vite flake)');
					continue;
				}
				if (duplicates) {
					retry('duplicate scans raced the first verification; expected outcome never observed before the overwrite');
					continue;
				}
				if (observed === 'rejected' && (await notFoundContradicted())) {
					retry('false not-found: relay verifiably serves the award (12s verification backstop raced — scan.svelte:757)');
					continue;
				}
			}
			await dumpBody(`case ${label} with unexpected outcome`);
			assert(
				false,
				`${label}: expected ${expect.type === 'confirm' ? 'the confirmation step' : `rejection "${expect.message}"`}; observed "${observed ?? 'nothing'}"`
			);
		}
		assert(false, `${label}: no clean scan after ${MAX_ATTEMPTS} cold-page attempts`);
	}

	// a. VALID control — must pass verification and reach the confirmation step.
	//    Deliberately NOT confirmed: the confirm-publish path is the subject of
	//    qa-scan-e2e.mjs (writers publish addressable kind 37237). This script's scope is verification
	//    acceptance/rejection.
	await scanCase('valid (control)', awardValid, memberValid, orderValid, { type: 'confirm' });

	// b. EXPIRED — NIP-40 rejection. The award was seeded with a short future
	//    expiration (strfry rejects already-expired writes); wait for it to lapse
	//    so the scanner's own expiration check is what rejects it.
	const untilExpiredMs = (expiredAwardExpiration - nowSeconds() + 2) * 1000;
	if (untilExpiredMs > 0) {
		console.log(`ok - waiting ${Math.ceil(untilExpiredMs / 1000)}s for the award expiration to lapse…`);
		await sleep(untilExpiredMs);
	}
	assert(
		expiredAwardExpiration <= nowSeconds(),
		'expired case: award expiration is now in the past (scanner must reject it, not the relay)'
	);
	await assertStored(awardExpired, 'expired case: lapsed award still served by the relay (no NIP-40 eviction)');
	await scanCase('expired', awardExpired, memberExpired, orderExpired, {
		type: 'reject',
		message: 'This entitlement has expired.'
	});

	// c. REVOKED — issuer-signed kind-5 honored. strfry evicted the award (see
	//    seeding), so the production-true outcome is the not-found rejection; the
	//    scanner's dedicated "revoked" branch is unreachable on this relay.
	await scanCase('revoked', awardRevoked, memberRevoked, orderRevoked, {
		type: 'reject',
		message: NOT_FOUND_MESSAGE
	});

	// d. WRONG-SIGNER delete — must be ignored; reaches confirmation.
	await scanCase('wrong-signer delete', awardWrongSigner, memberWrongSigner, orderWrongSigner, {
		type: 'confirm'
	});
	assert(
		(await page.locator('text=This entitlement has been revoked.').count()) === 0,
		'wrong-signer delete: revoked message NOT shown (foreign-signer deletion ignored)'
	);

	await page.screenshot({ path: '/tmp/expiry-revocation-final.png' });
	await browser.close();
	pool.destroy([RELAY]);
	console.log('E2E PASS');
	process.exit(0);
} catch (error) {
	console.error('FAIL:', error.message);
	try {
		const page = (await browser.contexts()[0]?.pages())?.[0];
		if (page) await page.screenshot({ path: '/tmp/expiry-revocation-failure.png' });
	} catch {}
	await browser.close().catch(() => {});
	pool.destroy([RELAY]);
	process.exit(1);
}
