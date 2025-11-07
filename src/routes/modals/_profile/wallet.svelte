<script lang="ts">
	import { ConnectionStatus, Kind17375Parsed } from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
	import { generateMnemonic, validateMnemonic } from '@scure/bip39';
	import { wordlist } from '@scure/bip39/wordlists/english';
	import { uniq } from 'lodash';
	import { generateSecretKey, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import { getContext, onMount } from 'svelte';

	import { usePublish } from '@candypoets/nipworker/hooks';
	import { asKind17375, fbArray, isConnectionStatus } from '@candypoets/nipworker/utils';
	import { kind17375 } from 'src/controller/nostr';
	import { isMintUrlValid } from 'src/lib/mint';
	import { now } from 'src/lib/period';
	import { areStringListEqual } from 'src/lib/utils';
	// New imports from wallet utils
	import { walletMnemonic, walletMnemonicIndex, walletPassphrase } from 'src/controller';
	import { nutsWallet, setNutsWallet } from 'src/controller/proofs';
	import { updateSendStatus } from 'src/controller/sendStatus';
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
	import { DEFAULT_RELAYS } from 'src/lib/env';

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
		(k17375?.p2pkPrivKey()?.toString() &&
			hexToBytes(k17375?.p2pkPrivKey()?.toString() as string)) ||
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

	let newMints: string[] = [];
	let availableMints: MintInfo[] = []; // Initialize as empty array

	$: selectableMints = availableMints.filter((am) => !selectedMints.some((sm) => sm == am.url));

	// Mints from existing event (if any)
	$: mints = fbArray(k17375 as Kind17375Parsed, 'mints').map((m) => m.toString());
	// Preselect defaults (Minibits, Coinos) if no saved mints
	$: selectedMints = mints && mints.length > 0 ? mints : DEFAULT_MINTS.slice();

	// Pubkey/npub/nsec
	$: pubkey = secretKey && getPublicKey(secretKey);
	$: npub = pubkey ? nip19.npubEncode(pubkey) : '';
	$: nsec = secretKey ? nip19.nsecEncode(secretKey) : '';

	onMount(async () => {
		availableMints = await fetchAvailableMints();
	});

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

	async function addMint(newMint: string) {
		loading = true;
		// const isValid = await isMintUrlValid(newMintUrl);
		loading = false;
		// isInvalid = !isValid;
		// if (isValid) {
		selectedMints.unshift(newMint);
		selectedMints = uniq(selectedMints);
		// }
	}

	function removeMint(url: string) {
		selectedMints = selectedMints.filter((sm) => sm != url);
	}

	async function selectMint(mint: MintInfo) {
		// newMintUrl = mint.url;
		loading = true;
		const isValid = await isMintUrlValid(mint.url);
		loading = false;
		selectedMints.unshift(mint.url);
		selectedMints = uniq(selectedMints);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && filteredMints.length > 0) {
			filteredMints = [];
			addMint(filteredMints[0].url);
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
					const relayUrl = status.relayUrl()?.toString();
					if (relayUrl) {
						sendStatus[relayUrl] = status;
						updateSendStatus('newWallet_' + pubkey, sendStatus);
					}
					console.log('relayUrl', relayUrl);
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

	// $: console.log('selectedMints', selectedMints);
</script>

<div
	class="h-screen bg-base-300 bg-opacity-85 backdrop-blur-md pt-4 overflow-scroll"
	on:touchmove|stopPropagation
>
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

		<!-- Mint Selection Section -->
		<div class="bg-base-300 border-primary-content border p-4 rounded-lg">
			<h3 class="font-semibold mb-3">Mints</h3>

			<div class="relative w-full mb-4">
				<div class="join w-full border">
					<input
						class="w-full join-item px-2"
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
						placeholder="Search available mints or enter URL"
					/>
					{#if loading}
						<button class="btn join-item"><span class="loading loading-dots"></span></button>
					{:else}
						<button class="btn join-item">Add</button>
					{/if}
				</div>

				{#if searchFocused && filteredMints.length > 0}
					<div
						class="absolute w-full mt-1 bg-base-100 shadow-lg rounded-md z-10 max-h-60 overflow-y-auto"
					>
						{#each filteredMints as mint}
							<button
								class="w-full text-left p-3 hover:bg-base-300 cursor-pointer border-b border-primary-content flex items-center"
								on:click={() => {
									selectMint(mint);
								}}
							>
								<div class="flex items-start space-x-2 flex-1 min-w-0">
									{#if mint.iconUrl}
										<img
											src={mint.iconUrl}
											alt="Mint icon"
											class="w-6 h-6 rounded-full flex-shrink-0"
											on:error={() => {
												const img = document.activeElement;
												if (img instanceof HTMLImageElement) img.style.display = 'none';
											}}
										/>
									{:else}
										<div class="w-6 h-6 rounded-full bg-gray-300 flex-shrink-0"></div>
									{/if}
									<div class="flex-1 min-w-0">
										<div class="font-medium truncate">{mint.title}</div>
										<div class="text-xs truncate opacity-70">{mint.url}</div>
										<div class="text-xs opacity-50 truncate">{mint.description}</div>
										<div class="flex items-center justify-between text-xs mt-1">
											<div class="flex items-center gap-2">
												<span class={`w-2 h-2 rounded-full ${getStatusColor(mint.state)}`}></span>
												<span class="opacity-70">{getStatsText(mint)}</span>
											</div>
											<span>{getRatingDisplay(mint.rating)}</span>
										</div>
									</div>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if isInvalid}
				<div class="text-error text-sm mb-2">Invalid mint URL. Please enter a valid URL.</div>
			{/if}

			<h4 class="text-sm font-medium mb-2">Your Mints</h4>
			<div class="">
				{#each selectedMints as mint}
					{@const nurl = normalizeURL(mint)}
					{@const mintInfo = availableMints.find((m) => m.url === nurl)}
					<div
						class="flex justify-between items-center border-b last:border-none p-3 hover:bg-base-300 cursor-pointer"
					>
						{#if mintInfo}
							<div class="flex items-start space-x-2 flex-1 min-w-0">
								{#if mintInfo?.iconUrl}
									<img
										src={proxyAvatarUrl(mintInfo.iconUrl)}
										alt="Mint icon"
										class="w-6 h-6 rounded-full flex-shrink-0"
									/>
								{:else}
									<div class="w-6 h-6 rounded-full bg-gray-300 flex-shrink-0"></div>
								{/if}
								<div class="flex-1 min-w-0">
									<div class="font-medium truncate">{mintInfo?.title || nurl}</div>
									<div class="text-xs truncate opacity-70">{nurl}</div>
									<div class="flex items-center gap-4 text-xs mt-1">
										<div class="flex items-center gap-2">
											<span
												class={`w-2 h-2 rounded-full ${
													mintInfo && getStatusColor(mintInfo?.state)
												}`}
											></span>
											{#if mintInfo}
												<span class="opacity-70">{getStatsText(mintInfo)}</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
						{:else}
							<div class="flex items-center space-x-2 flex-1 min-w-0">
								<div class="w-6 h-6 rounded-full bg-gray-300 flex-shrink-0"></div>
								<div class="flex-1 min-w-0">
									<div class="font-medium truncate">{nurl}</div>
									<div class="text-xs mt-1"></div>
								</div>
							</div>
						{/if}
						<input
							type="radio"
							class="radio radio-primary"
							checked
							on:click={() => removeMint(nurl)}
						/>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<div class="flex justify-center mt-6 px-4 mb-8">
		<button
			class="btn btn-primary w-full text-white"
			disabled={areStringListEqual(
				selectedMints,
				fbArray(k17375, 'mints').map((m) => m.toString())
			)}
			on:click={() => {
				saveWallet();
			}}
		>
			Save Wallet
		</button>
	</div>
</div>
