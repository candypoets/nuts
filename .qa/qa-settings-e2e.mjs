// E2E: admin community-settings workflow against a provisioned QA community
// (qa-bootstrap.mjs --api, hospitality archetype).
//
// Source of truth (see src/components/admin/CommunityProfileSettings.svelte +
// src/lib/communityProfile.ts): the settings "Community" section edits the
// addressable kind-30078 app-data event with d=nuts-community-profile,
// published by the admin to the COMMUNITY RELAY ONLY (usePublish with
// defaultRelays=[relayUrl]). There is NO coordinator-API write and no NIP-11
// write; the community NAME shown in the dashboard header comes from the
// NIP-11 relay document (src/components/RelaysList.svelte -> fetchRelayInfo),
// which this UI does not edit, so no header-name assertion applies.
//
// Editable fields the UI actually offers:
//   - community type (6 archetype tiles)
//   - description (textarea, maxlength 200)
//   - community image — UPLOAD ONLY (blossom/NIP-96 file input, no URL field):
//     skipped per the no-uploads rule; noted in the output
//   - menu link + booking link (hospitality archetype only, type=url inputs)
//
// Flow:
//   1. Reads the provisioned community, snapshots the bootstrap-planted 30078
//   2. Pins admin/selectedRelayUrl (shared admin key; parallel runs can flip
//      the dashboard auto-select) and opens /admin/<relay>/settings
//   3. Negative cases: Save/Discard disabled when pristine; dirtying then
//      Discard reverts the form and re-disables both
//   4. Main edit: new description/menu/booking + type hospitality -> club.
//      Asserts the relay holds the replacement (same d, newer created_at,
//      admin-authored, all four tags)
//   5. Negative case: type back to hospitality, menu link set to a NON-http
//      URL -> buildCommunityProfileTags must drop the menu_url tag on the
//      wire (booking_url survives)
//   6. Restore: menu link back to a valid https URL -> menu_url returns
//   7. Reload the settings page: the saved values render back (not stale
//      cached ones), hospitality tile is selected, Save disabled again
//
// Run: QA_STATE=/tmp/qa-community-settings.json QA_DEV_PORT=5198 node .qa/qa-settings-e2e.mjs
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
const run = Math.floor(Date.now() / 1000).toString(36);

const PROFILE_KIND = 30078;
const PROFILE_D = 'nuts-community-profile';
const BOOTSTRAP_DESCRIPTION = 'QA bootstrap community - safe to delete.';

const description1 = `QA settings ${run}: updated through the admin settings UI.`;
const menuGood = `https://example.com/qa-menu-${run}`;
const bookingGood = `https://example.com/qa-booking-${run}`;
const menuBad = `ftp://qa-invalid.example/menu-${run}`; // non-http: must be dropped on save

console.log('target relay:', RELAY, `(provisioned: ${community.name})`);

const tagValue = (event, name) => event.tags.find((tag) => tag[0] === name)?.[1];

// Addressable event: the relay replaces per (pubkey, kind, d) keeping the
// newest created_at. created_at ties are broken by id for determinism (the
// sleeps between saves should make ties impossible anyway).
const latest = (events) =>
	events.reduce(
		(a, b) =>
			!a || b.created_at > a.created_at || (b.created_at === a.created_at && b.id > a.id) ? b : a,
		undefined
	);

async function queryProfile() {
	return pool
		.querySync([RELAY], { kinds: [PROFILE_KIND], authors: [keys.admin.pub], '#d': [PROFILE_D] })
		.catch(() => []);
}

// Relay propagation is not instant: poll until the latest profile matches.
async function pollProfile(label, predicate, timeoutMs = 25000) {
	const deadline = Date.now() + timeoutMs;
	let lastEvents = [];
	while (Date.now() < deadline) {
		lastEvents = await queryProfile();
		const event = latest(lastEvents);
		if (event && predicate(event)) return event;
		await sleep(1000);
	}
	console.log('---- relay 30078 events at timeout ----');
	console.log(JSON.stringify(lastEvents, null, 2));
	throw new Error('RELAY ASSERT TIMED OUT: ' + label);
}

// 0. Baseline: bootstrap --api planted the hospitality profile on the relay.
const baseline = latest(await queryProfile());
assert(baseline, 'bootstrap-planted community profile (30078) present on the relay');
assert(tagValue(baseline, 'type') === 'hospitality', 'baseline profile is the hospitality archetype');
const baselineCreatedAt = baseline.created_at;
console.log('ok - baseline profile created_at =', baselineCreatedAt);

const BASE = await ensureDevServer();
const browser = await launchBrowser();
let activePage;

// The floating Stripe notice overlays primary buttons on several admin screens.
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

// Pre-select OUR relay before the app's own init runs (same pattern as
// qa-invite-redeem-e2e.mjs): the shared admin key's adminRelays[0] auto-select
// can flip to a parallel run's community mid-session.
function plantSelectedRelay(relayUrl) {
	try {
		const normalized = relayUrl.replace(/\/+$/, '').toLowerCase() + '/';
		localStorage.setItem('admin/selectedRelayUrl', JSON.stringify(normalized));
	} catch {
		// best effort
	}
}

async function main() {
	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	await context.addInitScript(seedSession, browserAccount(keys.admin));
	await context.addInitScript(plantServiceBaseUrl, community);
	await context.addInitScript(plantSelectedRelay, RELAY);
	const page = await context.newPage();
	activePage = page;
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));

	// Wire evidence if anything misbehaves: log the profile EVENT the app sends
	// and the relay's OK response.
	const relayHost = new URL(RELAY.replace(/^ws/, 'http')).host;
	page.on('websocket', (ws) => {
		if (!ws.url().includes(relayHost)) return;
		ws.on('framesent', (frame) => {
			const payload = String(frame.payload || '');
			if (payload.includes('"EVENT"') && payload.includes(PROFILE_D))
				console.log('[ws tx EVENT]', payload.slice(0, 600));
		});
		ws.on('framereceived', (frame) => {
			const payload = String(frame.payload || '');
			if (payload.includes('"OK"')) console.log('[ws rx OK]', payload.slice(0, 300));
		});
	});

	// Selection guard (same pattern as qa-invite-redeem-e2e.mjs).
	const adminRelayPath = `/admin/${encodeURIComponent(RELAY)}`;
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

	// 1. Open the settings page (default section = Community profile).
	await gotoAdminSegment('settings', 'h1:has-text("Profile & type")');
	assert(true, 'settings screen renders for the provisioned community');
	await dismissNotice(page);

	const descriptionField = page.locator('textarea');
	const menuField = page.locator('input[placeholder="https://example.com/menu"]');
	const bookingField = page.locator('input[placeholder="https://example.com/reservations"]');
	const saveButton = page.getByRole('button', { name: 'Save changes' });
	const discardButton = page.getByRole('button', { name: 'Discard', exact: true });
	const SAVED_TEXT = 'text=Profile saved to the community relay.';

	// The form must hydrate from the relay profile (bootstrap description), not
	// from an empty/stale form.
	await page.waitForFunction(
		(expected) => document.querySelector('textarea')?.value === expected,
		BOOTSTRAP_DESCRIPTION,
		{ timeout: 30000 }
	);
	assert(true, 'settings form hydrates the bootstrap description from the relay profile');
	assert(
		(await page.locator('textarea').count()) === 1,
		'exactly one editable description field on the community settings section'
	);
	console.log('note - community image is upload-only in the UI (no URL field); skipped per the no-uploads rule');
	console.log('note - the UI offers no community name/banner field (name comes from the NIP-11 relay document)');

	// 2. Negative case A: pristine form -> both actions disabled.
	assert(await saveButton.isDisabled(), 'Save is disabled while the form is pristine');
	assert(await discardButton.isDisabled(), 'Discard is disabled while the form is pristine');

	// 3. Negative case B: dirty the description, then Discard must revert it.
	await descriptionField.fill(BOOTSTRAP_DESCRIPTION + ' (unsaved edit)');
	assert(await saveButton.isEnabled(), 'Save enables once the form is dirty');
	await discardButton.click();
	assert(
		(await descriptionField.inputValue()) === BOOTSTRAP_DESCRIPTION,
		'Discard reverts the unsaved description edit'
	);
	assert(await saveButton.isDisabled(), 'Save is disabled again after Discard');

	// Helper: publish through the UI and wait for the in-app confirmation. The
	// relay rejects a same-d replacement whose created_at is not newer
	// ("replaced: have newer event"), so cross a second boundary first.
	async function saveAndConfirm(label) {
		await sleep(2100);
		await saveButton.click();
		await page.waitForSelector(SAVED_TEXT, { timeout: 20000 });
		console.log('ok -', label);
	}

	// 4. Main edit: fill the hospitality link fields FIRST (the fieldset
	// unmounts when the archetype leaves hospitality; the bound values survive
	// and are still published), then switch the type to Members' club.
	await descriptionField.fill(description1);
	await menuField.fill(menuGood);
	await bookingField.fill(bookingGood);
	await page.getByRole('button', { name: "Members' club & nightlife" }).click();
	await saveAndConfirm('saved main edit (description + menu + booking + type=club)');

	const edit1 = await pollProfile('main edit on the relay', (event) => {
		return (
			tagValue(event, 'type') === 'club' &&
			tagValue(event, 'description') === description1 &&
			tagValue(event, 'menu_url') === menuGood &&
			tagValue(event, 'booking_url') === bookingGood
		);
	});
	assert(edit1.pubkey === keys.admin.pub, 'profile replacement authored by the admin');
	assert(tagValue(edit1, 'd') === PROFILE_D, 'profile replacement keeps d=nuts-community-profile');
	assert(
		edit1.created_at > baselineCreatedAt,
		`profile replacement has newer created_at (${edit1.created_at} > ${baselineCreatedAt})`
	);

	// 5. Negative case C: switch back to hospitality and set a NON-http menu
	// link. buildCommunityProfileTags only emits http(s) URLs, so the saved
	// event must carry NO menu_url tag while booking_url survives.
	await page.getByRole('button', { name: 'Restaurant, café & bar' }).click();
	await menuField.waitFor({ state: 'visible', timeout: 10000 });
	await menuField.fill(menuBad);
	assert(await saveButton.isEnabled(), 'Save enables for the non-http menu link edit');
	await saveAndConfirm('saved negative edit (non-http menu link)');

	const edit2 = await pollProfile('non-http menu link dropped on the relay', (event) => {
		return (
			event.created_at > edit1.created_at &&
			tagValue(event, 'type') === 'hospitality' &&
			tagValue(event, 'booking_url') === bookingGood
		);
	});
	assert(
		tagValue(edit2, 'menu_url') === undefined,
		'non-http menu link is dropped from the published tags (no menu_url)'
	);
	assert(
		tagValue(edit2, 'description') === description1,
		'negative edit keeps the updated description'
	);

	// 6. Restore the valid menu link so the final state is coherent.
	// (The field hydrated from edit2 -> menu field is empty now.)
	await menuField.fill(menuGood);
	await saveAndConfirm('saved restore edit (valid https menu link)');

	const edit3 = await pollProfile('restored menu link on the relay', (event) => {
		return event.created_at > edit2.created_at && tagValue(event, 'menu_url') === menuGood;
	});
	assert(tagValue(edit3, 'type') === 'hospitality', 'final profile is back on hospitality');
	assert(
		tagValue(edit3, 'booking_url') === bookingGood,
		'final profile keeps the booking link'
	);

	// 7. Reload the settings page: the saved values must render back from the
	// relay (not stale cached ones), with the form pristine again.
	await gotoAdminSegment('settings', 'h1:has-text("Profile & type")');
	await dismissNotice(page);
	await page.waitForFunction(
		(expected) => document.querySelector('textarea')?.value === expected,
		description1,
		{ timeout: 30000 }
	);
	assert(true, 'reloaded settings render the updated description from the relay');
	assert(
		(await menuField.inputValue()) === menuGood,
		'reloaded settings render the updated menu link'
	);
	assert(
		(await bookingField.inputValue()) === bookingGood,
		'reloaded settings render the updated booking link'
	);
	const hospitalityClass = await page
		.getByRole('button', { name: 'Restaurant, café & bar' })
		.getAttribute('class');
	assert(
		hospitalityClass?.includes('bg-emerald-950'),
		'reloaded settings mark the hospitality tile as selected'
	);
	assert(
		await saveButton.isDisabled(),
		'Save is disabled after reload (form matches the relay state)'
	);

	await page.screenshot({ path: '/tmp/settings-final.png' });
	console.log('E2E PASS');
	await browser.close();
	pool.destroy([RELAY]);
	process.exit(0);
}

main().catch(async (error) => {
	console.error('E2E FAIL:', String(error?.stack || error).slice(0, 1500));
	if (activePage) {
		await activePage
			.screenshot({ path: '/tmp/settings-failure.png', fullPage: true })
			.catch(() => {});
		console.error('failure screenshot at /tmp/settings-failure.png');
	}
	await browser.close().catch(() => {});
	pool.destroy([RELAY]);
	process.exit(1);
});
