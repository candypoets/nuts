<script lang="ts">
	import {
		constructClaimEvent,
		postClaimEvent,
		queryExistingClaim,
		type Alias
	} from '@candypoets/lnuts/utils';
	import { ConnectionStatus, Kind17375Parsed } from '@candypoets/nipworker';
	import { usePublish, useSignEvent } from '@candypoets/nipworker/hooks';
	import { asKind17375, fbArray, isConnectionStatus } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
	import { generateMnemonic, validateMnemonic } from '@scure/bip39';
	import { wordlist } from '@scure/bip39/wordlists/english';
	import { uniq } from 'lodash';
	import { generateSecretKey, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';

	import { kind17375, readRelays } from 'src/controller/nostr';
	import { isMintUrlValid } from 'src/lib/mint';
	import { now } from 'src/lib/period';
	import { areStringListEqual } from 'src/lib/utils';
	import { getContext, onMount } from 'svelte';
	// New imports from wallet utils
	import { env } from '$env/dynamic/public';
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

	let alias: Alias | null = null;

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
		(k17375?.p2pkPrivKey() &&
			hexToBytes(k17375?.p2pkPrivKey() as string)) ||
		fallbackSecretKey;

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

	$: selectableMints = availableMints.filter((am) => !selectedMints.some((sm) => sm == am.url));

	// Pubkey/npub/nsec
	$: pubkey = secretKey && getPublicKey(secretKey);
	$: npub = pubkey ? nip19.npubEncode(pubkey) : '';
	$: nsec = secretKey ? nip19.nsecEncode(secretKey) : '';

	let lnurlHandle = '';

	onMount(async () => {
		availableMints = await fetchAvailableMints();
		queryAlias();
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

	function claimLNURL(handle: string) {
		const claimEvent = constructClaimEvent(
			handle,
			$key?.pub,
			selectedMints[0],
			$readRelays,
			k17375?.p2pkPubKey()
		);

		useSignEvent(claimEvent, async (signed) => {
			try {
				// Handle case where signed might be a string
				const signedEvent = typeof signed === 'string' ? JSON.parse(signed) : signed;
				const result = await postClaimEvent(signedEvent, env.PUBLIC_LNUTS_DOMAIN);
				console.log(result);
			} catch (e) {
				console.error('Failed to claim handle:', e);
				alert('Failed to claim handle. Please try again.');
			}
		});
	}

	async function queryAlias() {
		const { data: aliases } = await queryExistingClaim($key?.pub, env.PUBLIC_LNUTS_DOMAIN);
		alias = aliases?.[0] || null;
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
		if (url.startsWith('http')) {
			//force https
			url = url.replace(/^http:/, 'https:');
		} else if (!url.startsWith('https://')) {
			url = 'https://' + url;
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
		const trustedMints: EventTemplate = {
			kind: 10019,
			created_at: now(),
			content: '',
			tags: [...selectedMints.map((sm) => ['mint', sm]), ['pubkey', pubkey]]
		};

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
						<label class="text-sm opacity-80">BIP-39 mnemonic</label>
						<textarea
							class="textarea textarea-bordered w-full"
							rows="3"
							placeholder="treat dwarf wealth gasp brass outside high rent blood crowd make end"
							bind:value={inputMnemonic}
						/>
						<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
							<div class="col-span-1">
								<label class="text-sm opacity-80">Passphrase (optional)</label>
								<input
									class="input input-bordered w-full"
									type="password"
									placeholder="Optional BIP-39 passphrase"
									bind:value={inputPassphrase}
								/>
							</div>
							<div class="col-span-1">
								<label class="text-sm opacity-80">Derivation path</label>
								<input
									class="input input-bordered w-full"
									readonly
									value={`${CASHU_BASE_PATH}/${mnemonicIndex}`}
								/>
							</div>
							<div class="col-span-1">
								<label class="text-sm opacity-80">Index</label>
								<input
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
						<label class="text-sm opacity-80">Private key (hex 64 chars or nsec...)</label>
						<input
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

		<!-- Wallet Address Section -->
		<div class="bg-base-300 p-4 rounded-lg border-primary-content border space-y-3">
			<h3 class="font-semibold">Wallet Address</h3>

			<label class="text-sm opacity-80">npub (shareable)</label>
			<div class="flex items-center">
				<input type="text" readonly value={npub} class="input input-bordered w-full text-sm" />
				<button class="btn btn-square ml-2" on:click={() => navigator.clipboard.writeText(npub)}>
					<Icon icon="material-symbols:content-copy" class="w-5 h-5" />
				</button>
			</div>

			<label class="text-sm opacity-80 mt-2">nsec (private)</label>
			<div class="flex items-center">
				<input type="text" readonly value={nsec} class="input input-bordered w-full text-sm" />
				<button class="btn btn-square ml-2" on:click={() => navigator.clipboard.writeText(nsec)}>
					<Icon icon="material-symbols:content-copy" class="w-5 h-5" />
				</button>
			</div>
		</div>

		<!-- LNURL section -->
		<div class="bg-base-300 p-4 rounded-lg border-primary-content border space-y-3">
			<h3 class="font-semibold">LNURL</h3>

			<label class="text-sm opacity-80">Handle</label>
			{#if alias}
				<!-- Show existing alias -->
				<div class="flex items-center">
					<div class="join flex-grow">
						<input
							type="text"
							value={alias.alias}
							readonly
							class="input input-bordered join-item text-sm w-full bg-base-200"
						/>
						<div
							class="indicator-item px-4 flex items-center border border-primary-content rounded-r-lg bg-base-200"
						>
							@nuts.cash
						</div>
					</div>
					<button
						class="btn btn-square ml-2"
						on:click={() => navigator.clipboard.writeText(`${alias.alias}@nuts.cash`)}
					>
						<Icon icon="material-symbols:content-copy" class="w-5 h-5" />
					</button>
				</div>
			{:else}
				<!-- Show input to claim new handle -->
				<div class="flex items-center">
					<div class="join flex-grow">
						<input
							type="text"
							bind:value={lnurlHandle}
							class="input input-bordered join-item text-sm w-full"
						/>
						<div
							class="indicator-item px-4 flex items-center border border-primary-content rounded-r-lg bg-base-200"
						>
							@nuts.cash
						</div>
					</div>
					<button 
						class="btn ml-2 text-lg px-4" 
						on:click={() => claimLNURL(lnurlHandle)}
						disabled={!$key?.hasSigner}
						title={$key?.hasSigner ? 'Claim this handle' : 'You need a signer to claim a handle'}
					>
						Claim
					</button>
				</div>
			{/if}
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
							{#each filteredMints as mint}
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
					{#each selectedMints as mint}
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
												<span class={`w-2 h-2 rounded-full ${getStatusColor(mintInfo.state)}`}></span>
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
			disabled={areStringListEqual(
				selectedMints,
				fbArray(k17375, 'mints')
			)}
			on:click={() => {
				saveWallet();
			}}
		>
			Save Wallet
		</button>
	</div>
</div>
