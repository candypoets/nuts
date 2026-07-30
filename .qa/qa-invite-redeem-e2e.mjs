// E2E: admin invite creation + invited-user redemption.
//
//   1. Reads the provisioned community from the QA state file (qa-bootstrap.mjs)
//   2. Injects the admin session + the relay -> invite-service base URL mapping
//      (plantServiceBaseUrl is REQUIRED: invite creation POSTs to the invite
//      service at base_url, which --api bootstrap never plants)
//   3. Admin opens /admin/<relay>/invites, creates an invite, copies the claim
//      URL from the QR card (clipboard), and the URL is asserted to target the
//      invite service (http base_url port, not the ws strfry port)
//   4. A second browser context (keys.users[0]) opens the claim URL exactly as
//      the app produced it and redeems it via the real /redeem flow (the
//      redeem page resolves the community ws relay from the invite service's
//      /community/info relay_url)
//   5. Relay-level proof: a kind 8 award for the invited user now exists on the
//      relay, signed by the community's badge_issuer_pubkey (the redemption
//      service key, NOT the admin), and the 30009:<issuer>:members definition
//      the award references was published by the invite service itself
//   6. Kind-0 invariant: the redeemer's kind-0 profile IS on the community
//      relay (the dashboard only ever talks to that relay), and the People
//      page renders the member by their profile NAME, not an npub prefix
//
// Run: QA_STATE=/tmp/qa-community-invite.json QA_DEV_PORT=5192 node .qa/qa-invite-redeem-e2e.mjs
import {
	assert,
	browserAccount,
	ensureDevServer,
	getRelay,
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
if (!community?.relay_url) {
	console.error(`no QA community state at ${process.env.QA_STATE || '/tmp/qa-community.json'}`);
	console.error('run qa-bootstrap.mjs first');
	process.exit(1);
}
const keys = loadKeys();
const user1 = keys.users?.[0];
if (!user1?.pub) throw new Error('keys file has no users[] (need keys.users[0] as the invited user)');
const RELAY = community.relay_url;
const SERVICE_BASE = community.base_url.replace(/\/+$/, '');
const pool = makePool();

// Mirrors src/lib/env.ts VITE_INDEXER_RELAYS (.env) — exactly the relays the
// redeem flow's kind-0 lookup (INVITE_INDEX_RELAYS) queries before replicating
// the redeemer's profile to the community relay.
const INDEXER_RELAYS = (
	process.env.VITE_INDEXER_RELAYS ||
	'wss://user.kindpag.es,wss://profiles.nostr1.com,wss://directory.yabu.me,wss://relay.nos.social,wss://purplepag.es,wss://relay.vertexlab.io,wss://relay.primal.net,wss://relay.nuts.cash'
).split(',');
const PROFILE_RELAYS = INDEXER_RELAYS;

const run = Date.now().toString(36);
// Unique per run: the People-page name assertion must not match a stale profile.
const inviteeName = `QA Invitee ${run}`;

console.log('target relay:', RELAY, `(provisioned: ${community.name})`);
console.log('invite service:', SERVICE_BASE);

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

let activePage; // for the failure screenshot

// Pre-select OUR relay before the app's own init runs. The admin key is shared
// with parallel QA runs; their kind-30002 relay sets (replaceable events) feed
// the admin dashboard's adminRelays[0] auto-select (src/routes/admin/+page.svelte),
// which would otherwise flip the selection to a FOREIGN community mid-session.
function plantSelectedRelay(relayUrl) {
	try {
		const normalized = relayUrl.replace(/\/+$/, '').toLowerCase() + '/';
		localStorage.setItem('admin/selectedRelayUrl', JSON.stringify(normalized));
	} catch {
		// best effort
	}
}

async function main() {
	// 0a. The invite service must advertise an EXTERNALLY reachable relay_url
	// (the DEV_DIRECT_PORTS bug was advertising the container-internal
	// ws://127.0.0.1:7777, which stranded profile replication in the browser).
	const communityInfo = await fetch(`${SERVICE_BASE}/community/info`).then((response) => {
		if (!response.ok) throw new Error(`/community/info -> ${response.status}`);
		return response.json();
	});
	assert(communityInfo.relay_url, '/community/info advertises relay_url');
	assert(
		communityInfo.relay_url !== 'ws://127.0.0.1:7777',
		'advertised relay_url is not the container-internal ws://127.0.0.1:7777'
	);
	const advertised = new URL(communityInfo.relay_url.replace(/^ws/, 'http'));
	const expected = new URL(RELAY.replace(/^ws/, 'http'));
	assert(
		advertised.host === expected.host,
		`advertised relay_url is the externally reachable relay (${communityInfo.relay_url} == ${RELAY})`
	);

	// 0b. Kind-0 invariant test setup: give the invited user a named profile on
	// the public index relays (the user key has no kind-0 anywhere yet). This
	// simulates a real existing account: the redeem flow's fetchExistingEvent
	// queries exactly these relays (INVITE_INDEX_RELAYS), waits for every
	// filter×relay to answer (5s backstop), and replicates the NAMED profile to
	// the community relay; the dashboard resolves the member's name from there.
	const publishInviteeProfile = () =>
		Promise.allSettled(
			pool.publish(
				PROFILE_RELAYS,
				signEvent(
					{
						kind: 0,
						tags: [],
						content: JSON.stringify({ name: inviteeName, display_name: inviteeName })
					},
					user1.priv
				)
			)
		);
	await publishInviteeProfile();
	let profileRelayCount = 0;
	const indexerDeadline = Date.now() + 60000;
	while (Date.now() < indexerDeadline && profileRelayCount < 2) {
		const counts = await Promise.all(
			PROFILE_RELAYS.map(async (relay) => {
				const events = await pool
					.querySync([relay], { kinds: [0], authors: [user1.pub], limit: 5 })
					.catch(() => []);
				return events.some((event) => event.content.includes(inviteeName)) ? 1 : 0;
			})
		);
		profileRelayCount = counts.reduce((sum, count) => sum + count, 0);
		if (profileRelayCount < 2) {
			await publishInviteeProfile();
			await sleep(2000);
		}
	}
	assert(
		profileRelayCount >= 2,
		`invited user's kind-0 (${inviteeName}) visible on ${profileRelayCount} index relays`
	);

	const BASE = await ensureDevServer();
	const browser = await launchBrowser();

	// ── Admin context ────────────────────────────────────────────────────────
	const adminCtx = await browser.newContext({
		viewport: { width: 1600, height: 1000 },
		ignoreHTTPSErrors: true
	});
	await adminCtx.grantPermissions(['clipboard-read', 'clipboard-write']);
	await adminCtx.addInitScript(seedSession, browserAccount(keys.admin));
	await adminCtx.addInitScript(plantServiceBaseUrl, community);
	await adminCtx.addInitScript(plantSelectedRelay, RELAY);
	const page = await adminCtx.newPage();
	activePage = page;
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));

	// 1-3. Create the invite and read the claim URL from the QR card
	const adminRelayPath = `/admin/${encodeURIComponent(RELAY)}`;

	// Selection guard: verify the admin session is still pointed at OUR relay.
	// If the layout bounced to /admin (slow access fetch under load -> missing
	// 'invites' permission), the dashboard auto-selects adminRelays[0], which can
	// be a parallel run's community. Detect via localStorage and re-navigate
	// through the encoded-relay URL, which re-selects ours.
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

	await gotoAdminSegment('invites', 'h1:has-text("Create invite")');
	assert(true, 'invites screen renders for the provisioned community');
	await dismissNotice(page);

	let inviteReady = false;
	for (let attempt = 0; attempt < 3 && !inviteReady; attempt++) {
		if (!(await selectedRelayMatches())) {
			console.log('   (selection flipped before invite creation, re-selecting ours)');
			await gotoAdminSegment('invites', 'h1:has-text("Create invite")');
			await dismissNotice(page);
		}
		await page.getByRole('button', { name: /^Create invite$/ }).click();
		try {
			await page.waitForSelector('text=Invite ready', { timeout: 30000 });
			inviteReady = true;
		} catch (error) {
			if (attempt === 2) throw error;
			console.log('   (invite creation did not render the QR card, retrying)');
		}
	}
	assert(true, 'invite created (QR card rendered)');

	await page.getByRole('button', { name: /Copy invite link/ }).click();
	await page.waitForTimeout(500);
	const claimUrl = await page.evaluate(() => navigator.clipboard.readText());
	console.log('   claim URL:', claimUrl.slice(0, 110) + (claimUrl.length > 110 ? '…' : ''));
	assert(claimUrl.includes('/redeem') && claimUrl.includes('token='), 'claim URL has /redeem + token');

	const parsed = new URL(claimUrl);
	const relayParam = (parsed.searchParams.get('relay') || '').replace(/\/+$/, '');
	assert(relayParam.startsWith('http://'), 'claim URL relay= is the http invite service, not ws');
	assert(
		relayParam === SERVICE_BASE,
		`claim URL relay= points at the invite service port (${relayParam} == ${SERVICE_BASE})`
	);
	assert(
		new URL(relayParam).port !== new URL(RELAY.replace('ws://', 'http://')).port,
		'claim URL port differs from the strfry ws port'
	);

	// 4. Invited user redeems the invite in a second context, using the claim
	// URL exactly as the app produced it (relay= points at the invite service;
	// the redeem page resolves the community ws relay via /community/info).
	const userCtx = await browser.newContext({
		viewport: { width: 1600, height: 1000 },
		ignoreHTTPSErrors: true
	});
	await userCtx.addInitScript(seedSession, browserAccount(user1));
	const userPage = await userCtx.newPage();
	activePage = userPage;
	userPage.on('pageerror', (err) => console.log('[pageerror:user]', String(err).slice(0, 300)));
	userPage.on('console', (msg) => {
		const text = msg.text();
		if (text.includes('[redeem-')) console.log('[console:user]', text.slice(0, 300));
		else if (/\[main\]|\[app\]|connect|ERROR/i.test(text)) console.log('[console:user]', text.slice(0, 200));
	});

	// Diagnostics only: observe the app's relay traffic (nipworker runs its
	// connections in a Web Worker; Playwright still surfaces those sockets).
	userPage.on('websocket', (ws) => {
		console.log('[ws:user] open', ws.url());
		ws.on('socketerror', (error) => console.log('[ws:user] error', ws.url(), String(error)));
		ws.on('close', () => console.log('[ws:user] close', ws.url()));
	});

	// Cold open, exactly like a real invited user: straight to the claim URL.
	// The named kind-0 is already on the index relays (step 0b); the redeem
	// flow's fetchExistingEvent must find it there on its own.
	await gotoRetry(userPage, claimUrl, 'text=Claiming as', 30000);
	assert(true, 'redeem screen renders for the invited user');
	await userPage.getByRole('button', { name: /Accept invite & continue/ }).click();
	await userPage.waitForSelector('text=Invite redeemed', { timeout: 45000 });
	assert(true, 'invite redeemed via app');

	// 6a. Kind-0 invariant: joining the community must publish the redeemer's
	// kind-0 to the community relay (the dashboard only ever reads that relay).
	let communityProfile;
	const profileDeadline = Date.now() + 30000;
	while (Date.now() < profileDeadline && !communityProfile) {
		const events = await pool.querySync([RELAY], {
			kinds: [0],
			authors: [user1.pub],
			limit: 5
		});
		communityProfile = events
			.sort((a, b) => b.created_at - a.created_at)
			.find((event) => event.content.includes(inviteeName));
		if (!communityProfile) await sleep(1500);
	}
	assert(
		communityProfile,
		`redeemer's kind-0 (${inviteeName}) replicated to the community relay`
	);

	// 5. Relay-level proof: kind 8 award signed by the badge issuer service key
	const relayView = await getRelay(community.id, keys);
	assert(relayView.badge_issuer_pubkey, 'coordinator RelayView exposes badge_issuer_pubkey');
	const issuer = relayView.badge_issuer_pubkey;
	assert(issuer !== keys.admin.pub, 'badge issuer is the service key, not the admin');

	let award;
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline && !award) {
		const events = await pool.querySync([RELAY], {
			kinds: [8],
			authors: [issuer],
			'#p': [user1.pub]
		});
		award = events.find((event) =>
			event.tags.some((tag) => tag[0] === 'p' && tag[1] === user1.pub)
		);
		if (!award) await sleep(1500);
	}
	assert(award, 'kind 8 award for the invited user exists on the relay');
	assert(award.pubkey === issuer, 'award authored by the community badge_issuer_pubkey');
	assert(
		award.tags.some((tag) => tag[0] === 'a' && tag[1] === relayView.required_badge),
		`award references the required badge (${relayView.required_badge})`
	);

	// The invite service publishes the 30009:<issuer>:members definition itself
	// at startup (retried until the relay accepts writes). The members page only
	// lists an award whose `a` address matches a definition on the relay, so
	// this is what makes the redeemed member visible in People — no seeding.
	let definition;
	const defDeadline = Date.now() + 30000;
	while (Date.now() < defDeadline && !definition) {
		const events = await pool.querySync([RELAY], {
			kinds: [30009],
			authors: [issuer],
			'#d': ['members']
		});
		definition = events.find((event) =>
			event.tags.some((tag) => tag[0] === 'd' && tag[1] === 'members')
		);
		if (!definition) await sleep(1500);
	}
	assert(definition, '30009:<issuer>:members definition published by the invite service');
	assert(definition.pubkey === issuer, 'membership definition authored by the badge issuer');
	assert(
		definition.tags.some((tag) => tag[0] === 'type' && tag[1] === 'membership') &&
			definition.tags.some((tag) => tag[0] === 't' && tag[1] === 'membership'),
		'membership definition classified type=membership + t=membership'
	);

	// 6b. Back in the admin context: the new member shows up in People, rendered
	// by their kind-0 profile NAME resolved from the community relay — not a
	// bare npub/pubkey prefix.
	activePage = page;
	await gotoAdminSegment('members', 'h1:has-text("People")');
	assert(true, 'members screen renders');
	await page.waitForTimeout(5000); // let the member subscriptions settle

	let memberVisible = false;
	const memberDeadline = Date.now() + 45000;
	while (Date.now() < memberDeadline && !memberVisible) {
		memberVisible = (await page.locator(`text=${inviteeName}`).count()) > 0;
		if (!memberVisible) await page.waitForTimeout(1500);
	}
	if (!memberVisible) {
		console.log('---- main text at members failure ----');
		console.log(
			await page
				.locator('main')
				.innerText()
				.catch(() => '(none)')
		);
	}
	assert(memberVisible, `redeemed member listed in People by profile name (${inviteeName})`);
	assert(
		(await page.locator('text=2 community members').count()) > 0,
		'member count reflects admin + invited user'
	);

	await page.screenshot({ path: '/tmp/invite-redeem-final.png' });
	await browser.close();
	pool.destroy([RELAY, ...PROFILE_RELAYS]);
	console.log('E2E PASS');
	process.exit(0);
}

main().catch(async (error) => {
	console.error('E2E FAIL:', error.message);
	if (activePage) {
		await activePage.screenshot({ path: '/tmp/invite-redeem-failure.png', fullPage: true }).catch(() => {});
		console.error('failure screenshot at /tmp/invite-redeem-failure.png');
	}
	process.exit(1);
});
