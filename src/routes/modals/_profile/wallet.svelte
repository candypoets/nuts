<script lang="ts">
	import { ConnectionStatus, Kind17375Parsed } from '@candypoets/nipworker';
	import { usePublish } from '@candypoets/nipworker/hooks';
	import { asKind17375, fbArray, isConnectionStatus } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
	import { generateMnemonic, validateMnemonic } from '@scure/bip39';
	import { wordlist } from '@scure/bip39/wordlists/english';
	import { uniq } from 'lodash';
	import { generateSecretKey, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';

	import { kind17375 } from 'src/controller/nostr';
	import { isMintUrlValid } from 'src/lib/mint';
	import { buildCashuProfile } from 'src/lib/cashuProfile';
	import { claimLightningProofs } from 'src/lib/lightningProofs';
	import { now } from 'src/lib/period';
	import { areStringListEqual } from 'src/lib/utils';
	import { getContext, onMount } from 'svelte';
	// New imports from wallet utils
	import { key, walletMnemonic, walletMnemonicIndex, walletPassphrase } from 'src/controller';
	import { nutsWallet, setNutsWallet } from 'src/controller/proofs';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import {
		DEFAULT_MINTS,
		deriveFromMnemonic,
		fetchAvailableMints,
		getRatingDisplay,
		getStatsText,
		getStatusColor,
		parsePrivkey,
		type MintInfo
	} from 'src/lib/wallet';

	export let header = true;

	let animator = getContext('animator');

	// ------------------
	// Wallet source UI
	// ------------------
	type WalletMode = 'mnemonic' | 'privkey' | 'create';
	let walletMode: WalletMode = 'create';

	const CASHU_BASE_PATH = "m/44'/1237'/17375'/0";

	// Mnemonic inputs
	let inputMnemonic = '';
	let inputPassphrase = '';
	let mnemonicIndex = 0;
	let mnemonicError: string | null = null;

	// Private key input
	let inputPrivkey = '';
	let privkeyError: string | null = null;

	// A single stable fallback secret key (used when no user input and no existing wallet)
	const fallbackSecretKey: Uint8Array = generateSecretKey();

	// Kind17375 and selected secret
	$: k17375 = $kind17375 && asKind17375($kind17375);

	// User-selected secret key based on the mode
	$: derivedMnemonicSK =
		walletMode === 'mnemonic'
			? deriveFromMnemonic(inputMnemonic, inputPassphrase, mnemonicIndex)
			: null;

	$: derivedPrivkeySK = walletMode === 'privkey' ? parsePrivkey(inputPrivkey) : null;

	// Create mode: generate mnemonic once if empty, allow regenerate via button
	function ensureGeneratedMnemonic() {
		if (!inputMnemonic.trim()) {
			inputMnemonic = generateMnemonic(wordlist, 128);
			mnemonicIndex = 0;
		}
	}
	function regenerateMnemonic() {
		inputMnemonic = generateMnemonic(wordlist, 128);
		mnemonicIndex = 0;
	}

	// When switching to create mode, generate a mnemonic if none present yet
	$: if (walletMode === 'create') {
		ensureGeneratedMnemonic();
	}

	// Use existing k17375 priv key if present (hex string), otherwise fallback
	$: defaultSecretKey =
		(k17375?.p2pkPrivKey() && hexToBytes(k17375?.p2pkPrivKey() as string)) || fallbackSecretKey;

	// The effective secret key: preference order is user-provided (mnemonic/privkey/create) then existing or fallback
	$: userSecretKey =
		(walletMode === 'mnemonic' && derivedMnemonicSK) ||
		(walletMode === 'privkey' && derivedPrivkeySK) ||
		(walletMode === 'create' && derivedMnemonicSK) ||
		null;

	$: secretKey = userSecretKey || defaultSecretKey;

	// ------------------
	// Remainder of original component state
	// ------------------
	let search = '';
	let loading = false;
	let isInvalid = false;
	let searchFocused = false;
	let filteredMints: MintInfo[] = [];

	let availableMints: MintInfo[] = [];
	let selectedMints: string[] = [];
	let checkingLightningPayments = false;
	let lightningPaymentMessage = '';
	let lightningPaymentError = '';

	$: selectableMints = availableMints.filter((am) => !selectedMints.some((sm) => sm == am.url));

	// Pubkey/npub/nsec
	$: pubkey = secretKey && getPublicKey(secretKey);
	$: npub = pubkey ? nip19.npubEncode(pubkey) : '';
	$: nsec = secretKey ? nip19.nsecEncode(secretKey) : '';

	onMount(async () => {
		if ($nutsWallet && $key.pub && $key.hasSigner === true) {
			checkLightningPayments();
		}
		availableMints = await fetchAvailableMints();
	});

	// Initialize selectedMints from existing wallet or defaults (once when availableMints loads)
	$: if (selectedMints.length === 0 && availableMints.length > 0) {
		const mints = fbArray(k17375 as Kind17375Parsed, 'mints');
		selectedMints = mints && mints.length > 0 ? [...mints] : [...DEFAULT_MINTS];
	}

	function filterMints() {
		if (!search.trim()) {
			filteredMints = [];
			return;
		}

		const searchTerm = search.toLowerCase();
		filteredMints = selectableMints.filter(
			(mint) =>
				mint.title.toLowerCase().includes(searchTerm) ||
				mint.url.toLowerCase().includes(searchTerm) ||
				mint.description.toLowerCase().includes(searchTerm)
		);
	}

	function removeMint(url: string) {
		selectedMints = selectedMints.filter((sm) => sm !== url);
	}

	async function selectMint(mint: MintInfo) {
		loading = true;
		const isValid = await isMintUrlValid(mint.url);
		loading = false;
		if (isValid) {
			selectedMints = uniq([mint.url, ...selectedMints]);
			search = '';
			filteredMints = [];
			searchFocused = false;
		}
	}

	async function selectMintUrl(url: string) {
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'https://' + url;
		}
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url);
		} catch {
			isInvalid = true;
			return;
		}
		const isLocalMint =
			['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname) ||
			/^10\./.test(parsedUrl.hostname) ||
			/^192\.168\./.test(parsedUrl.hostname) ||
			/^172\.(1[6-9]|2\d|3[01])\./.test(parsedUrl.hostname);
		if (parsedUrl.protocol === 'http:' && !isLocalMint) {
			parsedUrl.protocol = 'https:';
			url = parsedUrl.toString();
		}
		loading = true;
		const isValid = await isMintUrlValid(url);
		loading = false;
		if (isValid) {
			selectedMints = uniq([url, ...selectedMints]);
			isInvalid = false;
			search = '';
			filteredMints = [];
			searchFocused = false;
		} else {
			isInvalid = true;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			if (filteredMints.length > 0) {
				selectMint(filteredMints[0]);
			} else if (search.trim()) {
				selectMintUrl(search);
			}
		}
	}

	function saveWallet() {
		const newWallet: EventTemplate = {
			kind: 17375,
			created_at: now(),
			content: JSON.stringify([
				['privkey', bytesToHex(secretKey)],
				...selectedMints.map((sm) => ['mint', sm])
			]),
			tags: []
		};
		const trustedMints = buildCashuProfile(secretKey, selectedMints, now());

		// Persist mnemonic locally when applicable
		if (walletMode === 'mnemonic' || walletMode === 'create') {
			const trimmed = (inputMnemonic || '').trim();
			if (trimmed && validateMnemonic(trimmed, wordlist)) {
				$walletMnemonic = trimmed;
				$walletMnemonicIndex = mnemonicIndex;
				if (inputPassphrase) {
					$walletPassphrase = inputPassphrase;
				}
			}
		}

		let sendStatus: { [url: string]: ConnectionStatus } = {};

		usePublish(
			'newWallet',
			newWallet,
			(message) => {
				const status = isConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl();
					if (relayUrl) {
						sendStatus[relayUrl] = status;
						updateSendStatus('newWallet_' + pubkey, sendStatus);
					}
					// $key.pub = pubkey;
					setNutsWallet(bytesToHex(secretKey), pubkey, selectedMints, now());
				}
			},
			{ trackStatus: true, defaultRelays: DEFAULT_RELAYS }
		);
		usePublish('trustedMints', trustedMints, (message) => console.log('trustedMints', message), {
			trackStatus: true,
			defaultRelays: DEFAULT_RELAYS
		});
	}

	async function checkLightningPayments(): Promise<void> {
		lightningPaymentMessage = '';
		lightningPaymentError = '';

		if (!$nutsWallet) {
			lightningPaymentError = 'Set up your Cashu wallet before checking for payments.';
			return;
		}
		if (!$key.pub || $key.hasSigner !== true) {
			lightningPaymentError = 'Reconnect your Nostr account with a signer to check for payments.';
			return;
		}

		checkingLightningPayments = true;
		try {
			const result = await claimLightningProofs($key.pub, $nutsWallet);
			lightningPaymentMessage =
				result.receivedPayments > 0
					? `Received ${result.receivedSats} sat${result.receivedSats === 1 ? '' : 's'} from ${result.receivedPayments} Lightning payment${result.receivedPayments === 1 ? '' : 's'}.`
					: 'No new Lightning payments.';
		} catch (error) {
			lightningPaymentError =
				error instanceof Error ? error.message : 'Could not check for Lightning payments.';
		} finally {
			checkingLightningPayments = false;
		}
	}
</script>

<div class="h-screen bg-base-300 bg-opacity-85 pt-4 overflow-scroll" data-scroll-container>
	{#if header}
		<div class="flex justify-between mb-6 px-4 pt-safe">
			<button class="w-1/4" aria-label="Return to previous screen" on:click={animator.goBack}>
				<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
			</button>
			<h2 class="font-bold text-xl">Cashu Wallet</h2>
			<div class="w-1/4"></div>
		</div>
	{/if}

	<div class="space-y-6 px-4">
		{#if !$nutsWallet}
			<!-- Wallet Source Section -->
			<div class="bg-base-300 p-4 rounded-lg border-primary-content border space-y-3">
				<h3 class="font-semibold">Wallet source</h3>

				<div class="join">
					<button
						class="btn join-item {walletMode === 'create' ? 'btn-accent' : 'btn-ghost'}"
						on:click={() => (walletMode = 'create')}
					>
						New
					</button>
					<button
						class="btn join-item {walletMode === 'mnemonic' ? 'btn-accent' : 'btn-ghost'}"
						on:click={() => (walletMode = 'mnemonic')}
					>
						Mnemonic
					</button>
					<button
						class="btn join-item {walletMode === 'privkey' ? 'btn-accent' : 'btn-ghost'}"
						on:click={() => (walletMode = 'privkey')}
					>
						Private key
					</button>
				</div>

				{#if walletMode === 'mnemonic' || walletMode === 'create'}
					<div class="space-y-3">
						<label class="text-sm opacity-80" for="wallet-mnemonic">BIP-39 mnemonic</label>
						<textarea
							id="wallet-mnemonic"
							class="textarea textarea-bordered w-full"
							rows="3"
							placeholder="treat dwarf wealth gasp brass outside high rent blood crowd make end"
							bind:value={inputMnemonic}
						></textarea>
						<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
							<div class="col-span-1">
								<label class="text-sm opacity-80" for="wallet-passphrase">
									Passphrase (optional)
								</label>
								<input
									id="wallet-passphrase"
									class="input input-bordered w-full"
									type="password"
									placeholder="Optional BIP-39 passphrase"
									bind:value={inputPassphrase}
								/>
							</div>
							<div class="col-span-1">
								<label class="text-sm opacity-80" for="wallet-derivation-path">
									Derivation path
								</label>
								<input
									id="wallet-derivation-path"
									class="input input-bordered w-full"
									readonly
									value={`${CASHU_BASE_PATH}/${mnemonicIndex}`}
								/>
							</div>
							<div class="col-span-1">
								<label class="text-sm opacity-80" for="wallet-index">Index</label>
								<input
									id="wallet-index"
									class="input input-bordered w-full"
									type="number"
									min="0"
									bind:value={mnemonicIndex}
								/>
							</div>
						</div>
						{#if walletMode === 'create'}
							<div class="flex gap-2">
								<button class="btn btn-outline btn-sm" on:click={regenerateMnemonic}>
									Regenerate
								</button>
								<button
									class="btn btn-outline btn-sm"
									on:click={() => navigator.clipboard.writeText(inputMnemonic)}
								>
									Copy mnemonic
									<Icon icon="material-symbols:content-copy" class="w-4 h-4 ml-1" />
								</button>
							</div>
						{/if}
						{#if mnemonicError}
							<div class="text-error text-sm">{mnemonicError}</div>
						{/if}
					</div>
				{:else if walletMode === 'privkey'}
					<div class="space-y-3">
						<label class="text-sm opacity-80" for="wallet-private-key">
							Private key (hex 64 chars or nsec...)
						</label>
						<input
							id="wallet-private-key"
							class="input input-bordered w-full"
							type="text"
							placeholder="nsec1... or 64-char hex"
							bind:value={inputPrivkey}
						/>
						{#if privkeyError}
							<div class="text-error text-sm">{privkeyError}</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if $nutsWallet}
			<div class="bg-base-300 p-4 rounded-lg border-primary-content border space-y-3">
				<div>
					<h3 class="font-semibold">Lightning payments</h3>
					<p class="text-sm opacity-70">
						Check for sats sent to your claimed Lightning address and save them to this wallet.
					</p>
				</div>
				<button
					class="btn btn-primary w-full text-white"
					disabled={checkingLightningPayments || $key.hasSigner !== true}
					on:click={checkLightningPayments}
				>
					{#if checkingLightningPayments}
						<span class="loading loading-spinner loading-sm"></span>
						Checking payments…
					{:else}
						Check for new sats
					{/if}
				</button>
				{#if lightningPaymentMessage}
					<p class="text-success text-sm">{lightningPaymentMessage}</p>
				{/if}
				{#if lightningPaymentError}
					<p class="text-error text-sm">{lightningPaymentError}</p>
				{/if}
			</div>
		{/if}

		<!-- Wallet Address Section -->
		<div class="bg-base-300 p-4 rounded-lg border-primary-content border space-y-3">
			<h3 class="font-semibold">Wallet Address</h3>

			<label class="text-sm opacity-80" for="wallet-npub">npub (shareable)</label>
			<div class="flex items-center">
				<input
					id="wallet-npub"
					type="text"
					readonly
					value={npub}
					class="input input-bordered w-full text-sm"
				/>
				<button class="btn btn-square ml-2" on:click={() => navigator.clipboard.writeText(npub)}>
					<Icon icon="material-symbols:content-copy" class="w-5 h-5" />
				</button>
			</div>

			<label class="text-sm opacity-80 mt-2" for="wallet-nsec">nsec (private)</label>
			<div class="flex items-center">
				<input
					id="wallet-nsec"
					type="text"
					readonly
					value={nsec}
					class="input input-bordered w-full text-sm"
				/>
				<button class="btn btn-square ml-2" on:click={() => navigator.clipboard.writeText(nsec)}>
					<Icon icon="material-symbols:content-copy" class="w-5 h-5" />
				</button>
			</div>
		</div>

		<!-- Mint Selection Section -->
		<div class="bg-base-300 border-primary-content border p-4 rounded-lg">
			<h3 class="font-semibold mb-3">Mints</h3>

			<!-- Search to add mints -->
			<div class="relative w-full mb-4">
				<input
					class="w-full px-3 py-2 input input-bordered"
					type="text"
					bind:value={search}
					on:keydown={handleKeyDown}
					on:input={filterMints}
					on:focus={() => {
						searchFocused = true;
						filterMints();
					}}
					on:blur={() => {
						setTimeout(() => {
							searchFocused = false;
						}, 200);
					}}
					placeholder="Search mints to add..."
				/>

				{#if searchFocused && (filteredMints.length > 0 || isInvalid)}
					<div
						class="absolute w-full mt-1 bg-base-100 shadow-lg rounded-md z-10 max-h-60 overflow-y-auto border border-primary-content"
					>
						{#if isInvalid}
							<div class="p-3 text-error text-sm">Invalid mint URL</div>
						{:else}
							{#each filteredMints as mint (mint.url)}
								<button
									class="w-full text-left p-3 hover:bg-base-300 cursor-pointer border-b border-primary-content last:border-none flex items-center"
									on:click={() => selectMint(mint)}
								>
									<div class="flex items-start space-x-3 flex-1 min-w-0">
										{#if mint.iconUrl}
											<img
												src={mint.iconUrl}
												alt=""
												class="w-8 h-8 rounded-full flex-shrink-0"
												on:error={(e) => (e.currentTarget.style.display = 'none')}
											/>
										{:else}
											<div class="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0"></div>
										{/if}
										<div class="flex-1 min-w-0">
											<div class="font-medium truncate">{mint.title}</div>
											<div class="text-xs truncate opacity-70">{mint.url}</div>
											<div class="flex items-center gap-2 text-xs mt-1">
												<span class={`w-2 h-2 rounded-full ${getStatusColor(mint.state)}`}></span>
												<span class="opacity-70">{getStatsText(mint)}</span>
												<span>{getRatingDisplay(mint.rating)}</span>
											</div>
										</div>
									</div>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<!-- Selected mints (Your Mints) -->
			{#if selectedMints.length > 0}
				<h4 class="text-sm font-medium mb-2 opacity-70">Your Mints ({selectedMints.length})</h4>
				<div class="space-y-2">
					{#each selectedMints as mint (mint)}
						{@const nurl = normalizeURL(mint)}
						{@const mintInfo = availableMints.find((m) => m.url === nurl)}
						<div
							class="flex justify-between items-center p-3 bg-base-200 rounded-lg border border-primary-content"
						>
							{#if mintInfo}
								<div class="flex items-start space-x-3 flex-1 min-w-0">
									{#if mintInfo?.iconUrl}
										<img
											src={proxyAvatarUrl(mintInfo.iconUrl)}
											alt=""
											class="w-8 h-8 rounded-full flex-shrink-0"
										/>
									{:else}
										<div class="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0"></div>
									{/if}
									<div class="flex-1 min-w-0">
										<div class="font-medium truncate">{mintInfo?.title || nurl}</div>
										<div class="text-xs truncate opacity-70">{nurl}</div>
										{#if mintInfo}
											<div class="flex items-center gap-2 text-xs mt-1">
												<span class={`w-2 h-2 rounded-full ${getStatusColor(mintInfo.state)}`}
												></span>
												<span class="opacity-70">{getStatsText(mintInfo)}</span>
											</div>
										{/if}
									</div>
								</div>
							{:else}
								<div class="flex items-center space-x-3 flex-1 min-w-0">
									<div class="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0"></div>
									<div class="flex-1 min-w-0">
										<div class="font-medium truncate">{nurl}</div>
									</div>
								</div>
							{/if}
							<button
								class="btn btn-ghost btn-sm"
								on:click={() => removeMint(mint)}
								title="Remove mint"
							>
								<Icon icon="mdi:delete-outline" class="w-5 h-5" />
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-center py-6 opacity-50">
					<p class="text-sm">No mints selected. Search above to add.</p>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex justify-center mt-6 px-4 mb-8">
		<button
			class="btn btn-primary w-full text-white"
			disabled={areStringListEqual(selectedMints, fbArray(k17375, 'mints'))}
			on:click={() => {
				saveWallet();
			}}
		>
			Save Wallet
		</button>
	</div>
</div>
