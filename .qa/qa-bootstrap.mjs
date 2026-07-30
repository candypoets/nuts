// Bootstrap a fresh QA community, then hand it to downstream .qa workflow scripts
// via the shared state file (QA_STATE, default /tmp/qa-community.json).
//
//   node .qa/qa-bootstrap.mjs         # drives the real /create UI (battle-tests create)
//   node .qa/qa-bootstrap.mjs --api   # provisions via the coordinator API (fast, skips UI)
//   node .qa/qa-bootstrap.mjs --type sports   # pick another archetype (default: hospitality)
//
// Requires the local coordinator in DEV_DIRECT_PORTS mode (see .qa/README.md).
// Tear down afterwards with: node .qa/qa-teardown.mjs
import {
	assert,
	browserAccount,
	createRelayViaApi,
	ensureDevServer,
	launchBrowser,
	listRelays,
	loadKeys,
	makePool,
	requireCoordinator,
	seedSession,
	signEvent,
	sleep,
	waitRelayRunning,
	writeCommunity
} from './qa-lib.mjs';

const apiMode = process.argv.includes('--api');
const keys = loadKeys();
const run = Date.now().toString(36);

// --type <archetype>: which community archetype to create. Tile labels mirror
// COMMUNITY_ARCHETYPES in src/lib/communityTypes.ts (the /create page renders a
// button per archetype with its `label` text).
const ARCHETYPE_TILES = {
	sports: { label: 'Sports club & gym', namePrefix: 'QA Gym' },
	hospitality: { label: 'Restaurant, café & bar', namePrefix: 'QA Cafe' },
	club: { label: "Members' club & nightlife", namePrefix: 'QA Club' },
	village: { label: 'Village & neighborhood', namePrefix: 'QA Village' },
	professional: { label: 'Startup & professional network', namePrefix: 'QA Network' },
	other: { label: 'Other community', namePrefix: 'QA Community' }
};
const typeArg = (() => {
	const index = process.argv.indexOf('--type');
	if (index !== -1) return process.argv[index + 1];
	const inline = process.argv.find((arg) => arg.startsWith('--type='));
	return inline?.split('=')[1];
})();
const communityType = typeArg || 'hospitality';
const archetype = ARCHETYPE_TILES[communityType];
if (!archetype) {
	throw new Error(
		`unknown --type "${communityType}" (expected one of: ${Object.keys(ARCHETYPE_TILES).join(', ')})`
	);
}
const communityName = `${archetype.namePrefix} ${run}`;
// Hospitality keeps its historical qa-cafe-* domain prefix; teardown --sweep
// matches qa-* either way.
const domainLabel = communityType === 'hospitality' ? `qa-cafe-${run}` : `qa-${communityType}-${run}`;

await requireCoordinator();

if (apiMode) {
	const created = await createRelayViaApi(
		{
			name: communityName,
			description: 'QA bootstrap community - safe to delete.',
			domain_label: domainLabel,
			admin_pubkeys: [keys.admin.pub],
			badge_d: 'members'
		},
		keys
	);
	const relay = await waitRelayRunning(created.id, keys);
	assert(relay.relay_url.startsWith('ws'), `relay running at ${relay.relay_url}`);

	// --api skips the /create UI's publishCreatorProfile step, so plant the admin
	// kind-0 ourselves: the dashboard header and People table resolve names from
	// this relay only. The gate accepts any event signed by an admin pubkey.
	// A freshly provisioned relay's write gate can stay down well past the
	// coordinator's "running" mark under load, so retry with a FRESH pool per
	// attempt (a stuck ws connection otherwise poisons every retry) for 90s.
	const profile = signEvent(
		{
			kind: 0,
			tags: [],
			content: JSON.stringify({ name: 'QA Admin', about: 'QA bootstrap admin profile' })
		},
		keys.admin.priv
	);
	let stored;
	const deadline = Date.now() + 90000;
	while (Date.now() < deadline && !stored) {
		const pool = makePool();
		await Promise.allSettled(pool.publish([relay.relay_url], profile));
		stored = await Promise.race([
			pool.get([relay.relay_url], { kinds: [0], authors: [keys.admin.pub] }),
			sleep(5000).then(() => undefined)
		]);
		pool.close([relay.relay_url]);
	}
	assert(stored, 'admin kind-0 round-trips on the new relay');
	console.log('ok - admin kind-0 published to the new relay');

	// The UI /create flow also publishes the kind-30078 community profile that
	// carries the archetype (orders page kitchen columns, store presets, etc.
	// depend on it). --api must plant it too; the relay is proven writable by
	// the kind-0 loop above, so a short retry is enough.
	const communityProfile = signEvent(
		{
			kind: 30078,
			tags: [
				['d', 'nuts-community-profile'],
				['type', communityType],
				['description', 'QA bootstrap community - safe to delete.']
			],
			content: ''
		},
		keys.admin.priv
	);
	let storedProfile;
	const profileDeadline = Date.now() + 20000;
	while (Date.now() < profileDeadline && !storedProfile) {
		const pool = makePool();
		await Promise.allSettled(pool.publish([relay.relay_url], communityProfile));
		storedProfile = await Promise.race([
			pool.get([relay.relay_url], { kinds: [30078], authors: [keys.admin.pub], limit: 1 }),
			sleep(3000).then(() => undefined)
		]);
		pool.close([relay.relay_url]);
	}
	assert(
		storedProfile,
		`community profile (kind 30078, ${communityType}) round-trips on the new relay`
	);
	console.log(`ok - community profile (${communityType}) published to the new relay`);

	writeCommunity({
		id: created.id,
		relay_url: relay.relay_url,
		base_url: relay.base_url,
		domain: relay.domain,
		name: communityName,
		admin_pubkey: keys.admin.pub,
		type: communityType,
		via: 'api',
		run
	});
	console.log('BOOTSTRAP PASS (api)');
	process.exit(0);
}

// --- UI mode: the create-path battle test -------------------------------------

const base = await ensureDevServer();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(seedSession, browserAccount(keys.admin));
const page = await context.newPage();
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)));

try {
	await page.goto(`${base}/create`, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.waitForSelector(`button:has-text("${archetype.label}")`, { timeout: 30000 });
	await page.locator('button', { hasText: archetype.label }).first().click();
	await page.fill('input[autocomplete="organization"]', communityName);
	await page.fill('textarea', 'QA bootstrap community - safe to delete.');

	// Without an existing kind-0 the create form asks for a name and builds the
	// profile during creation (new-signup path). If the account already has a
	// profile this input never appears and the profile is replicated instead.
	// The kind-0 lookup runs against public index relays and can be slow, so
	// don't snapshot-check the input once: wait until the form is actually
	// submittable (canCreate), filling the name input whenever it appears.
	const nameInput = page.locator('input[autocomplete="name"]');
	const createButton = page.getByRole('button', { name: /^Create community/ });
	let nameFilled = false;
	const enabledDeadline = Date.now() + 90000;
	for (;;) {
		if (!nameFilled && (await nameInput.isVisible().catch(() => false))) {
			await nameInput.fill('QA Admin');
			nameFilled = true;
			console.log('ok - no existing kind-0, filled creator name (profile will be created)');
		}
		if (await createButton.isEnabled().catch(() => false)) break;
		if (Date.now() > enabledDeadline) {
			throw new Error('create form never became submittable (canCreate stayed false for 90s)');
		}
		await page.waitForTimeout(500);
	}
	if (!nameFilled) console.log('ok - existing kind-0 found, creator name not required');

	await createButton.click();
	// Relay provisioning + the publish chain (relay list, relay sets, profiles)
	// can take a while.
	await page.waitForURL('**/admin**', { timeout: 180000 });
	console.log('ok - community created via /create UI, landed on admin');
} catch (error) {
	await page.screenshot({ path: '/tmp/qa-bootstrap-failure.png' }).catch(() => {});
	console.error('bootstrap UI failed, screenshot at /tmp/qa-bootstrap-failure.png');
	throw error;
}

// Resolve the coordinator record for the relay the app just landed on.
const appRelayUrl = await page.evaluate(() => {
	try {
		return JSON.parse(localStorage.getItem('admin/selectedRelayUrl') || '""');
	} catch {
		return '';
	}
});
assert(appRelayUrl.startsWith('ws'), `app selected a relay (${appRelayUrl})`);

let record;
const deadline = Date.now() + 60000;
while (Date.now() < deadline && !record) {
	const relays = await listRelays(keys);
	record =
		relays.find((relay) => relay.relay_url === appRelayUrl) ||
		relays.find((relay) => relay.domain === `${domainLabel}.test.local`) ||
		relays.sort((a, b) => b.created_at - a.created_at)[0];
	if (!record) await sleep(2000);
}
assert(record, `coordinator knows the relay (${record?.relay_url})`);
assert(record.status === 'running', `relay status running (got ${record.status})`);

writeCommunity({
	id: record.id,
	relay_url: record.relay_url,
	base_url: record.base_url,
	domain: record.domain,
	name: communityName,
	admin_pubkey: keys.admin.pub,
	type: communityType,
	via: 'ui',
	run
});

await page.screenshot({ path: '/tmp/qa-bootstrap.png' });
await browser.close();
console.log('BOOTSTRAP PASS (ui)');
process.exit(0);
