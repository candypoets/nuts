// E2E: People page -> MemberProfileModal actions + the "Ban member" flow
// (kind-5 membership-badge revocation). qa-roles-e2e.mjs covers the People
// table rendering and role assignment/revocation; this script covers what that
// one does not:
//
//   What MemberProfileModal.svelte ACTUALLY exposes (it is read-only — verified
//   by reading the source): view profile (kind-0 display name/picture/nip05/
//   about, community roles, membership expiry, status, npub), a Copy-address
//   button, and three close paths (X button, Escape key, backdrop click). It
//   has NO assign-role, remove-role, ban, or message actions; role assignment
//   lives in the row action menu (covered by qa-roles-e2e.mjs) and so does
//   "Ban member".
//
//   Ban mechanism (current implementation): members/+page.svelte banMember()
//   finds the member's membership award(s) in roleAwards (roleAddress matching
//   a membership definition address) and publishes an ADMIN-SIGNED kind 5 with
//   ['e', <awardId>] tags + ['k','8'] via usePublish, content = the ban reason.
//   The relay gate (strfry-badge-relay-node) honors kind-5 deletions of
//   membership awards signed by an admin or the badge issuer: it drops the
//   award ids from its membership cache, so has_valid_membership starts
//   failing for the banned key. (This replaced the earlier NIP-86 `banpubkey`
//   RPC approach, which could never work — strfry implements no NIP-86 and its
//   CORS preflight rejects the authorization header.)
//
//   0. Test setup (Node): users[0] and users[1] become COMMUNITY MEMBERS
//      exactly as the invite-redeem flow would — kind-8 awards for the relay's
//      required badge (30009:<badge_issuer>:members) signed by the badge
//      issuer key (coordinator /relays/{id}/secrets). Both then publish NAMED
//      kind-0 profiles (name/about/picture/nip05) to the community relay
//      themselves: the dashboard resolves member profiles from the community
//      relay ONLY (members/+page.svelte syncMemberProfiles: cacheFirst:false,
//      noCache:true, relays:[relayUrl]). The badge-gate must first learn the
//      memberships from its own live subscription before member writes pass.
//   1. People table renders both members BY NAME (not a hex/npub fallback).
//   2. Row click opens the modal: asserts the kind-0 name (not the pubkey
//      fallback), picture img with the seeded src, about text, nip05, the
//      Member role badge, "No expiration", "Active", and the exact npub.
//      Negative: the dialog contains no ban/assign/message actions.
//   3. Copy address -> "Copied" and the clipboard holds the npub.
//   4. All three close paths: Escape, the X button (menu -> "View member"
//      reopen), and the backdrop click.
//   5. Ban member (users[1]) through the row menu: Cancel path first, then
//      confirm -> success text "Member banned: their membership badge was
//      revoked.", the dialog closes, and the member's row disappears from the
//      open People table LIVE (no reload). Relay assertions via nak: the
//      admin-signed kind 5 references the membership award id (+ ['k','8'] +
//      the reason as content). NOTE: the issuer-signed kind-8 award itself
//      stays in relay storage (strfry NIP-09 deletes only same-author events
//      — verified live; pinned by an assertion so it flips if the relay ever
//      gains cross-author deletion). Gate assertion: a raw-WS kind-1 write
//      from the banned key is REJECTED ("blocked: required badge missing" /
//      "restricted:") — proving the gate cache dropped the membership, not
//      just the client-side view.
//   6. Negative: the root admin's own row keeps "Ban member" DISABLED with the
//      "Relay administrators cannot be banned here" tooltip.
//
// Run: QA_STATE=/tmp/qa-community-members.json QA_DEV_PORT=5199 node .qa/qa-members-modal-e2e.mjs
import { execFile } from 'child_process';
import { promisify } from 'util';
import WebSocket from 'ws';
import { nip19 } from 'nostr-tools';
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
const member1 = keys.users?.[0];
const member2 = keys.users?.[1];
assert(member1?.pub && member2?.pub, 'keys file has users[0] and users[1] (the member test accounts)');
const RELAY = community.relay_url;
const pool = makePool();
const run = Math.floor(Date.now() / 1000).toString(36);

const profile1 = {
	name: `QA Member One ${run}`,
	about: `First QA member bio ${run}`,
	picture: `https://example.invalid/avatar-one-${run}.png`,
	nip05: `qa-one-${run}@example.invalid`
};
const profile2 = {
	name: `QA Member Two ${run}`,
	about: `Second QA member bio ${run}`,
	picture: `https://example.invalid/avatar-two-${run}.png`
};
const banReason = `QA ban reason ${run}`;

const prefix1 = member1.pub.slice(0, 6).toUpperCase(); // members page memberLabel()
const prefix2 = member2.pub.slice(0, 6).toUpperCase();
const adminPrefix = keys.admin.pub.slice(0, 6).toUpperCase();
const npub1 = nip19.npubEncode(member1.pub);

console.log('target relay:', RELAY, `(provisioned: ${community.name})`);
console.log('members:', prefix1, prefix2);

const tagValue = (event, name, index = 1) =>
	event.tags.find((tag) => tag[0] === name)?.[index];

const execFileAsync = promisify(execFile);

// nak CLI query against the community relay (closes on EOSE); returns events.
// nak reads an optional filter from stdin, so leave it a pipe and it hangs
// after connecting — close stdin immediately (EOF) to unblock it.
async function nakReq(args, timeoutMs = 20000) {
	const request = execFileAsync('nak', ['req', ...args, RELAY], {
		timeout: timeoutMs
	});
	request.child.stdin.end();
	const { stdout } = await request;
	return stdout
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return undefined;
			}
		})
		.filter((event) => event?.id);
}

// Relay propagation is not instant: poll a nak query until `predicate` matches.
async function pollNak(label, args, predicate, timeoutMs = 20000) {
	const deadline = Date.now() + timeoutMs;
	let lastEvents = [];
	while (Date.now() < deadline) {
		const events = await nakReq(args).catch(() => []);
		lastEvents = events;
		const match = predicate(events);
		if (match) return match;
		await sleep(1000);
	}
	console.log('---- nak events at timeout ----', JSON.stringify(args));
	console.log(JSON.stringify(lastEvents, null, 2).slice(0, 4000));
	throw new Error('RELAY ASSERT TIMED OUT: ' + label);
}

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

// Sends one EVENT over a raw websocket and returns the relay's OK verdict.
// pool.publish swallows the OK message, so a banned-write assertion needs this.
function publishVerdict(event, timeoutMs = 15000) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(RELAY);
		const timer = setTimeout(() => {
			ws.terminate();
			reject(new Error('timed out waiting for the relay OK message'));
		}, timeoutMs);
		ws.on('open', () => ws.send(JSON.stringify(['EVENT', event])));
		ws.on('message', (data) => {
			let frame;
			try {
				frame = JSON.parse(String(data));
			} catch {
				return;
			}
			if (frame?.[0] === 'OK' && frame?.[1] === event.id) {
				clearTimeout(timer);
				ws.close();
				resolve({ accepted: frame[2] === true, message: String(frame[3] || '') });
			}
		});
		ws.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}

// ── 0. Test setup: issuer-signed membership awards + named kind-0s ──────────
let membershipAwardId2; // member2's award id — the ban's kind-5 must reference it
const relayView = await getRelay(community.id, keys);
assert(relayView.badge_issuer_pubkey, 'coordinator RelayView exposes badge_issuer_pubkey');
assert(relayView.required_badge, 'coordinator RelayView exposes required_badge');
const secrets = await getRelaySecrets(community.id, keys);
assert(secrets?.badge_issuer_secret_key, 'coordinator exposes the badge issuer secret key');

// The invite service self-publishes the members definition at startup; the
// People table only lists awards whose `a` address matches a definition.
const membersDefinition = await pollRelay(
	'30009:<issuer>:members definition present (invite service startup)',
	{ kinds: [30009], authors: [relayView.badge_issuer_pubkey], '#d': ['members'] },
	(events) => events.find((event) => tagValue(event, 'd') === 'members'),
	60000
);
const membershipLabel = tagValue(membersDefinition, 'name') || 'Member';

for (const member of [member1, member2]) {
	const award = signEvent(
		{ kind: 8, tags: [['a', relayView.required_badge], ['p', member.pub]] },
		secrets.badge_issuer_secret_key
	);
	await pool.publish([RELAY], award);
	await pollRelay(
		'issuer-signed membership award on the relay',
		{ kinds: [8], authors: [relayView.badge_issuer_pubkey], '#p': [member.pub] },
		(events) => events.some((event) => event.id === award.id)
	);
	if (member === member2) membershipAwardId2 = award.id;
}
// The badge-gate learns memberships from its own live subscription to the
// relay; give it a moment before the members start writing their kind-0s.
await sleep(3000);
console.log('ok - both users hold issuer-signed membership awards (gate will accept writes)');

// The dashboard resolves member profiles from the community relay only, so the
// members publish their NAMED kind-0s there themselves (member writes pass the
// badge-gate now). Retry generously: the rebuilt gate answers writes with
// "restricted: membership cache warming, retry shortly" until its bootstrap
// subscription has seen EOSE on BOTH its filters (kind-8 awards AND kind-5
// deletions), which can take tens of seconds on a loaded machine.
for (const [member, profile] of [
	[member1, profile1],
	[member2, profile2]
]) {
	let stored = false;
	for (let attempt = 0; attempt < 15 && !stored; attempt++) {
		const kind0 = signEvent({ kind: 0, tags: [], content: JSON.stringify(profile) }, member.priv);
		const verdict = await publishVerdict(kind0).catch((error) => ({
			accepted: false,
			message: String(error)
		}));
		if (!verdict.accepted) {
			console.log(`   (kind-0 for ${member.pub.slice(0, 8)} rejected: ${verdict.message}; retrying)`);
			await sleep(4000);
			continue;
		}
		stored = await pollRelay(
			`named kind-0 for ${profile.name} on the community relay`,
			{ kinds: [0], authors: [member.pub] },
			(events) => events.some((event) => event.content.includes(profile.name))
		).then(() => true);
	}
	assert(stored, `member ${profile.name} published a named kind-0 to the community relay`);
}

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

async function main() {
	const adminCtx = await browser.newContext({
		viewport: { width: 1600, height: 1000 },
		ignoreHTTPSErrors: true,
		// The modal's Copy-address button uses navigator.clipboard; headless
		// Chromium denies it by default.
		permissions: ['clipboard-read', 'clipboard-write']
	});
	await adminCtx.addInitScript(seedSession, browserAccount(keys.admin));
	await adminCtx.addInitScript(plantServiceBaseUrl, community);
	await adminCtx.addInitScript(plantSelectedRelay, RELAY);
	const page = await adminCtx.newPage();
	activePage = page;
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));

	// ── 1. People table renders both members BY NAME ─────────────────────────
	await gotoAdminSegment(page, 'members', 'h1:has-text("People")');
	await dismissNotice(page);

	// Both rows render once the awards feed and the membership definition have
	// arrived (both noCache live feeds). Reload once as a last resort on a
	// loaded machine — a reload restarts the subscriptions against live data.
	const row1 = page.getByRole('button', { name: `View Member ${prefix1}'s profile` });
	const row2 = page.getByRole('button', { name: `View Member ${prefix2}'s profile` });
	let rowsVisible = await row1
		.waitFor({ timeout: 120000 })
		.then(() => row2.waitFor({ timeout: 120000 }))
		.then(() => true)
		.catch(() => false);
	if (!rowsVisible) {
		console.log('   (member rows not listed yet, reloading the members page once)');
		await gotoRetry(page, `${BASE}${adminRelayPath}/members`, 'h1:has-text("People")', 30000);
		await dismissNotice(page);
		rowsVisible = await row1
			.waitFor({ timeout: 120000 })
			.then(() => row2.waitFor({ timeout: 120000 }))
			.then(() => true)
			.catch(() => false);
	}
	if (!rowsVisible) {
		console.log('---- main text at members failure ----');
		console.log(await page.locator('main').innerText().catch(() => '(none)'));
	}
	assert(rowsVisible, 'both seeded members listed in the People table');

	// The row's <User> label resolves the kind-0 from the community relay; the
	// fallback would be a hex slice, never the seeded name.
	await row1.locator(`text=${profile1.name}`).waitFor({ timeout: 30000 });
	assert(true, 'member 1 row renders the kind-0 NAME (not a hex/npub fallback)');
	await row2.locator(`text=${profile2.name}`).waitFor({ timeout: 30000 });
	assert(true, 'member 2 row renders the kind-0 NAME (not a hex/npub fallback)');

	// ── 2. Row click opens the MemberProfileModal ────────────────────────────
	await row1.click();
	const dialog = page.getByRole('dialog', { name: profile1.name });
	await dialog.waitFor({ timeout: 30000 });
	assert(true, 'row click opens the MemberProfileModal');

	// displayName comes from the community-relay kind-0; the fallback would be
	// `${pubkey.slice(0,12)}…`. The dialog's accessible name IS the h2 title.
	await dialog.locator(`img[alt="${profile1.name}"]`).waitFor({ timeout: 15000 });
	const avatarSrc = await dialog.locator(`img[alt="${profile1.name}"]`).getAttribute('src');
	assert(
		avatarSrc === profile1.picture,
		'modal renders the kind-0 picture (seeded URL, not /miss-profile.png)'
	);
	await dialog.locator(`text=${profile1.about}`).waitFor({ timeout: 15000 });
	assert(true, 'modal renders the kind-0 about/bio');
	await dialog.locator(`text=${profile1.nip05}`).waitFor({ timeout: 15000 });
	assert(true, 'modal renders the kind-0 nip05');
	assert(
		(await dialog.locator(`text=${member1.pub.slice(0, 12)}…`).count()) === 0,
		'modal does NOT fall back to the pubkey-slice display name'
	);
	// Community roles card: the seeded membership award shows as the def's name.
	await dialog.locator('text=Community roles').waitFor();
	assert(
		(await dialog.locator(`span:has-text("${membershipLabel}")`).count()) >= 1,
		`modal lists the "${membershipLabel}" membership badge under Community roles`
	);
	await dialog.locator('text=Membership expiry').waitFor();
	assert(
		(await dialog.locator('text=No expiration').count()) >= 1,
		'modal shows "No expiration" for the seeded (indefinite) membership'
	);
	assert(
		(await dialog.locator('text=Active').count()) >= 1,
		'modal shows the Active membership status'
	);
	// Account address: exact npub.
	await dialog.locator(`text=${npub1}`).waitFor({ timeout: 15000 });
	assert(true, 'modal shows the full npub account address');

	// Negative: the modal is read-only — no admin actions inside it.
	assert(
		(await dialog.getByRole('button', { name: /ban|assign|remove|message/i }).count()) === 0,
		'modal exposes no ban/assign/remove/message actions (read-only by design)'
	);

	// ── 3. Copy address ──────────────────────────────────────────────────────
	await dialog.getByRole('button', { name: 'Copy address' }).click();
	await dialog.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 10000 });
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	assert(clipboard === npub1, 'Copy address puts the member npub on the clipboard');

	// ── 4a. Close path 1: Escape ─────────────────────────────────────────────
	await page.keyboard.press('Escape');
	await dialog.waitFor({ state: 'detached', timeout: 10000 });
	assert(true, 'Escape closes the modal');

	// ── 4b. Close path 2: the X button (reopen via menu -> View member) ──────
	await page.getByLabel(`More actions for Member ${prefix1}`).click();
	await page.getByRole('menuitem', { name: 'View member' }).click();
	const dialog2 = page.getByRole('dialog', { name: profile1.name });
	await dialog2.waitFor({ timeout: 30000 });
	assert(true, 'action menu "View member" opens the modal');
	await dialog2.getByRole('button', { name: 'Close profile' }).click();
	await dialog2.waitFor({ state: 'detached', timeout: 10000 });
	assert(true, 'the X button closes the modal');

	// ── 4c. Close path 3: backdrop click ─────────────────────────────────────
	await row1.click();
	const dialog3 = page.getByRole('dialog', { name: profile1.name });
	await dialog3.waitFor({ timeout: 30000 });
	// The backdrop is the first "Close profile" button in DOM order (behind the
	// dialog); a corner position misses the centered dialog panel.
	await page
		.getByRole('button', { name: 'Close profile' })
		.first()
		.click({ position: { x: 6, y: 6 } });
	await dialog3.waitFor({ state: 'detached', timeout: 10000 });
	assert(true, 'backdrop click closes the modal');

	// ── 5. Ban member (kind-5 membership-badge revocation via the row menu) ────
	await page.getByLabel(`More actions for Member ${prefix2}`).click();
	await page.getByRole('menuitem', { name: 'Ban member' }).click();
	const banDialog = page.getByRole('dialog', { name: 'Ban member?' });
	await banDialog.waitFor({ timeout: 15000 });
	await banDialog.locator('text=their membership badge').waitFor();
	assert(true, 'ban dialog explains the membership-badge revocation');
	// The confirm dialog renders the member's community-relay profile too.
	await banDialog.locator(`text=${profile2.name}`).waitFor({ timeout: 15000 });
	assert(true, 'ban dialog shows the member by kind-0 name');

	// Cancel path first: closes the dialog without banning.
	await banDialog.getByRole('button', { name: 'Cancel' }).click();
	await banDialog.waitFor({ state: 'detached', timeout: 10000 });
	assert(true, 'Cancel closes the ban dialog without banning');
	assert(
		await pool
			.querySync([RELAY], { kinds: [8], authors: [relayView.badge_issuer_pubkey] })
			.then((events) => events.some((event) => event.id === membershipAwardId2)),
		'cancelled ban leaves the membership award on the relay'
	);

	// Reopen and confirm the ban with a reason.
	await page.getByLabel(`More actions for Member ${prefix2}`).click();
	await page.getByRole('menuitem', { name: 'Ban member' }).click();
	const banDialog2 = page.getByRole('dialog', { name: 'Ban member?' });
	await banDialog2.waitFor({ timeout: 15000 });
	await banDialog2.locator('input[placeholder="Why is this member being banned?"]').fill(banReason);
	await banDialog2.getByRole('button', { name: 'Ban member', exact: true }).click();

	// UI level: success status, dialog closes.
	await page.waitForSelector('text=Member banned: their membership badge was revoked.', {
		timeout: 30000
	});
	assert(true, 'members UI reports "Member banned: their membership badge was revoked."');
	await banDialog2.waitFor({ state: 'detached', timeout: 10000 });
	assert(true, 'ban dialog closes after the confirmed ban');

	// UI level, LIVE: the open People table drops the banned member's row
	// without a reload (the awards subscription includes kind 5;
	// handleRoleDeletion removes admin-deleted award ids from roleAwards).
	await row2.waitFor({ state: 'detached', timeout: 30000 });
	assert(true, 'banned member row disappears from the open People table LIVE (no reload)');
	// The other member and the admin rows are unaffected.
	assert(
		(await row1.count()) === 1,
		'other member row survives the ban on the open People table'
	);

	// Relay level 1 (nak): the admin-signed kind 5 references member2's
	// membership award id, carries ['k','8'], and the UI-supplied reason as
	// content.
	const deletion = await pollNak(
		'admin-signed kind-5 ban on the relay',
		['-k', '5', '-a', keys.admin.pub, '--tag', `e=${membershipAwardId2}`],
		(events) =>
			events.find(
				(event) =>
					event.pubkey === keys.admin.pub &&
					event.tags.some((tag) => tag[0] === 'e' && tag[1] === membershipAwardId2)
			),
		30000
	);
	assert(
		deletion.tags.some((tag) => tag[0] === 'k' && tag[1] === '8'),
		"ban kind-5 carries ['k','8']"
	);
	assert(deletion.content === banReason, 'ban kind-5 content is the UI-supplied reason');

	// Relay level 2 (nak): the issuer-signed kind-8 award's storage fate.
	// DISCREPANCY vs the original spec (verified live with nak, 2026-07-30):
	// the admin-signed kind 5 does NOT purge the issuer-signed award from relay
	// storage — strfry NIP-09 deletion only applies when the kind-5 author
	// equals the deleted event's author, and here admin != badge issuer. The
	// ban is enforced by (a) the gate's membership cache (proven below: the
	// banned key's writes are rejected) and (b) the app's handleRoleDeletion
	// filtering admin-deleted award ids (proven above: the row vanished live).
	// Pin the limitation with wire evidence; if the relay image ever gains
	// cross-author deletion, flip this to assert absence.
	const awardStillServed = await pollNak(
		'banned membership award still served by relay storage',
		['-k', '8', '-a', relayView.badge_issuer_pubkey, '--tag', `p=${member2.pub}`],
		(events) => events.find((event) => event.id === membershipAwardId2),
		30000
	);
	assert(
		awardStillServed,
		'relay still serves the banned award (NIP-09 same-author deletion only — ban enforced by the gate, not relay storage)'
	);

	// Gate level (the critical one): AFTER the ban is confirmed on the relay, a
	// raw-WS write from the banned key must be REJECTED — the gate's membership
	// cache dropped the award. Retry briefly: the gate learns the kind-5 from
	// its own live subscription.
	let bannedVerdict;
	const gateDeadline = Date.now() + 30000;
	while (Date.now() < gateDeadline) {
		const bannedWrite = signEvent({ kind: 1, tags: [], content: `banned write ${run}` }, member2.priv);
		bannedVerdict = await publishVerdict(bannedWrite);
		if (!bannedVerdict.accepted) break;
		console.log('   (gate still accepts the banned key, waiting for the kind-5 to propagate)');
		await sleep(2000);
	}
	assert(
		!bannedVerdict.accepted &&
			/blocked: required badge missing|restricted:/i.test(bannedVerdict.message),
		`gate rejects writes from the banned member ("${bannedVerdict.message}")`
	);

	// ── 6. Negative: the root admin row cannot be banned ─────────────────────
	await page.getByLabel(`More actions for Member ${adminPrefix}`).click();
	const adminBan = page.getByRole('menuitem', { name: 'Ban member' });
	await adminBan.waitFor({ timeout: 15000 });
	assert(await adminBan.isDisabled(), 'Ban member is DISABLED on the root admin row');
	assert(
		(await adminBan.getAttribute('title')) === 'Relay administrators cannot be banned here',
		'disabled admin Ban member explains "Relay administrators cannot be banned here"'
	);
	// Assign role and View member stay available on the admin row.
	assert(
		!(await page.getByRole('menuitem', { name: 'View member' }).isDisabled()),
		'View member stays enabled on the admin row'
	);
	await page.keyboard.press('Escape');

	await page.screenshot({ path: '/tmp/members-modal-final.png' });
	console.log('E2E PASS');
	await browser.close();
	pool.destroy([RELAY]);
	process.exit(0);
}

main().catch(async (error) => {
	console.error(String(error?.stack || error).slice(0, 2000));
	if (activePage) {
		await activePage
			.screenshot({ path: '/tmp/members-modal-failure.png', fullPage: true })
			.catch(() => {});
		console.error('failure screenshot at /tmp/members-modal-failure.png');
	}
	await browser.close().catch(() => {});
	pool.destroy([RELAY]);
	process.exit(1);
});
