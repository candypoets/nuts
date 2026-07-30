// Shared helpers for the .qa harness: keys, NIP-98, coordinator API, community
// state file, dev server, Playwright launch, relay signing.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import WebSocket from 'ws';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

useWebSocketImplementation(WebSocket);

export const COORDINATOR_URL = (process.env.COORDINATOR_URL || 'http://127.0.0.1:7798').replace(
	/\/$/,
	''
);
export const QA_STATE_PATH = process.env.QA_STATE || '/tmp/qa-community.json';
// The coordinator only provisions for pubkeys in its COORDINATOR_ADMIN_PUBKEYS;
// the strfry-badge-node test env admin is whitelisted by convention.
export const DEFAULT_KEYS_JSON = '/root/code/strfry-badge-node/test/env/keys.json';
export const DEV_SERVER_PORT = Number(process.env.QA_DEV_PORT || 5191);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function assert(condition, label) {
	if (!condition) throw new Error('ASSERT FAILED: ' + label);
	console.log('ok -', label);
}

// --- Keys -----------------------------------------------------------------

function normalizeKey(value) {
	return {
		priv: value.priv || value.sec_hex,
		pub: value.pub || value.pub_hex,
		nsec: value.nsec,
		npub: value.npub
	};
}

// Accepts both key file shapes in play: /tmp/qa-keys.json (priv/pub) and
// strfry-badge-node test/env/keys.json (sec_hex/pub_hex, users[] array).
export function loadKeys(path = process.env.KEYS_JSON || DEFAULT_KEYS_JSON) {
	const raw = JSON.parse(readFileSync(path, 'utf8'));
	const out = { _path: path };
	for (const [name, value] of Object.entries(raw)) {
		if (value && typeof value === 'object' && !Array.isArray(value) && (value.priv || value.sec_hex)) {
			out[name] = normalizeKey(value);
		}
	}
	if (Array.isArray(raw.users)) out.users = raw.users.map(normalizeKey);
	return out;
}

export function randomKey() {
	const priv = bytesToHex(generateSecretKey());
	return { priv, pub: getPublicKey(hexToBytes(priv)) };
}

// Field names expected inside the browser by the seedSession init script.
export function browserAccount(key) {
	return { pub: key.pub, npub: key.npub, nsec: key.nsec, sec: key.priv };
}

// Runs in the page: plants a logged-in privkey session before any app code runs.
export function seedSession(account) {
	localStorage.setItem(
		'key',
		JSON.stringify({
			pub: account.pub,
			npub: account.npub,
			nsec: account.nsec,
			priv: account.sec,
			hasSigner: true
		})
	);
	localStorage.setItem(
		'nostr_signer_accounts',
		JSON.stringify({ [account.pub]: { type: 'privkey', payload: account.sec } })
	);
	localStorage.setItem('nostr_active_pubkey', account.pub);
}

// Runs in the page, after seedSession's arg. Plants the relay -> service base URL
// mapping the app remembers at creation time (admin/serviceBaseUrls). Required
// for flows that call the invite service (/invites, /redeem, /community/info):
// in dev the invite service runs on its own port, and --api bootstrap never
// populates this mapping. Pass the community state object as the init-script arg.
export function plantServiceBaseUrl(community) {
	if (!community?.relay_url || !community?.base_url) return;
	const key = 'admin/serviceBaseUrls';
	const normalize = (url) => url.replace(/\/+$/, '') + '/';
	let map = {};
	try {
		map = JSON.parse(localStorage.getItem(key) || '{}');
	} catch {}
	map[normalize(community.relay_url)] = community.base_url.replace(/\/+$/, '');
	localStorage.setItem(key, JSON.stringify(map));
}

// --- Signing ---------------------------------------------------------------

export function signEvent(template, privHex) {
	return finalizeEvent({ created_at: nowSeconds(), content: '', ...template }, hexToBytes(privHex));
}

export function makePool() {
	return new SimplePool();
}

// NIP-98 HTTP auth header (kind 27235). Signed at call time: verifiers apply a
// ~60s staleness window, so never cache these.
export function nip98Header(url, method, body, privHex) {
	const payloadHash = bytesToHex(sha256(new TextEncoder().encode(body || '')));
	const event = signEvent(
		{
			kind: 27235,
			tags: [
				['u', url],
				['method', method],
				['payload', payloadHash]
			]
		},
		privHex
	);
	const encoded = Buffer.from(JSON.stringify(event), 'utf8')
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	return `Nostr ${encoded}`;
}

// --- Coordinator API --------------------------------------------------------

export async function requireCoordinator() {
	try {
		const response = await fetch(COORDINATOR_URL + '/healthz', { signal: AbortSignal.timeout(3000) });
		if (!response.ok) throw new Error('status ' + response.status);
	} catch {
		throw new Error(
			`coordinator not reachable at ${COORDINATOR_URL}.\n` +
				'Start it in dev mode (strfry-badge-node/test/app/README.md):\n' +
				'  cd /root/code/strfry-badge-node && LISTEN_ADDR=127.0.0.1:7798 \\\n' +
				'  DB_PATH=test/app/coordinator-dev.sqlite3 RELAY_IMAGE=strfry-badge-relay-node:local \\\n' +
				'  RELAY_DOMAIN_SUFFIX=test.local NUTS_PAYMENT_SERVICE_PUBKEY=<64-hex> \\\n' +
				`  COORDINATOR_ADMIN_PUBKEYS=$(jq -r .admin.pub_hex test/env/keys.json) \\\n` +
				`  NIP98_BASE_URL=${COORDINATOR_URL} DEV_DIRECT_PORTS=true ./target/debug/strfry-badge-coordinator`
		);
	}
}

async function coordinatorApi(path, method, keys, body) {
	const url = COORDINATOR_URL + path;
	const bodyText = body === undefined ? '' : JSON.stringify(body);
	const response = await fetch(url, {
		method,
		headers: {
			authorization: nip98Header(url, method, bodyText, keys.admin.priv),
			...(body === undefined ? {} : { 'content-type': 'application/json' })
		},
		body: method === 'GET' || method === 'DELETE' ? undefined : bodyText
	});
	if (!response.ok) {
		throw new Error(`coordinator ${method} ${path} -> ${response.status}: ${await response.text()}`);
	}
	if (response.status === 204) return undefined;
	return response.json();
}

export const listRelays = (keys) => coordinatorApi('/relays', 'GET', keys);
export const getRelay = (id, keys) => coordinatorApi(`/relays/${id}`, 'GET', keys);
export const deleteRelay = (id, keys) => coordinatorApi(`/relays/${id}`, 'DELETE', keys);
export const createRelayViaApi = (payload, keys) => coordinatorApi('/relays', 'POST', keys, payload);
export const getRelaySecrets = (id, keys) => coordinatorApi(`/relays/${id}/secrets`, 'GET', keys);

export async function waitRelayRunning(id, keys, timeoutMs = 90000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const relay = await getRelay(id, keys);
		if (relay.status === 'running') return relay;
		if (relay.status !== 'creating') throw new Error(`relay ${id} stuck in status ${relay.status}`);
		await sleep(2000);
	}
	throw new Error(`relay ${id} did not reach running within ${timeoutMs}ms`);
}

// --- Community state file -----------------------------------------------------

export function readCommunity() {
	if (!existsSync(QA_STATE_PATH)) return undefined;
	return JSON.parse(readFileSync(QA_STATE_PATH, 'utf8'));
}

export function writeCommunity(data) {
	writeFileSync(
		QA_STATE_PATH,
		JSON.stringify({ ...data, state_written_at: new Date().toISOString() }, null, 2)
	);
	console.log('ok - wrote community state to', QA_STATE_PATH);
}

export function clearCommunity() {
	rmSync(QA_STATE_PATH, { force: true });
}

// --- Dev server --------------------------------------------------------------

async function reachable(base) {
	try {
		await fetch(base, { signal: AbortSignal.timeout(2000) });
		return true;
	} catch {
		return false;
	}
}

// Returns the app base URL. Reuses BASE_URL (or a server already on the default
// port) when reachable; otherwise spawns `vite dev` bound to the coordinator and
// kills it when this process exits.
export async function ensureDevServer() {
	const base = (process.env.BASE_URL || `http://localhost:${DEV_SERVER_PORT}`).replace(/\/$/, '');
	if (await reachable(base)) {
		console.log('ok - dev server at', base);
		return base;
	}
	if (process.env.BASE_URL) throw new Error(`BASE_URL ${base} is not reachable`);

	console.log(`starting dev server on :${DEV_SERVER_PORT} (VITE_COORDINATOR_URL=${COORDINATOR_URL})…`);
	const repoRoot = new URL('..', import.meta.url).pathname;
	const child = spawn(
		'./node_modules/.bin/vite',
		['dev', '--port', String(DEV_SERVER_PORT), '--strictPort'],
		{
			cwd: repoRoot,
			env: { ...process.env, VITE_COORDINATOR_URL: COORDINATOR_URL },
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	const log = (await import('fs')).createWriteStream('/tmp/qa-devserver.log', { flags: 'a' });
	child.stdout.pipe(log);
	child.stderr.pipe(log);
	child.on('error', (error) => console.error('[devserver]', error.message));
	process.on('exit', () => {
		try {
			child.kill();
		} catch {}
	});

	const deadline = Date.now() + 45000;
	while (Date.now() < deadline) {
		if (await reachable(base)) {
			console.log('ok - dev server up at', base);
			return base;
		}
		await sleep(500);
	}
	throw new Error(`dev server did not come up on :${DEV_SERVER_PORT} (see /tmp/qa-devserver.log)`);
}

// --- Playwright ----------------------------------------------------------------

// Playwright is not a project dependency; it lives in the npx cache. Resolve
// PLAYWRIGHT_PKG if set, else the first npx cache dir that has it.
function resolvePlaywrightPath() {
	if (process.env.PLAYWRIGHT_PKG) return process.env.PLAYWRIGHT_PKG;
	const npxCache = `${process.env.HOME}/.npm/_npx`;
	if (existsSync(npxCache)) {
		for (const entry of readdirSync(npxCache)) {
			const candidate = `${npxCache}/${entry}/node_modules`;
			if (existsSync(`${candidate}/playwright`)) return candidate;
		}
	}
	return 'playwright'; // fall back to normal resolution for a clear error
}

export async function launchBrowser() {
	const require = createRequire(import.meta.url);
	const { chromium } = require(resolvePlaywrightPath() + '/playwright');
	return chromium.launch({
		headless: true,
		args: [
			// nipworker's live-event path relies on sweeper timers inside workers;
			// headless Chromium can throttle those, which stalls live delivery.
			'--disable-background-timer-throttling',
			'--disable-renderer-backgrounding',
			'--disable-backgrounding-occluded-windows',
			'--disable-features=IntensiveWakeUpThrottling'
		]
	});
}
