// E2E: fresh account wallet setup -> lnuts zap -> proof claim -> kind 7375 backup.
//
//   1. Starts an ephemeral Nutshell FakeWallet mint unless QA_MINT_URL is set
//   2. Opens a fresh signed-in browser session and creates a wallet through the UI
//   3. Claims a local lnuts Lightning address using the wallet's P2PK pubkey
//   4. Sends a signed NIP-57 zap request; FakeWallet auto-settles its invoice
//   5. Verifies the kind 9735 receipt on the relay and in the Home wallet feed
//   6. Verifies Home claims the P2PK proofs from lnuts, stores them locally, and
//      publishes a kind 7375 proof backup
//
// Run:
//   QA_STATE=/tmp/qa-community-wallet.json QA_DEV_PORT=5194 \
//     node .qa/qa-bootstrap.mjs --api
//   QA_STATE=/tmp/qa-community-wallet.json QA_DEV_PORT=5194 \
//     node .qa/qa-wallet-e2e.mjs
import { execFileSync } from 'child_process';
import { rmSync } from 'fs';
import { hexToBytes } from '@noble/hashes/utils';
import { nip19, verifyEvent } from 'nostr-tools';

import {
	DEV_SERVER_PORT,
	assert,
	browserAccount,
	ensureDevServer,
	getRelaySecrets,
	launchBrowser,
	loadKeys,
	makePool,
	nip98Header,
	randomKey,
	readCommunity,
	seedSession,
	signEvent,
	sleep
} from './qa-lib.mjs';

const community = readCommunity();
assert(community?.relay_url, 'community state present (run qa-bootstrap.mjs --api first)');

const RELAY = community.relay_url;
const keys = loadKeys();
const run = Date.now().toString(36);
const user = randomKey();
const payer = randomKey();
const zapSigner = randomKey();
const amountSats = Number(process.env.QA_ZAP_AMOUNT || 21);
const alias = `qa_wallet_${run}`.slice(0, 30);
const expectedBase = (process.env.BASE_URL || `http://localhost:${DEV_SERVER_PORT}`).replace(
	/\/$/,
	''
);
const lnutsDb = `/tmp/qa-lnuts-wallet-${process.pid}-${run}.sqlite3`;
const pool = makePool();

process.env.VITE_DEFAULT_RELAYS = RELAY;
process.env.VITE_INDEXER_RELAYS = RELAY;
process.env.LNUTS_BASE_URL = expectedBase;
process.env.LNUTS_DOMAIN = new URL(expectedBase).host;
process.env.LNUTS_DATABASE_PATH = lnutsDb;
process.env.LNUTS_DEFAULT_RELAYS = RELAY;
process.env.LNUTS_ZAP_NSEC = zapSigner.priv;
process.env.LNUTS_DEBUG_UI = 'true';

let mintContainer;
let browser;
let page;

function docker(...args) {
	return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

async function waitFor(label, fn, timeoutMs = 45_000, intervalMs = 500) {
	const deadline = Date.now() + timeoutMs;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const value = await fn();
			if (value) return value;
		} catch (error) {
			lastError = error;
		}
		await sleep(intervalMs);
	}
	throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`);
}

async function provisionTestMint() {
	if (process.env.QA_MINT_URL) {
		const mintUrl = process.env.QA_MINT_URL.replace(/\/$/, '');
		await waitFor('configured QA mint', async () => {
			const response = await fetch(`${mintUrl}/v1/info`, {
				signal: AbortSignal.timeout(2000)
			});
			return response.ok;
		});
		console.log('ok - using configured test mint', mintUrl);
		return mintUrl;
	}

	mintContainer = `nuts-qa-mint-${process.pid}-${run}`.toLowerCase();
	const image = process.env.QA_MINT_IMAGE || 'cashubtc/nutshell:0.18.1';
	docker(
		'run',
		'-d',
		'--rm',
		'--name',
		mintContainer,
		'-p',
		'127.0.0.1::3338',
		'-e',
		'MINT_BACKEND_BOLT11_SAT=FakeWallet',
		'-e',
		'MINT_LISTEN_HOST=0.0.0.0',
		'-e',
		'MINT_LISTEN_PORT=3338',
		'-e',
		`MINT_PRIVATE_KEY=qa-${run}`,
		'-e',
		'MINT_INFO_NAME=Nuts QA Mint',
		image,
		'poetry',
		'run',
		'mint'
	);

	const port = await waitFor('test mint port', async () => {
		const output = docker('port', mintContainer, '3338/tcp');
		return output.match(/:(\d+)$/)?.[1];
	});
	const mintUrl = `http://127.0.0.1:${port}`;
	await waitFor(
		'ephemeral FakeWallet mint',
		async () => {
			const response = await fetch(`${mintUrl}/v1/info`, {
				signal: AbortSignal.timeout(2000)
			});
			return response.ok;
		},
		60_000
	);
	console.log('ok - ephemeral FakeWallet mint ready at', mintUrl);
	return mintUrl;
}

async function pollRelay(filter, label, timeoutMs = 45_000) {
	return waitFor(
		label,
		async () => {
			const events = await pool.querySync([RELAY], filter).catch(() => []);
			return events.sort((a, b) => b.created_at - a.created_at)[0];
		},
		timeoutMs,
		750
	);
}

async function publishProfile() {
	const secrets = await getRelaySecrets(community.id, keys);
	const communityInfo = await fetch(`${community.base_url}/community/info`).then((response) =>
		response.json()
	);
	const authorizeMember = async (pubkey, label) => {
		const membership = signEvent(
			{
				kind: 8,
				tags: [
					['a', communityInfo.required_badge],
					['p', pubkey]
				],
				content: ''
			},
			secrets.badge_issuer_secret_key
		);
		await Promise.allSettled(pool.publish([RELAY], membership));
		await pollRelay(
			{ kinds: [8], authors: [communityInfo.badge_issuer], '#p': [pubkey], limit: 1 },
			label
		);
	};
	await authorizeMember(user.pub, 'fresh user membership on QA relay');
	// The provisioned relay is membership-gated. Authorize the lnuts service
	// signer so its valid NIP-57 receipts can be stored on this test relay.
	await authorizeMember(zapSigner.pub, 'lnuts receipt signer membership on QA relay');

	const profile = signEvent(
		{
			kind: 0,
			tags: [],
			content: JSON.stringify({ name: `QA Wallet ${run}` })
		},
		user.priv
	);
	await Promise.allSettled(pool.publish([RELAY], profile));
	await pollRelay({ kinds: [0], authors: [user.pub], limit: 1 }, 'fresh user profile on QA relay');
}

try {
	const mintUrl = await provisionTestMint();
	await publishProfile();

	const BASE = await ensureDevServer();
	assert(BASE === expectedBase, `wallet QA dev server uses expected origin (${BASE})`);
	const status = await fetch(`${BASE}/api/lnuts/status`).then(async (response) => {
		if (!response.ok) throw new Error(`/api/lnuts/status -> ${response.status}`);
		return response.json();
	});
	assert(status.data?.baseUrl === BASE, 'lnuts public base URL matches the browser origin');

	browser = await launchBrowser();
	const context = await browser.newContext({
		viewport: { width: 1600, height: 1000 },
		ignoreHTTPSErrors: true
	});
	await context.addInitScript(seedSession, browserAccount(user));
	page = await context.newPage();
	page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 500)));
	page.on('console', (message) => {
		const text = message.text();
		if (
			message.type() === 'error' ||
			text.includes('[wallet]') ||
			text.includes('[saveProofs]') ||
			text.includes('[backup]')
		) {
			console.log(`[browser ${message.type()}]`, text.slice(0, 1000));
		}
	});
	const relayHost = new URL(RELAY.replace(/^ws/, 'http')).host;
	page.on('websocket', (socket) => {
		if (!socket.url().includes(relayHost)) return;
		socket.on('framesent', (frame) => {
			const payload = String(frame.payload || '');
			if (payload.includes('"REQ"')) console.log('[wallet ws tx]', payload.slice(0, 1000));
			if (payload.includes('"EVENT"') && payload.includes('"kind":7375')) {
				console.log('[wallet ws tx 7375]', payload.slice(0, 1000));
			}
		});
		socket.on('framereceived', (frame) => {
			const payload = String(frame.payload || '');
			if (payload.includes('"EVENT"') && payload.includes('9735')) {
				console.log('[wallet ws rx 9735]', payload.slice(0, 1000));
			}
		});
	});

	// Fresh signed-in user, with no pre-existing NIP-60 wallet.
	await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
	await page.getByRole('button', { name: 'Set up wallet' }).waitFor({ timeout: 30_000 });
	assert(
		(await page.evaluate(() => JSON.parse(localStorage.getItem('key') || '{}').pub)) === user.pub,
		'fresh user is signed in with a working signer'
	);
	assert(
		(await pool.querySync([RELAY], { kinds: [17375], authors: [user.pub] })).length === 0,
		'fresh user starts without a wallet'
	);

	// Create a new wallet through the real Home -> Wallet Settings UI.
	await page.getByRole('button', { name: 'Set up wallet' }).click();
	await page.locator('#wallet-mnemonic').waitFor({ state: 'visible', timeout: 20_000 });
	const mintSearch = page.getByPlaceholder('Search mints to add...');
	await mintSearch.fill(mintUrl);
	await mintSearch.press('Enter');
	await page.getByText('Your Mints (1)').waitFor({ state: 'visible', timeout: 30_000 });
	const walletNpub = await page.locator('#wallet-npub').inputValue();
	const decodedWalletNpub = nip19.decode(walletNpub);
	assert(decodedWalletNpub.type === 'npub', 'wallet exposes its P2PK public key');
	const walletPubkey = decodedWalletNpub.data;

	await page.getByRole('button', { name: 'Save Wallet', exact: true }).click();
	const walletEvent = await pollRelay(
		{ kinds: [17375], authors: [user.pub], limit: 5 },
		'kind 17375 wallet event'
	);
	assert(verifyEvent(walletEvent), 'kind 17375 wallet event has a valid signature');
	console.log('ok - wallet created with test mint', mintUrl);

	// Claim an lnuts handle, locking incoming proofs to this wallet.
	const claimUrl = `${BASE}/api/claims`;
	const claimRequest = {
		alias,
		mintUrl,
		p2pkPubkey: walletPubkey
	};
	const claimBody = JSON.stringify(claimRequest);
	const claimResponse = await fetch(claimUrl, {
		method: 'POST',
		headers: {
			authorization: nip98Header(claimUrl, 'POST', claimBody, user.priv),
			'content-type': 'application/json'
		},
		body: claimBody
	});
	assert(
		claimResponse.ok,
		`lnuts handle claimed (${claimResponse.status}: ${await claimResponse.text()})`
	);

	const lnurlPayUrl = `${BASE}/.well-known/lnurlp/${encodeURIComponent(alias)}`;
	const metadata = await fetch(lnurlPayUrl).then((response) => response.json());
	assert(metadata.allowsNostr === true, 'lnuts advertises NIP-57 zap support');
	assert(metadata.nostrPubkey === zapSigner.pub, 'lnuts advertises the configured zap signer');

	const zapRequest = signEvent(
		{
			kind: 9734,
			tags: [
				['p', user.pub],
				['P', metadata.nostrPubkey],
				['amount', String(amountSats * 1000)],
				['relays', RELAY]
			],
			content: `QA wallet zap ${run}`
		},
		payer.priv
	);
	const callback = new URL(metadata.callback);
	callback.searchParams.set('amount', String(amountSats * 1000));
	callback.searchParams.set('nostr', JSON.stringify(zapRequest));
	callback.searchParams.set('comment', zapRequest.content);
	const invoiceResult = await fetch(callback).then(async (response) => {
		const body = await response.json();
		if (!response.ok || !body.pr) throw new Error(body.reason || `callback -> ${response.status}`);
		return body;
	});
	assert(invoiceResult.pr, 'zap callback returns a Bolt11 invoice');
	console.log(`ok - sent ${amountSats}-sat test zap (FakeWallet auto-settlement)`);

	const receipt = await pollRelay(
		{ kinds: [9735], authors: [metadata.nostrPubkey], '#p': [user.pub], limit: 10 },
		'kind 9735 zap receipt',
		60_000
	);
	assert(verifyEvent(receipt), 'kind 9735 receipt has a valid signature');
	assert(
		receipt.tags.find((tag) => tag[0] === 'bolt11')?.[1] === invoiceResult.pr,
		'receipt contains the paid invoice'
	);
	assert(
		receipt.tags.find((tag) => tag[0] === 'description')?.[1] === JSON.stringify(zapRequest),
		'receipt commits to the exact zap request'
	);
	assert(
		receipt.tags.find((tag) => tag[0] === 'P')?.[1] === payer.pub,
		'receipt identifies the zap sender'
	);
	assert(true, 'kind 9735 receipt arrived correctly on the wallet relay');

	// Open Home only after the payment is ready. Its initial proof sync must
	// claim from lnuts without visiting Wallet Settings or clicking "Check".
	await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
	await page.getByRole('heading', { name: 'Home', exact: true }).waitFor({
		state: 'visible',
		timeout: 30_000
	});
	await page.getByText('zapped you', { exact: false }).waitFor({
		state: 'visible',
		timeout: 30_000
	});
	assert(true, 'kind 9735 receipt appears in the Home wallet feed');

	const proofState = await waitFor(
		'Home to claim and store lnuts proofs',
		() =>
			page.evaluate(
				({ accountPubkey, mint, expectedAmount }) => {
					const storedWallet = Object.keys(localStorage)
						.filter((key) => key.startsWith('unspent_') && key.endsWith(`_${mint}`))
						.map((proofKey) => {
							const proofs = JSON.parse(localStorage.getItem(proofKey) || '[]');
							const total = proofs.reduce((sum, proof) => sum + Number(proof.amount || 0), 0);
							return { proofKey, proofs, total };
						})
						.find(({ total }) => total === expectedAmount);
					const sync = JSON.parse(localStorage.getItem(`lnuts/proofs/${accountPubkey}`) || '{}');
					return storedWallet && sync.paymentIds?.length
						? {
								total: storedWallet.total,
								proofCount: storedWallet.proofs.length,
								proofKey: storedWallet.proofKey,
								sync
							}
						: null;
				},
				{ accountPubkey: user.pub, mint: mintUrl, expectedAmount: amountSats }
			),
		60_000,
		750
	);
	assert(proofState.total === amountSats, `Home stored ${amountSats} sats of valid proofs`);
	assert(proofState.proofCount > 0, 'Home stored at least one Cashu proof');
	assert(
		/^unspent_[0-9a-f]{64}_/.test(proofState.proofKey || ''),
		'Home persisted the proofs in the wallet proof namespace'
	);
	assert(
		Number.isSafeInteger(proofState.sync.receivedThrough),
		'Home advanced the durable lnuts receipt cursor'
	);

	const backup = await pollRelay(
		{ kinds: [7375], authors: [user.pub], limit: 10 },
		'kind 7375 proof backup',
		60_000
	);
	assert(verifyEvent(backup), 'kind 7375 proof backup has a valid signature');
	assert(
		backup.created_at >= receipt.created_at,
		'proof backup was published after receipt arrival'
	);
	assert(true, 'wallet published kind 7375 after importing lnuts proofs');

	await page.screenshot({ path: '/tmp/qa-wallet-final.png', fullPage: true });
	console.log('\nQA WALLET E2E PASS');
	console.log('  user:', user.pub);
	console.log('  mint:', mintUrl);
	console.log('  receipt:', receipt.id);
	console.log('  proof backup:', backup.id);
	console.log('  screenshot: /tmp/qa-wallet-final.png');
} catch (error) {
	if (page) {
		const diagnostics = await page
			.evaluate(() => ({
				proofKeys: Object.keys(localStorage)
					.filter((key) => key.startsWith('unspent_') || key.startsWith('lnuts/proofs/'))
					.map((key) => [key, localStorage.getItem(key)]),
				pendingBackups: localStorage.getItem('pendingProofBackups_v1')
			}))
			.catch(() => null);
		console.error('wallet diagnostics:', JSON.stringify(diagnostics));
		await page.screenshot({ path: '/tmp/qa-wallet-failure.png', fullPage: true }).catch(() => {});
		console.error('failure screenshot: /tmp/qa-wallet-failure.png');
	}
	throw error;
} finally {
	await browser?.close().catch(() => {});
	pool.close([RELAY]);
	if (mintContainer) {
		try {
			docker('stop', mintContainer);
			console.log('ok - stopped ephemeral test mint', mintContainer);
		} catch (error) {
			console.warn('could not stop ephemeral test mint:', error.message);
		}
	}
	for (const path of [lnutsDb, `${lnutsDb}-shm`, `${lnutsDb}-wal`]) {
		rmSync(path, { force: true });
	}
}

process.exit(0);
