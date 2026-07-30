// E2E: roles & permissions — the delegated-staff model of the admin dashboard.
// Everything else in the .qa harness tests as root admin; this script tests the
// NIP-58 role path end to end:
//
//   0. Test setup (Node): users[0] is made a COMMUNITY MEMBER exactly as the
//      invite-redeem flow would — a kind-8 award for the relay's required badge
//      (30009:<badge_issuer>:members) signed by the badge issuer key, fetched
//      from the coordinator's /relays/{id}/secrets. This is required for two
//      independent reasons:
//        a) The People table only lists pubkeys holding an award that matches a
//           role/membership definition on the relay, and the Assign-role modal
//           only opens from a member row's action menu (members/+page.svelte
//           openAssignModal) — there is no free-text "add member by pubkey".
//        b) The strfry badge-gate (strfry-badge-node/crates/gate) rejects every
//           write from a non-admin that does not hold a valid issuer-signed
//           membership award ("blocked: required badge missing"), so without it
//           the staff user could not publish anything in step 4.
//   0c. Row-visibility belt-and-braces: the People table only lists awards
//       whose `a` address matches a definition the page knows. The
//       badge-definitions feed is now cacheFirst:false/noCache:true (an
//       earlier cacheFirst version served a frozen OPFS snapshot — never
//       revalidated — and could hide the issuer's `members` definition; the
//       bug was verified by WS probe and is now fixed), so the membership
//       definition arrives live. The script ADDITIONALLY creates a
//       permissionless "base" role through the UI and seeds a base-role award
//       from Node so the staff row does not depend on a single feed.
//       (The related poisoning bug on the ROLES page feed is also fixed:
//       that feed is cacheFirst:false/noCache:true, and step 1 visits
//       /admin/members FIRST as a regression for exactly that fix.)
//   1. Admin creates a ROLE through the roles UI granting `store`; the kind
//      30009 role definition is asserted on the relay (type/t/name/permission).
//   2. Admin awards the role to users[0] through the People UI (row action menu
//      -> Assign role); the kind-8 award is asserted on the relay.
//   3. A second browser context (users[0]) opens the community admin: the
//      layout's permission gating must show Store + Orders but NOT
//      Invites/People/Events (and no settings entry in the community menu).
//   4. Delegated authorization: users[0] creates a product through the store
//      manager; its kind 30009 lands on the relay authored by users[0].
//   5. Revocation. NOTE: the app has NO revocation UI (MemberProfileModal is
//      read-only; "Ban member" is a NIP-86 relay ban, not a role revocation).
//      The revocation the app's own code understands is NIP-09: both the
//      members page (handleRoleDeletion) and the roles page
//      (applyRoleDefinitionDeletion) drop awards whose id appears in the `e`
//      tags of a kind-5 signed by the award's author, and strfry deletes the
//      kind-8 itself. We publish exactly that kind-5 as admin from Node, then
//      assert: the award is gone from the relay; the admin People UI drops the
//      role badge live; the staff context loses Store/Orders nav and is bounced
//      out of /admin/.../store back to /admin.
//
// Run: QA_STATE=/tmp/qa-community-roles.json QA_DEV_PORT=5196 node .qa/qa-roles-e2e.mjs
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
	readCommunity,
	seedSession,
	signEvent,
	sleep
} from './qa-lib.mjs';

const community = readCommunity();
assert(community?.relay_url, 'community state present (run qa-bootstrap.mjs --api first)');
const keys = loadKeys();
const staff = keys.users?.[0];
assert(staff?.pub, 'keys file has users[0] (the staff/member test account)');
const RELAY = community.relay_url;
const pool = makePool();
const run = Math.floor(Date.now() / 1000).toString(36);

const roleName = `QA Staff ${run}`;
const roleDescription = `Delegated store staff ${run}`;
// Mirrors src/lib/nip58Roles.ts roleDFromName.
const dFromName = (name) =>
	name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
const roleD = dFromName(roleName);
const roleAddress = `30009:${keys.admin.pub}:${roleD}`;

// Belt-and-braces row anchor (see header note 0c): the People table's awards
// feed and badge-definitions feed are both noCache now and deliver live. To
// keep the staff row independent of any single feed, the script also creates
// a second, permissionless "base" role through the UI and seeds a base-role
// award for the staff user from Node (admin-signed): the row then builds from
// a known role def + the live award as well as from the issuer's membership
// definition.
const baseRoleName = `QA Base ${run}`;
const baseRoleD = dFromName(baseRoleName);
const baseRoleAddress = `30009:${keys.admin.pub}:${baseRoleD}`;

const staffProduct = `QA Staff Brew ${run}`;
const staffSection = `QA Staff Shelf ${run}`;
const staffPrice = '2.5';
const staffPrefix = staff.pub.slice(0, 6).toUpperCase(); // members page memberLabel()

console.log('target relay:', RELAY, `(provisioned: ${community.name})`);
console.log('staff account:', staff.pub.slice(0, 12) + '…', 'role:', roleName, `(d=${roleD})`);

const tagValue = (event, name, index = 1) =>
	event.tags.find((tag) => tag[0] === name)?.[index];

// Relay propagation is not instant: poll querySync until `predicate` matches.
async function pollRelay(label, filter, predicate, timeoutMs = 20000) {
	const deadline = Date.now() + timeoutMs;
	let lastEvents = [];
	while (Date.now() < deadline) {
		const events = await pool.querySync([RELAY], filter).catch(() => []);
		lastEvents = events;
		const match = predicate(events);
		if (match) return match;
		await sleep(1000);
	}
	console.log('---- relay events at timeout ----', JSON.stringify(filter));
	console.log(JSON.stringify(lastEvents, null, 2).slice(0, 4000));
	throw new Error('RELAY ASSERT TIMED OUT: ' + label);
}

// ── 0. Test setup: issuer-signed membership award for the staff user ─────────
const relayView = await getRelay(community.id, keys);
assert(relayView.badge_issuer_pubkey, 'coordinator RelayView exposes badge_issuer_pubkey');
assert(relayView.required_badge, 'coordinator RelayView exposes required_badge');
const secrets = await getRelaySecrets(community.id, keys);
assert(secrets?.badge_issuer_secret_key, 'coordinator exposes the badge issuer secret key');

// The invite service self-publishes the members definition at startup; the
// People table only lists awards whose `a` address matches a definition.
await pollRelay(
	'30009:<issuer>:members definition present (invite service startup)',
	{ kinds: [30009], authors: [relayView.badge_issuer_pubkey], '#d': ['members'] },
	(events) => events.find((event) => tagValue(event, 'd') === 'members'),
	60000
);

const membershipAward = signEvent(
	{ kind: 8, tags: [['a', relayView.required_badge], ['p', staff.pub]] },
	secrets.badge_issuer_secret_key
);
await pool.publish([RELAY], membershipAward);
await pollRelay(
	'issuer-signed membership award for staff on the relay',
	{ kinds: [8], authors: [relayView.badge_issuer_pubkey], '#p': [staff.pub] },
	(events) => events.some((event) => event.id === membershipAward.id)
);
// The badge-gate learns memberships from its own live subscription to the
// relay; give it a moment before the staff user starts writing.
await sleep(3000);
console.log('ok - staff user holds an issuer-signed membership award (gate will accept writes)');

const BASE = await ensureDevServer();
const browser = await launchBrowser();
let activePage; // for the failure screenshot

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
			// On a loaded machine the vite dev server can be killed mid-run; once
			// the port is dead, ensureDevServer respawns it (retryable flake).
			if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(String(error))) {
				console.log('   (dev server unreachable, respawning via ensureDevServer)');
				await ensureDevServer().catch(() => {});
			}
			await page.waitForTimeout(2500);
		}
	}
	throw lastError;
}

// Pre-select OUR relay before the app's own init runs (shared admin key /
// parallel QA runs can flip the dashboard auto-select to a foreign community).
function plantSelectedRelay(relayUrl) {
	try {
		const normalized = relayUrl.replace(/\/+$/, '').toLowerCase() + '/';
		localStorage.setItem('admin/selectedRelayUrl', JSON.stringify(normalized));
	} catch {
		// best effort
	}
}

const relayHost = new URL(RELAY.replace(/^ws/, 'http')).host;
const adminRelayPath = `/admin/${encodeURIComponent(RELAY)}`;

function selectedRelayMatches(page) {
	return page
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
}

async function gotoAdminSegment(page, segment, selector) {
	const url = `${BASE}${adminRelayPath}/${segment}`;
	let lastError;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			await gotoRetry(page, url, selector, 30000);
			if (await selectedRelayMatches(page)) return;
			console.log('   (admin relay selection pointed at a foreign community, re-selecting ours)');
		} catch (error) {
			lastError = error;
		}
		await page.waitForTimeout(2000);
	}
	throw lastError || new Error(`admin relay selection did not stick on ${RELAY}`);
}

// Diagnostics: observe the members-page subscriptions (kind-8 awards feed and
// the badge-definitions feed — both noCache, so both appear on the wire under
// their page-level 'admin_member_' ids). The People row only renders once
// BOTH the awards feed and a definition delivered, and on a loaded machine
// either can stall silently.
function attachWsSniffer(targetPage) {
	targetPage.on('websocket', (ws) => {
		if (!ws.url().includes(relayHost)) return;
		ws.on('framereceived', (frame) => {
			const payload = String(frame.payload || '');
			if (payload.includes('admin_member_') || payload.includes('"kind":8')) {
				console.log('[ws rx]', payload.slice(0, 220));
			}
		});
	});
}

async function main() {
	// ── Admin context ──────────────────────────────────────────────────────
	const adminCtx = await browser.newContext({
		viewport: { width: 1600, height: 1000 },
		ignoreHTTPSErrors: true
	});
	await adminCtx.addInitScript(seedSession, browserAccount(keys.admin));
	await adminCtx.addInitScript(plantServiceBaseUrl, community);
	await adminCtx.addInitScript(plantSelectedRelay, RELAY);
	const page = await adminCtx.newPage();
	activePage = page;
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));
	page.on('dialog', (dialog) => {
		console.log('   (confirm dialog accepted:', dialog.message().slice(0, 80) + ')');
		dialog.accept();
	});
	attachWsSniffer(page);

	// ── 1. Create the roles through the roles UI ─────────────────────────────
	// Visit /admin/members FIRST, deliberately: a previous app bug let the
	// members page's cacheFirst badge-definitions feed poison the roles page's
	// own feed (created role definitions never streamed live, "Roles 0",
	// Assign role disabled). Both feeds are now cacheFirst:false/noCache:true
	// (regressions fixed), so the canary below must pass even after this
	// detour, and step 2 reuses THIS context — a plain reload of the members
	// page must now serve live relay data, not a frozen OPFS snapshot. The
	// layout maps the 'roles' path segment to 'members' (adminSegmentFromPath),
	// so after pinning the relay through the members segment we open
	// /admin/roles directly.
	await gotoAdminSegment(page, 'members', 'h1:has-text("People")');
	await gotoRetry(page, `${BASE}/admin/roles`, 'h1:has-text("Roles")', 30000);
	assert(true, 'roles screen renders after the members-page detour');
	await dismissNotice(page);

	async function createRoleViaUi(name, description, { grantStore = false } = {}) {
		await page.getByRole('button', { name: 'New role' }).click();
		const roleDialog = page.getByRole('dialog', { name: 'New role' });
		await roleDialog.waitFor({ timeout: 15000 });
		await roleDialog.locator('input[placeholder="Member"]').fill(name);
		await roleDialog.locator('textarea').fill(description);
		if (grantStore) {
			// Default permissions are posts+media only; grant `store` on top. Leave
			// the defaults as-is — the staff nav assertions below distinguish
			// granted (store/orders) from not-granted (invites/people/events).
			const storeToggle = roleDialog
				.locator('label', { hasText: 'Manage store' })
				.locator('input[type="checkbox"]');
			if (!(await storeToggle.isChecked())) await storeToggle.click();
			assert(
				await storeToggle.isChecked(),
				'Manage store permission toggled on in the new-role modal'
			);
		}
		const invitesToggle = roleDialog
			.locator('label', { hasText: 'Invite members' })
			.locator('input[type="checkbox"]');
		assert(!(await invitesToggle.isChecked()), 'Invite members permission stays off');
		await roleDialog.getByRole('button', { name: 'Create role', exact: true }).click();
		// Canary: the new role only appears as a table column once the page's
		// LIVE definitions feed delivers it (which is also what writes it into
		// the local cache the members page later reads). If this times out, the
		// feed is cache-only and the whole assign flow would break downstream.
		await page.locator('thead th', { hasText: name }).first().waitFor({ timeout: 60000 });
	}

	// 1a. Permissionless base role (row-visibility workaround, see constants).
	await createRoleViaUi(baseRoleName, `Base row-presence role ${run}`);
	await page.waitForSelector('text=Role published', { timeout: 30000 });
	assert(true, 'roles UI reports "Role published" (relay accepted the definition)');
	const baseDefinition = await pollRelay(
		'base role definition on the relay',
		{ kinds: [30009], authors: [keys.admin.pub], '#d': [baseRoleD] },
		(events) => events.find((event) => tagValue(event, 'd') === baseRoleD)
	);
	assert(
		tagValue(baseDefinition, 'type') === 'role' &&
			baseDefinition.tags.some((tag) => tag[0] === 't' && tag[1] === 'role'),
		'base role definition classified type=role + t=role'
	);

	// 1b. The store role under test.
	await createRoleViaUi(roleName, roleDescription, { grantStore: true });
	const roleDefinition = await pollRelay(
		'role definition on the relay',
		{ kinds: [30009], authors: [keys.admin.pub], '#d': [roleD] },
		(events) => events.find((event) => tagValue(event, 'd') === roleD),
		30000
	);
	assert(tagValue(roleDefinition, 'type') === 'role', 'role definition has type=role');
	assert(
		roleDefinition.tags.some((tag) => tag[0] === 't' && tag[1] === 'role'),
		'role definition has t=role'
	);
	assert(
		!roleDefinition.tags.some((tag) => tag[0] === 't' && tag[1] === 'sellable'),
		'role definition is NOT sellable'
	);
	assert(tagValue(roleDefinition, 'name') === roleName, 'role definition carries the role name');
	assert(
		tagValue(roleDefinition, 'description') === roleDescription,
		'role definition carries the description'
	);
	const permissions = roleDefinition.tags
		.filter((tag) => tag[0] === 'permission')
		.map((tag) => tag[1]);
	assert(permissions.includes('store'), 'role definition grants the store permission');
	assert(
		!permissions.includes('invites') && !permissions.includes('settings'),
		'role definition does NOT grant invites/settings'
	);
	console.log('ok - relay holds role definition', roleAddress, 'permissions:', permissions);

	// ── 2. Award the store role to users[0] through the People UI ───────────
	// Seed the base-role award (row-visibility workaround; admin-signed, so it
	// is also a valid permissionless role award for access resolution).
	const baseAward = signEvent(
		{ kind: 8, tags: [['a', baseRoleAddress], ['p', staff.pub]] },
		keys.admin.priv
	);
	await pool.publish([RELAY], baseAward);
	await pollRelay(
		'base role award for staff on the relay',
		{ kinds: [8], authors: [keys.admin.pub], '#p': [staff.pub] },
		(events) => events.some((event) => event.id === baseAward.id)
	);

	// ── 2. Award the role through the People UI ──────────────────────────────
	// The members page's badge-definitions feed is now cacheFirst:false/
	// noCache:true (same treatment as the roles page): every load — including
	// the plain reloads used as retries below — serves live relay data, not a
	// frozen OPFS snapshot. (The earlier cacheFirst incarnation froze an empty
	// #t=role result on the members-first detour and never re-asked the relay;
	// that residual bug is fixed, so the whole flow runs in ONE context.)
	await gotoAdminSegment(page, 'members', 'h1:has-text("People")');
	await dismissNotice(page);

	// The staff member row renders once the base-role award arrives (live
	// noCache feed) and matches the base-role definition (now also fetched
	// live). The feeds can still take a while on a loaded machine — a reload
	// RESTARTS the subscriptions against live relay data, so wait long first
	// and only reload once as a last resort.
	const moreActions = page.getByLabel(`More actions for Member ${staffPrefix}`);
	let rowVisible = await moreActions
		.waitFor({ timeout: 120000 })
		.then(() => true)
		.catch(() => false);
	if (!rowVisible) {
		console.log('   (staff row not listed yet, reloading the members page once)');
		await gotoRetry(page, `${BASE}/admin/members`, 'h1:has-text("People")', 30000);
		await dismissNotice(page);
		rowVisible = await moreActions
			.waitFor({ timeout: 120000 })
			.then(() => true)
			.catch(() => false);
	}
	if (!rowVisible) {
		console.log('---- main text at members failure ----');
		console.log(await page.locator('main').innerText().catch(() => '(none)'));
		const awards = await pool.querySync([RELAY], { kinds: [8], '#p': [staff.pub] }).catch(() => []);
		console.log('---- relay kind-8 awards for staff at failure ----');
		console.log(JSON.stringify(awards, null, 2).slice(0, 2000));
	}
	assert(rowVisible, 'staff member listed in the People table');
	// The "Assign role" menu item stays disabled until the page's role-definition
	// feed yields at least one definition (disabled={!roleDefinitions.length}).
	// The feed is noCache now, so a reload re-fetches live definitions — retry
	// with full page reloads in between.
	let dialogOpen = false;
	let lastAssignError;
	for (let attempt = 0; attempt < 3 && !dialogOpen; attempt++) {
		try {
			if (attempt > 0) {
				console.log('   (role definitions not loaded on the members page, reloading)');
				await gotoRetry(page, `${BASE}/admin/members`, 'h1:has-text("People")', 30000);
				await dismissNotice(page);
				await moreActions.waitFor({ timeout: 120000 });
			}
			await moreActions.click();
			await page.waitForFunction(
				() => {
					const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
						el.textContent?.includes('Assign role')
					);
					return Boolean(item && !(item instanceof HTMLButtonElement && item.disabled));
				},
				undefined,
				{ timeout: 45000 }
			);
			await page.getByRole('menuitem', { name: 'Assign role' }).click();
			await page.getByRole('dialog', { name: 'Assign role' }).waitFor({ timeout: 15000 });
			dialogOpen = true;
		} catch (error) {
			lastAssignError = error;
			console.log('   (Assign role menu item not ready, reopening the action menu)');
			await page.keyboard.press('Escape');
			await page.waitForTimeout(2000);
		}
	}
	if (!dialogOpen) throw lastAssignError || new Error('could not open the Assign role dialog');
	const assignDialog = page.getByRole('dialog', { name: 'Assign role' });
	await assignDialog.locator('select').selectOption({ label: roleName });
	await assignDialog.getByRole('button', { name: 'Assign role', exact: true }).click();
	await page.waitForSelector('text=Role assignment saved', { timeout: 30000 });
	assert(true, 'members UI reports "Role assignment saved"');

	const award = await pollRelay(
		'kind-8 role award on the relay',
		{ kinds: [8], authors: [keys.admin.pub], '#p': [staff.pub] },
		(events) =>
			events.find(
				(event) =>
					tagValue(event, 'a') === roleAddress &&
					event.tags.some((tag) => tag[0] === 'p' && tag[1] === staff.pub)
			)
	);
	assert(award.pubkey === keys.admin.pub, 'role award authored by the community admin');
	assert(tagValue(award, 'a') === roleAddress, `award references ${roleAddress}`);
	assert(!tagValue(award, 'expiration'), 'award has no expiration (awarded indefinitely)');
	console.log('ok - relay holds the role award', award.id.slice(0, 16) + '…');

	// ── 3-4. Staff context: permission-gated nav + delegated publishing ────
	const staffCtx = await browser.newContext({
		viewport: { width: 1600, height: 1000 },
		ignoreHTTPSErrors: true
	});
	await staffCtx.addInitScript(seedSession, browserAccount(staff));
	await staffCtx.addInitScript(plantServiceBaseUrl, community);
	await staffCtx.addInitScript(plantSelectedRelay, RELAY);
	const staffPage = await staffCtx.newPage();
	activePage = staffPage;
	staffPage.on('pageerror', (err) => console.log('[pageerror:staff]', String(err).slice(0, 300)));

	await gotoRetry(staffPage, `${BASE}${adminRelayPath}/store`, 'text=Community catalog', 45000);
	assert(true, 'staff user can open the community store manager');
	// The encoded-relay URL renders the page before the layout's client-side
	// redirect to /admin/store runs — wait for the URL to settle.
	const settledOnStore = await staffPage
		.waitForFunction(() => location.pathname.replace(/\/+$/, '') === '/admin/store', undefined, {
			timeout: 30000
		})
		.then(() => true)
		.catch(() => false);
	assert(settledOnStore, 'staff session settles on /admin/store (not bounced to /admin)');

	const nav = staffPage.locator('nav[aria-label="Admin navigation"]');
	await nav.getByRole('link', { name: 'Dashboard', exact: true }).waitFor({ timeout: 30000 });
	await nav.getByRole('link', { name: 'Store', exact: true }).waitFor({ timeout: 30000 });
	assert(true, 'staff nav shows Store');
	assert(
		(await nav.getByRole('link', { name: 'Orders', exact: true }).count()) === 1,
		'staff nav shows Orders (store permission)'
	);
	assert(
		(await nav.getByRole('link', { name: 'Invites', exact: true }).count()) === 0,
		'staff nav does NOT show Invites'
	);
	assert(
		(await nav.getByRole('link', { name: 'People', exact: true }).count()) === 0,
		'staff nav does NOT show People (needs moderation/settings)'
	);
	assert(
		(await nav.getByRole('link', { name: 'Events', exact: true }).count()) === 0,
		'staff nav does NOT show Events'
	);

	// Settings restriction: the floating PaymentSetupNotice only renders when the
	// resolved access includes the `settings` permission (admin/+layout.svelte),
	// so for staff it must not exist at all. (The community-menu settings entry
	// is gated the same way, but the menu button itself can be stuck behind the
	// header's relay-discovery "Loading..." state, so we assert the notice gate
	// instead.)
	assert(
		(await staffPage.getByRole('button', { name: 'Dismiss payment setup notice' }).count()) === 0,
		'no settings-gated payment notice renders for staff'
	);

	// Delegated authorization: the store manager must accept a buyable
	// definition authored by a current role holder, and the relay must store it.
	await staffPage.getByRole('button', { name: /^Add / }).first().click();
	await staffPage.waitForSelector('input[placeholder="Flat white"]', { timeout: 15000 });
	await staffPage
		.locator('select')
		.filter({ has: staffPage.locator('option[value="food"]') })
		.selectOption('food');
	await staffPage.fill('input[placeholder="Flat white"]', staffProduct);
	await staffPage.fill('input[placeholder="4.50"]', staffPrice);
	await staffPage.fill('input[placeholder="Drinks"]', staffSection);
	await staffPage
		.locator('footer')
		.getByRole('button', { name: 'Add item', exact: true })
		.click();
	console.log('ok - staff submitted new product', staffProduct);

	// Catalog presentation renders items as <article>; the hospitality menu
	// presentation renders food/drink items as rows (same fallback as
	// qa-store-e2e.mjs).
	let staffCard = staffPage.locator('article').filter({ hasText: staffProduct });
	const articleVisible = await staffCard
		.first()
		.waitFor({ timeout: 45000 })
		.then(() => true)
		.catch(() => false);
	if (!articleVisible) {
		staffCard = staffPage
			.locator('div.flex.flex-col.gap-4.p-5')
			.filter({ hasText: staffProduct });
	}
	const staffCardVisible = await staffCard
		.first()
		.waitFor({ timeout: 10000 })
		.then(() => true)
		.catch(() => false);
	if (!staffCardVisible) {
		console.log('---- staff store main text at create failure ----');
		console.log(await staffPage.locator('main').innerText().catch(() => '(none)'));
	}
	assert(staffCardVisible, 'staff-created product renders in the staff store list');

	const staffDefinition = await pollRelay(
		'staff-authored product on the relay',
		{ kinds: [30009], authors: [staff.pub] },
		(events) => events.find((event) => tagValue(event, 'name') === staffProduct),
		30000
	);
	assert(staffDefinition.pubkey === staff.pub, 'product definition authored by the staff user');
	assert(tagValue(staffDefinition, 'type') === 'product', 'staff product has type=product');
	assert(
		staffDefinition.tags.some((tag) => tag[0] === 't' && tag[1] === 'sellable'),
		'staff product has t=sellable'
	);
	assert(tagValue(staffDefinition, 'd'), 'staff product carries a d tag');
	console.log(
		'ok - relay accepted the staff-authored buyable definition (delegated authorization);',
		'availability =',
		tagValue(staffDefinition, 'availability')
	);

	// ── 5. Revocation (NIP-09 kind 5 — the only revocation the app honors) ──
	activePage = page; // admin People page is still open; it should update live
	const revocation = signEvent({ kind: 5, tags: [['e', award.id]] }, keys.admin.priv);
	await pool.publish([RELAY], revocation);
	console.log('ok - published kind-5 revocation for award', award.id.slice(0, 16) + '…');

	// Relay level: strfry deletes the kind-8 (same author as the kind-5).
	const awardGone = await pollRelay(
		'role award deleted from the relay',
		{ kinds: [8], authors: [keys.admin.pub], '#p': [staff.pub] },
		(events) => (events.every((event) => event.id !== award.id) ? true : undefined),
		20000
	);
	assert(awardGone, 'relay no longer serves the revoked award');

	// Admin UI level: the OPEN People page must drop the badge LIVE when the
	// kind-5 arrives (its awards subscription includes kind 5;
	// handleRoleDeletion matches `e` tags against the real award id — the
	// optimistic synthetic-id entry from assignRole is replaced by the real
	// relay event on the createdAt tie). No reload, just the relay round-trip.
	const staffRow = page.getByRole('button', { name: `View Member ${staffPrefix}'s profile` });
	let badgeGone = false;
	let rowGoneSeconds = 0;
	const badgeDeadline = Date.now() + 45000;
	while (Date.now() < badgeDeadline && !badgeGone) {
		const rowCount = await staffRow.count();
		badgeGone = rowCount > 0 && (await staffRow.locator(`text=${roleName}`).count()) === 0;
		// Diagnostic: the kind-5 deletes ONE award; the row itself must survive
		// (base-role and membership awards still match live-fetched
		// definitions). A vanishing row was the signature of the old
		// cacheFirst/OPFS freeze bug — break early to fail fast if it ever
		// regresses instead of waiting out the full poll.
		rowGoneSeconds = rowCount === 0 ? rowGoneSeconds + 1 : 0;
		if (badgeGone || rowGoneSeconds >= 8) break;
		await page.waitForTimeout(1000);
	}
	assert(
		rowGoneSeconds < 8,
		'staff row stays on the open People page through revocation (row vanished — possible cacheFirst/OPFS regression)'
	);
	assert(badgeGone, 'open People page drops the revoked role badge LIVE (no reload)');

	// Staff level: reload the store manager — access is re-resolved from the
	// relay, finds no award, and the layout bounces the staff user to /admin.
	await staffPage.goto(`${BASE}${adminRelayPath}/store`, { waitUntil: 'domcontentloaded' });
	let bounced = false;
	const bounceDeadline = Date.now() + 45000;
	while (Date.now() < bounceDeadline && !bounced) {
		const pathname = new URL(staffPage.url()).pathname.replace(/\/+$/, '');
		bounced = pathname === '/admin';
		if (!bounced) await staffPage.waitForTimeout(1000);
	}
	assert(bounced, 'revoked staff user is bounced out of /admin/.../store back to /admin');
	const staffNavAfter = staffPage.locator('nav[aria-label="Admin navigation"]');
	assert(
		(await staffNavAfter.getByRole('link', { name: 'Store', exact: true }).count()) === 0,
		'revoked staff nav no longer shows Store'
	);
	assert(
		(await staffNavAfter.getByRole('link', { name: 'Orders', exact: true }).count()) === 0,
		'revoked staff nav no longer shows Orders'
	);
	assert(
		(await staffNavAfter.getByRole('link', { name: 'Dashboard', exact: true }).count()) === 1,
		'revoked staff nav keeps only Dashboard'
	);

	await page.screenshot({ path: '/tmp/roles-final.png' });
	console.log('E2E PASS');
	await browser.close();
	pool.destroy([RELAY]);
	process.exit(0);
}

main().catch(async (error) => {
	console.error(String(error?.stack || error).slice(0, 2000));
	if (activePage) {
		await activePage
			.screenshot({ path: '/tmp/roles-failure.png', fullPage: true })
			.catch(() => {});
		console.error('failure screenshot at /tmp/roles-failure.png');
	}
	await browser.close().catch(() => {});
	pool.destroy([RELAY]);
	process.exit(1);
});
