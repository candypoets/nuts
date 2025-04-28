<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { normalizeURL } from 'nostr-tools/utils';
	import { isMintUrlValid } from 'src/actions/mint';
	import { kind17375 } from 'src/controller/nostr';
	import { onMount } from 'svelte';
	import { generateSecretKey, getPublicKey, type EventTemplate } from 'nostr-tools';
	import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
	import { now } from 'src/lib/period';
	import { nostrManager, type RelayStatus } from 'src/wasm/manager';

	let newMintUrl = '';
	let loading = false;
	let isInvalid = false;
	let searchFocused = false;
	let filteredMints: MintInfo[] = [];

	let newMints: string[] = [];
	let availableMints: MintInfo[] = []; // Initialize as empty array
	let selectedMints = $kind17375?.parsed?.mints || [];

	$: selectableMints = availableMints.filter((am) => !selectedMints.some((sm) => sm == am.url));

	let secretKey =
		($kind17375?.parsed?.p2pkPrivKey && hexToBytes($kind17375?.parsed?.p2pkPrivKey)) ||
		generateSecretKey();

	let pubkey = getPublicKey(secretKey);

	interface MintInfo {
		title: string;
		url: string;
		description: string;
		publishDate: Date;
		iconUrl: string | null;
		state: string;
		rating: number; // Lower is better (errors per operation)
		n_mints?: number;
		n_melts?: number;
		n_errors?: number;
	}

	onMount(async () => {
		await fetchAvailableMints();
	});

	async function fetchAvailableMints() {
		try {
			const response = await fetch('https://api.audit.8333.space/mints/');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const jsonData = await response.json();

			availableMints = jsonData.map((mintData: any) => {
				let description = '';
				let title = mintData.name || 'Unknown Mint';
				let iconUrl = null;

				try {
					if (mintData.info) {
						const infoObj = JSON.parse(mintData.info);
						description = infoObj.description || '';
						if (infoObj.name) {
							title = infoObj.name;
						}
						if (infoObj.icon_url) {
							iconUrl = infoObj.icon_url;
						}
					}
				} catch (e) {
					console.error('Error parsing mint info JSON for ' + mintData.url + ':', e);
				}

				const operations = (mintData.n_mints || 0) + (mintData.n_melts || 0);
				let rating = 1; // Default bad rating (high error rate)
				if (operations > 0) {
					rating = (mintData.n_errors || 0) / operations;
				} else if ((mintData.n_errors || 0) === 0) {
					rating = 0; // Perfect rating if no errors and no ops
				}

				return {
					title: title,
					url: normalizeURL(mintData.url),
					description: description,
					publishDate: new Date(mintData.updated_at || 0), // Add fallback for missing date
					iconUrl: iconUrl,
					state: mintData.state || 'UNKNOWN',
					rating: rating,
					n_mints: mintData.n_mints || 0,
					n_melts: mintData.n_melts || 0,
					n_errors: mintData.n_errors || 0
				};
			});

			// First sort by state (OK first), then by rating (lower is better)
			availableMints.sort((a, b) => {
				// Sort OK state first
				if (a.state === 'OK' && b.state !== 'OK') return -1;
				if (a.state !== 'OK' && b.state === 'OK') return 1;
				// Then sort by rating (lower score is better)
				return a.rating - b.rating;
			});
		} catch (error) {
			console.error('Error fetching or parsing mints:', error);
			availableMints = [];
		}
	}

	function filterMints() {
		if (!newMintUrl.trim()) {
			filteredMints = [];
			return;
		}

		const searchTerm = newMintUrl.toLowerCase();
		filteredMints = selectableMints.filter(
			(mint) =>
				mint.title.toLowerCase().includes(searchTerm) ||
				mint.url.toLowerCase().includes(searchTerm) ||
				mint.description.toLowerCase().includes(searchTerm)
		);
	}

	async function addMint() {
		loading = true;
		const isValid = await isMintUrlValid(newMintUrl);
		loading = false;
		isInvalid = !isValid;
		if (isValid) {
			selectedMints.unshift(newMintUrl);
			selectedMints = _.uniq(selectedMints);
			newMintUrl = '';
		}
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
		selectedMints = _.uniq(selectedMints);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && filteredMints.length > 0) {
			newMintUrl = filteredMints[0].url;
			filteredMints = [];
			addMint();
		}
	}

	// Helper function for status color
	function getStatusColor(state: string): string {
		switch (state) {
			case 'OK':
				return 'bg-success';
			case 'ERROR':
				return 'bg-error';
			default:
				return 'bg-warning'; // UNKNOWN or other states
		}
	}

	// Helper function for rating display (e.g., stars)
	function getRatingDisplay(rating: number): string {
		if (rating === 0) return '★★★★★'; // Perfect
		if (rating < 0.01) return '★★★★☆'; // Very Good
		if (rating < 0.05) return '★★★☆☆'; // Good
		if (rating < 0.1) return '★★☆☆☆'; // Fair
		return '★☆☆☆☆'; // Poor
	}

	// Get stats text for mint
	function getStatsText(mint: MintInfo): string {
		const operations = (mint.n_mints || 0) + (mint.n_melts || 0);
		if (operations === 0) return 'No operations';
		return `${operations} ops, ${mint.n_errors || 0} errors`;
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

		nostrManager.publish('newWallet', newWallet, (relayStatus: RelayStatus) =>
			console.log('newWallet', relayStatus)
		);
		nostrManager.publish('trustedMints', trustedMints, (relayStatus: RelayStatus) =>
			console.log('trustedMints', relayStatus)
		);
	}
</script>

<div class="h-full bg-basic pt-4">
	<div class="flex justify-between mb-12 px-4">
		<button class="w-1/4" aria-label="Return to previous screen">
			<Icon icon="iconamoon:arrow-down-2-light" class="w-6 h-6" />
		</button>
		<h2 class="font-bold text-xl">eCash Wallet</h2>
		<div class="w-1/4"></div>
	</div>

	<div class="space-y-6 px-4">
		<!-- Wallet Address Section -->
		<div class="bg-base-200 p-4 rounded-lg">
			<h3 class="font-semibold mb-2">Wallet Address</h3>
			<div class="flex items-center">
				<input type="text" readonly value={pubkey} class="input input-bordered w-full text-sm" />
				<button
					class="btn btn-square ml-2"
					on:click={() => navigator.clipboard.writeText('ecash:walletpublicaddress123456789')}
				>
					<Icon icon="material-symbols:content-copy" class="w-5 h-5" />
				</button>
			</div>
			<button
				class="btn btn-sm btn-outline mt-3"
				on:click={() => navigator.clipboard.writeText('privatekey123456789')}
			>
				Copy Private Key
				<Icon icon="material-symbols:key" class="w-4 h-4 ml-1" />
			</button>
		</div>

		<!-- Mint Selection Section -->
		<div class="bg-base-200 p-4 rounded-lg">
			<h3 class="font-semibold mb-3">Available Mints</h3>

			<div class="relative w-full mb-4">
				<div class="join w-full">
					<input
						class="w-full join-item px-2"
						type="text"
						bind:value={newMintUrl}
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
						<button class="btn join-item" on:click={() => addMint()}>Add</button>
					{/if}
				</div>

				{#if searchFocused && filteredMints.length > 0}
					<div
						class="absolute w-full mt-1 bg-base-100 shadow-lg rounded-md z-10 max-h-60 overflow-y-auto"
					>
						{#each filteredMints as mint}
							<button
								class="w-full text-left p-3 hover:bg-base-300 cursor-pointer border-b flex items-center"
								on:click={() => {
									selectMint(mint);
									addMint();
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

			<!-- Suggested Mints -->
			{#if !searchFocused && selectableMints.length > 0 && !newMintUrl}
				<div class="mb-4">
					<h4 class="text-sm font-medium mb-2">Suggested Mints</h4>
					<div class="max-h-40 overflow-y-auto">
						{#each selectableMints.slice(0, 5) as mint}
							<button
								class="w-full text-left p-3 hover:bg-base-300 cursor-pointer border-b flex justify-between items-center"
								on:click={() => {
									selectMint(mint);
									// addMint();
								}}
							>
								<div class="flex items-start space-x-2 flex-1 min-w-0">
									{#if mint.iconUrl}
										<img
											src={mint.iconUrl}
											alt="Mint icon"
											class="w-6 h-6 rounded-full flex-shrink-0"
										/>
									{:else}
										<div class="w-6 h-6 rounded-full bg-gray-300 flex-shrink-0"></div>
									{/if}
									<div class="flex-1 min-w-0">
										<div class="font-medium truncate flex items-center gap-4">
											<span>{mint.title}</span>
											<span>{getRatingDisplay(mint.rating)}</span>
										</div>
										<div class="text-xs truncate opacity-70">{mint.url}</div>
										<div class="text-xs mt-1">
											<div class="flex items-center gap-2">
												<span class={`w-2 h-2 rounded-full ${getStatusColor(mint.state)}`}></span>
												<span class="opacity-70">{getStatsText(mint)}</span>
											</div>
										</div>
									</div>
								</div>
								<span class="btn btn-sm btn-ghost flex-shrink-0 ml-2">
									<Icon icon="material-symbols:add" class="w-4 h-4" />
								</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<h4 class="text-sm font-medium mb-2">Your Mints</h4>
			<div class="max-h-60 overflow-y-auto">
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
										src={mintInfo.iconUrl}
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
										<span class="text-primary font-semibold">
											{mint['balance'] ? mint['balance'] : '0.00'} sats
										</span>
									</div>
								</div>
							</div>
						{:else}
							<div class="flex items-center space-x-2 flex-1 min-w-0">
								<div class="w-6 h-6 rounded-full bg-gray-300 flex-shrink-0"></div>
								<div class="flex-1 min-w-0">
									<div class="font-medium truncate">{nurl}</div>
									<div class="text-xs mt-1">
										<span class="text-primary font-semibold">
											{mint['balance'] ? mint['balance'] : '0.00'} sats
										</span>
									</div>
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
			class="btn btn-primary w-full"
			disabled={!selectedMints.length}
			on:click={() => {
				saveWallet();
				// You could add a success toast or redirect here
			}}
		>
			Save Wallet
			<!-- <Icon icon="material-symbols:save" class="w-5 h-5 ml-2" /> -->
		</button>
	</div>
</div>
