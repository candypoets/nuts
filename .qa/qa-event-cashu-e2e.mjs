// E2E: funded Cashu wallet -> paid event Nutzap -> kind 8 entrance award.
//
//   1. Starts an ephemeral Nutshell FakeWallet mint unless QA_MINT_URL is set
//   2. Seeds an admin-authored paid calendar event and event_access definition
//   3. Publishes the organizer's kind 10019 receiving key and trusted test mint
//   4. Creates the buyer's wallet through the real Home UI and funds it with
//      proofs minted by the FakeWallet mint
//   5. Opens the real event detail, pays with Cashu, and verifies the signed
//      kind 9321 Nutzap plus issuer-signed kind 8 entrance award
//   6. Reposts the exact redemption to prove idempotency, then tries a new
//      Nutzap with the same proofs to prove durable replay rejection
//   7. Receives the P2PK proofs with the organizer key and proves the mint marks
//      them spent
//
// Run:
//   QA_STATE=/tmp/qa-community-event-cashu.json QA_DEV_PORT=5196 \
//     node .qa/qa-bootstrap.mjs --api
//   QA_STATE=/tmp/qa-community-event-cashu.json QA_DEV_PORT=5196 \
//     node .qa/qa-event-cashu-e2e.mjs
//
// Screenshots: /tmp/event-cashu-final.png, /tmp/event-cashu-failure.png
import { execFileSync } from 'child_process';
import { CheckStateEnum, hashToCurve, Mint, MintQuoteState, Wallet } from '@cashu/cashu-ts';
import { secp256k1 } from '@noble/curves/secp256k1';
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
	plantServiceBaseUrl,
	randomKey,
	readCommunity,
	seedSession,
	signEvent,
	sleep
} from './qa-lib.mjs';

const community = readCommunity();
assert(community?.relay_url, 'community state present (run qa-bootstrap.mjs --api first)');

const RELAY = community.relay_url;
const BASE = (process.env.BASE_URL || `http://localhost:${DEV_SERVER_PORT}`).replace(/\/$/, '');
const run = Date.now().toString(36);
const keys = loadKeys();
const buyer = randomKey();
const organizerCashu = randomKey();
const organizerCashuPubkey = Buffer.from(
	secp256k1.getPublicKey(organizerCashu.priv, true)
).toString('hex');
const amountSats = Number(process.env.QA_EVENT_SATS || 21);
const eventD = `qa-cashu-${run}`;
const eventAddress = `31923:${keys.admin.pub}:${eventD}`;
const badgeD = `event-${eventD}-entrance`;
const badgeAddress = `30009:${keys.admin.pub}:${badgeD}`;
const eventTitle = `QA Cashu Ticket ${run}`;
const pool = makePool();

process.env.VITE_DEFAULT_RELAYS = RELAY;
process.env.VITE_INDEXER_RELAYS = RELAY;

let browser;
let page;
let mintContainer;

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

	mintContainer = `nuts-qa-event-mint-${process.pid}-${run}`.toLowerCase();
	const image = process.env.QA_MINT_IMAGE || 'cashubtc/nutshell:0.18.1';
	docker(
		'run',
		'-d',
		'--rm',
		'--name',
		mintContainer,
		'-p',
		'0.0.0.0::3338',
		'-e',
		'MINT_BACKEND_BOLT11_SAT=FakeWallet',
		'-e',
		'MINT_LISTEN_HOST=0.0.0.0',
		'-e',
		'MINT_LISTEN_PORT=3338',
		'-e',
		`MINT_PRIVATE_KEY=qa-event-${run}`,
		'-e',
		'MINT_INFO_NAME=Nuts Event QA Mint',
		image,
		'poetry',
		'run',
		'mint'
	);
	const port = await waitFor('event test mint port', async () => {
		const output = docker('port', mintContainer, '3338/tcp');
		return output.match(/:(\d+)$/)?.[1];
	});
	// The browser runs on the host while the community verifier runs inside
	// Docker. Advertising the default bridge gateway reaches the same published
	// mint port from both sides.
	const mintUrl = `http://${process.env.QA_MINT_HOST || '172.17.0.1'}:${port}`;
	await waitFor(
		'ephemeral event FakeWallet mint',
		async () => {
			const response = await fetch(`${mintUrl}/v1/info`, {
				signal: AbortSignal.timeout(2000)
			});
			return response.ok;
		},
		60_000
	);
	console.log('ok - ephemeral event mint ready at', mintUrl);
	return mintUrl;
}

async function pollRelay(filter, label, timeoutMs = 45_000) {
	return waitFor(
		label,
		async () => {
			const events = await pool.querySync([RELAY], filter).catch(() => []);
			return events.sort((left, right) => right.created_at - left.created_at)[0];
		},
		timeoutMs,
		750
	);
}

async function publishAndWait(event, filter, label) {
	await Promise.allSettled(pool.publish([RELAY], event));
	const stored = await pollRelay(filter, label);
	assert(stored.id === event.id, label);
	return stored;
}

async function seedCommunityEvents(mintUrl) {
	const relaySecrets = await getRelaySecrets(community.id, keys);
	const communityInfo = await fetch(`${community.base_url}/community/info`).then((response) =>
		response.json()
	);

	const buyerMembership = signEvent(
		{
			kind: 8,
			tags: [
				['a', communityInfo.required_badge],
				['p', buyer.pub]
			]
		},
		relaySecrets.badge_issuer_secret_key
	);
	await publishAndWait(
		buyerMembership,
		{ kinds: [8], authors: [communityInfo.badge_issuer], '#p': [buyer.pub], limit: 10 },
		'buyer membership stored on the community relay'
	);

	const buyerProfile = signEvent(
		{ kind: 0, tags: [], content: JSON.stringify({ name: `QA Cashu Buyer ${run}` }) },
		buyer.priv
	);
	await publishAndWait(
		buyerProfile,
		{ kinds: [0], authors: [buyer.pub], limit: 1 },
		'buyer profile stored on the community relay'
	);

	const organizerNutzapInfo = signEvent(
		{
			kind: 10019,
			tags: [
				['mint', mintUrl],
				['pubkey', organizerCashuPubkey]
			]
		},
		keys.admin.priv
	);
	await publishAndWait(
		organizerNutzapInfo,
		{ kinds: [10019], authors: [keys.admin.pub], limit: 1 },
		'organizer published a trusted mint and Cashu receiving key'
	);

	const start = Math.floor(Date.now() / 1000) + 3600;
	const end = start + 3600;
	const definition = signEvent(
		{
			kind: 30009,
			tags: [
				['d', badgeD],
				['type', 'event_access'],
				['t', 'event_access'],
				['t', 'sellable'],
				['name', `${eventTitle} entrance`],
				['description', `Paid entrance for ${eventTitle}`],
				['a', eventAddress],
				['price', '1', 'EUR'],
				['price_sats', String(amountSats)],
				['billing', 'one_time'],
				['max_uses', '1'],
				['availability', 'available'],
				['expiration', String(end)],
				['r', RELAY]
			]
		},
		keys.admin.priv
	);
	await publishAndWait(
		definition,
		{ kinds: [30009], authors: [keys.admin.pub], '#d': [badgeD], limit: 1 },
		'event entrance definition stored on the community relay'
	);

	const calendarEvent = signEvent(
		{
			kind: 31923,
			tags: [
				['d', eventD],
				['title', eventTitle],
				['summary', 'Cashu event payment E2E'],
				['start', String(start)],
				['end', String(end)],
				['t', 'training'],
				['access', 'restricted'],
				['entrance_badge', badgeAddress],
				['entrance_price', '1', 'EUR'],
				['entrance_sats', String(amountSats)]
			]
		},
		keys.admin.priv
	);
	await publishAndWait(
		calendarEvent,
		{ kinds: [31923], authors: [keys.admin.pub], '#d': [eventD], limit: 1 },
		'paid calendar event stored on the community relay'
	);
	return { calendarEvent, communityInfo, definition };
}

async function mintBuyerProofs(mintUrl) {
	const wallet = new Wallet(mintUrl, { unit: 'sat' });
	await wallet.loadMint();
	const quote = await wallet.createMintQuote(amountSats);
	await waitFor(
		'FakeWallet mint quote payment',
		async () => (await wallet.checkMintQuote(quote.quote)).state === MintQuoteState.PAID,
		30_000
	);
	const proofs = await wallet.mintProofs(amountSats, quote.quote);
	assert(
		proofs.reduce((total, proof) => total + proof.amount, 0) === amountSats,
		`test mint issued ${amountSats} sats`
	);
	assert(
		proofs.every((proof) => proof.dleq),
		'test mint issued DLEQ-verifiable proofs'
	);
	return proofs;
}

function seedBuyerProofs({ walletPubkey, walletPrivkey, mintUrl, proofs }) {
	for (const pubkey of [walletPubkey, walletPrivkey]) {
		localStorage.setItem(`unspent_${pubkey}_${mintUrl}`, JSON.stringify(proofs));
	}
}

async function postRedemption(nutzap) {
	const body = JSON.stringify({
		type: 'cashu',
		event_address: eventAddress,
		badge_address: badgeAddress,
		amount: amountSats,
		nutzap
	});
	const url = `${community.base_url}/redeem`;
	return fetch(url, {
		method: 'POST',
		headers: {
			authorization: nip98Header(url, 'POST', body, buyer.priv),
			'content-type': 'application/json'
		},
		body
	});
}

try {
	const mintUrl = await provisionTestMint();
	const { communityInfo, definition } = await seedCommunityEvents(mintUrl);
	const buyerProofs = await mintBuyerProofs(mintUrl);

	const runningBase = await ensureDevServer();
	assert(runningBase === BASE, `event Cashu QA dev server uses expected origin (${BASE})`);

	browser = await launchBrowser();
	const context = await browser.newContext({
		viewport: { width: 1600, height: 1000 },
		ignoreHTTPSErrors: true
	});
	await context.addInitScript(seedSession, browserAccount(buyer));
	await context.addInitScript(plantServiceBaseUrl, community);
	page = await context.newPage();
	page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 500)));
	page.on('console', (message) => {
		const text = message.text();
		if (
			message.type() === 'error' ||
			text.includes('[ecash]') ||
			text.includes('[tx]') ||
			text.includes('[wallet]')
		) {
			console.log(`[browser ${message.type()}]`, text.slice(0, 1000));
		}
	});

	// Create the buyer wallet through the real UI so the app publishes and
	// consumes its normal kind 17375 wallet configuration.
	await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
	await page.getByRole('button', { name: 'Set up wallet' }).waitFor({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Set up wallet' }).click();
	await page.locator('#wallet-mnemonic').waitFor({ state: 'visible', timeout: 20_000 });
	const mintSearch = page.getByPlaceholder('Search mints to add...');
	await mintSearch.fill(mintUrl);
	await mintSearch.press('Enter');
	await page.getByText('Your Mints (1)').waitFor({ state: 'visible', timeout: 30_000 });
	const walletNpub = await page.locator('#wallet-npub').inputValue();
	const decodedWalletNpub = nip19.decode(walletNpub);
	assert(decodedWalletNpub.type === 'npub', 'buyer wallet exposes its Cashu P2PK key');
	const walletPubkey = decodedWalletNpub.data;
	const walletNsec = await page.locator('#wallet-nsec').inputValue();
	const decodedWalletNsec = nip19.decode(walletNsec);
	assert(decodedWalletNsec.type === 'nsec', 'buyer wallet exposes its Cashu private key');
	const walletPrivkey = Buffer.from(decodedWalletNsec.data).toString('hex');
	await page.getByRole('button', { name: 'Save Wallet', exact: true }).click();

	const walletEvent = await pollRelay(
		{ kinds: [17375], authors: [buyer.pub], limit: 5 },
		'buyer kind 17375 wallet event'
	);
	assert(verifyEvent(walletEvent), 'buyer wallet event has a valid signature');
	assert(
		/^[0-9a-f]{64}$/i.test(walletPrivkey || ''),
		'buyer wallet private key is available to its local wallet'
	);

	await page.evaluate(seedBuyerProofs, {
		walletPubkey,
		walletPrivkey,
		mintUrl,
		proofs: buyerProofs
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitFor(
		'buyer wallet balance',
		() =>
			page
				.locator('body')
				.innerText()
				.then((text) => text.includes(String(amountSats))),
		30_000
	);
	assert(true, 'buyer wallet loaded the funded test-mint proofs');

	// Open the event detail directly and use its real sats checkout button.
	const eventPath = `/explore/event:${encodeURIComponent(RELAY)}:${encodeURIComponent(eventAddress)}`;
	await page.goto(`${BASE}${eventPath}`, { waitUntil: 'domcontentloaded' });
	await page.getByRole('heading', { name: eventTitle }).waitFor({ timeout: 30_000 });
	const cashuTicketButton = page.getByRole('button', {
		name: `₿ ${amountSats} sats`,
		exact: true
	});
	await cashuTicketButton.waitFor({ state: 'visible', timeout: 20_000 });
	await cashuTicketButton.click();

	const payButton = page.getByRole('button', { name: 'Pay with Cashu' });
	await payButton.waitFor({ state: 'visible', timeout: 30_000 });
	await waitFor('Cashu pay button enabled', async () => !(await payButton.isDisabled()), 30_000);
	assert(
		(await page.locator('#send-amt').inputValue()) === String(amountSats),
		'ticket sats amount is fixed in checkout'
	);
	await payButton.click();

	const award = await pollRelay(
		{
			kinds: [8],
			authors: [communityInfo.badge_issuer],
			'#p': [buyer.pub],
			'#a': [badgeAddress],
			limit: 10
		},
		'issuer-signed event entrance award',
		60_000
	);
	assert(verifyEvent(award), 'event entrance award has a valid issuer signature');
	assert(
		award.tags.some((tag) => tag[0] === 'a' && tag[1] === badgeAddress),
		'event entrance award references the paid definition'
	);

	const nutzap = await pollRelay(
		{
			kinds: [9321],
			authors: [buyer.pub],
			'#a': [badgeAddress],
			limit: 10
		},
		'event payment Nutzap',
		60_000
	);
	assert(verifyEvent(nutzap), 'event payment Nutzap has a valid buyer signature');
	assert(
		nutzap.tags.some((tag) => tag[0] === 'p' && tag[1] === keys.admin.pub),
		'Nutzap is addressed to the event organizer'
	);
	assert(
		nutzap.tags.some((tag) => tag[0] === 'u' && tag[1] === mintUrl),
		'Nutzap uses the organizer trusted mint'
	);
	const lockedProofs = nutzap.tags
		.filter((tag) => tag[0] === 'proof')
		.map((tag) => JSON.parse(tag[1]));
	assert(
		lockedProofs.reduce((total, proof) => total + proof.amount, 0) === amountSats,
		'Nutzap contains the exact event price'
	);
	assert(
		award.tags.some((tag) => tag[0] === 'i' && tag[1] === `payment-redemption:${nutzap.id}`),
		'badge award is idempotently tied to the Nutzap id'
	);

	// Same signed payment is idempotent and returns the same badge.
	const duplicateResponse = await postRedemption(nutzap);
	const duplicateResult = await duplicateResponse.json();
	assert(duplicateResponse.ok, 'repeating the exact Cashu redemption is accepted');
	assert(duplicateResult.event_id === award.id, 'idempotent redemption returns the same badge');

	// A different signed Nutzap cannot reuse the reserved proofs, even while
	// they are still UNSPENT and locked to the organizer.
	const replay = signEvent(
		{
			kind: 9321,
			content: `replay attempt ${run}`,
			tags: nutzap.tags
		},
		buyer.priv
	);
	assert(replay.id !== nutzap.id, 'replay attempt has a distinct signed Nutzap id');
	const replayResponse = await postRedemption(replay);
	assert(replayResponse.status === 409, 'same Cashu proofs cannot purchase a second badge');
	const replayBody = await replayResponse.json();
	assert(
		String(replayBody.message || replayBody.error).includes('already used'),
		'replay rejection explains that the proofs were already used'
	);

	assert(
		award.tags.filter(
			(tag) => tag[0] === 'i' && tag[1]?.startsWith('cashu-proof:')
		).length === lockedProofs.length,
		'badge service persists one replay claim for every accepted proof'
	);

	// The organizer can actually receive the locked payment, which spends the
	// Nutzap proofs at the mint and completes payment finality.
	const organizerWallet = new Wallet(mintUrl, { unit: 'sat' });
	await organizerWallet.loadMint();
	const receivedProofs = await organizerWallet.receive(
		{ mint: mintUrl, proofs: lockedProofs, unit: 'sat' },
		{ privkey: organizerCashu.priv }
	);
	assert(
		receivedProofs.reduce((total, proof) => total + proof.amount, 0) === amountSats,
		'organizer received the full P2PK-locked event payment'
	);
	const mint = new Mint(mintUrl);
	const Ys = lockedProofs.map((proof) =>
		hashToCurve(new TextEncoder().encode(proof.secret)).toHex(true)
	);
	const spentStates = (await mint.check({ Ys })).states;
	assert(
		spentStates.every((state) => state.state === CheckStateEnum.SPENT),
		'mint reports every accepted Nutzap proof as spent after organizer receipt'
	);

	await page.screenshot({ path: '/tmp/event-cashu-final.png', fullPage: true });
	console.log('\nQA EVENT CASHU E2E PASS');
	console.log('  buyer:', buyer.pub);
	console.log('  event:', eventAddress);
	console.log('  mint:', mintUrl);
	console.log('  nutzap:', nutzap.id);
	console.log('  badge:', award.id);
	console.log('  screenshot: /tmp/event-cashu-final.png');
} catch (error) {
	if (page) {
		await page.screenshot({ path: '/tmp/event-cashu-failure.png', fullPage: true }).catch(() => {});
		console.error('failure screenshot: /tmp/event-cashu-failure.png');
		console.error(
			'body:',
			await page
				.locator('body')
				.innerText()
				.catch(() => '(unavailable)')
		);
	}
	throw error;
} finally {
	await browser?.close().catch(() => {});
	pool.destroy([RELAY]);
	if (mintContainer) {
		try {
			docker('stop', mintContainer);
			console.log('ok - stopped ephemeral event mint', mintContainer);
		} catch (error) {
			console.warn('could not stop ephemeral event mint:', error.message);
		}
	}
}

process.exit(0);
