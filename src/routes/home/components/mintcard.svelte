<script lang="ts">
	import Icon from '@iconify/svelte';
	import { nutsWallet } from 'src/controller/proofs';
	import { activeMintUrl, fetchMintData } from 'src/controller/wallet';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import { go } from 'src/routes/modals/modal';
	import { get } from 'svelte/store';
	import { proxyAvatarUrl } from 'src/lib/proxy';

	export let mintUrl: string | null;
	export let size = 'lg';
	export let navigate = false;
	export let showBalance = true;

	export let pubkey: string = undefined;

	function generateColorFromUrl(url: string, opacity: number = 1): string {
		// Create a simple hash from the url
		let hash = 0;
		for (let i = 0; i < url.length; i++) {
			hash = (hash << 5) - hash + url.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}

		// Generate HSL components with constraints to ensure dark colors and avoid reds
		// Map hash to a range that excludes reds (approx. 0-15 and 340-360 degrees)
		// Target range: [20, 340] (size 320)
		const h_base = Math.abs(hash % 320); // Value in [0, 319]
		const h = h_base + 20; // Shifted hue in [20, 339], avoiding reds

		const s = 65 + Math.abs((hash >> 8) % 25); // Saturation 65-90%
		const l = 15 + Math.abs((hash >> 16) % 15); // Lightness 15-30% for darker colors

		return `hsla(${h}, ${s}%, ${l}%, ${opacity})`;
	}

	function goto(e: MouseEvent) {
		if (!navigate) return;
		e.stopPropagation();
		$activeMintUrl = mintUrl;
		go('minting');
	}

	$: balanceByMint = $nutsWallet?.balanceByMint;
</script>

{#if mintUrl}
	<div
		class="max-w-md mx-auto shrink-0 snap-always relative min-h-14"
		class:w-72={size == 'lg'}
		class:w-32={size == 'sm'}
		class:w-40={size == 'sm'}
		class:cursor-pointer={navigate}
		on:click={goto}
	>
		{#if pubkey}
			<span class="-top-2 absolute -left-2 z-10">
				<Avatar {pubkey} {size} />
			</span>
		{/if}
		{#await fetchMintData(mintUrl) then mint}
			<div
				class="rounded-xl shadow-lg p-4 text-white relative overflow-hidden"
				style="background-image: linear-gradient(to left, {generateColorFromUrl(
					mint.name,
					0.5
				)}, {generateColorFromUrl(mint.name, 0.8)});"
			>
				<!-- Credit card chip design -->
				<div class="flex gap-2 items-start justify-between" class:!items-center={size == 'xs'}>
					<h2 class="font-bold tracking-wider -mt-1 flex gap-1">
						{#if mint?.parsedInfo?.icon_url}
							<img
								src={proxyAvatarUrl(mint.parsedInfo.icon_url)}
								alt="Mint Icon"
								class="w-6 h-6"
								on:error={(e) => (e.target.style.display = 'none')}
							/>
						{/if}
						{mint.name ? mint.name.replace(/mint/gi, '').replace(/cashu/gi, '') : 'Unknown Mint'}
					</h2>

					<div
						class="w-3 h-3 rounded-full relative overflow-hidden"
						class:bg-green-500={mint.state == 'OK'}
						class:bg-red-500={mint.state == 'ERROR'}
						class:bg-yellow-500={!mint.state}
					>
						<div class="absolute inset-0 bg-white opacity-50 animate-pulse"></div>
					</div>
				</div>
				{#if showBalance && size != 'lg'}
					<p class="text-sm text-left">{$balanceByMint?.[mintUrl] || 0} sats</p>
				{/if}
				{#if size == 'lg'}
					{@const errorRatio =
						mint?.n_errors && mint?.n_mints
							? (mint.n_errors / (mint.n_mints + mint.n_melts)).toFixed(2)
							: 'N/A'}
					<!-- Mint details -->
					<div class="mt-2">
						<!-- Stats cards with improved layout -->
						<div class="flex flex-wrap justify-between gap-2">
							<div
								class="bg-gray-700/30 rounded-lg p-3 flex-1 backdrop-blur-sm"
								class:hidden={!showBalance}
							>
								<!-- <p class="text-xs uppercase text-indigo-200 font-semibold">Balance</p> -->
								<p class="font-mono text-xl mt-1 flex items-center">
									{$balanceByMint?.[mintUrl] || 0 || '0'}
									<Icon icon="bitcoin-icons:satoshi-v2-filled" class="text-xl" />
								</p>
							</div>

							<div class="bg-gray-700/30 rounded-lg p-3 flex-1 backdrop-blur-sm">
								<p class="text-xs uppercase text-indigo-200 font-semibold">Health</p>
								<div class="mt-2 relative h-6 w-full bg-gray-200 rounded-full">
									{#if errorRatio !== 'N/A'}
										{@const ratio = parseFloat(errorRatio)}
										{@const percentage = Math.min((1 - ratio) * 100, 100)}
										{@const colorClass =
											ratio < 0.02 ? 'bg-green-500' : ratio < 0.05 ? 'bg-yellow-500' : 'bg-red-500'}
										<div
											class="absolute top-0 left-0 h-full rounded-full {colorClass} flex items-center justify-center"
											style="width: {percentage}%"
										>
											<span class="text-xs font-bold text-white px-1">{percentage}%</span>
										</div>
									{:else}
										<div class="h-full w-full flex items-center justify-center text-gray-500">
											N/A
										</div>
									{/if}
								</div>
							</div>

							<!-- <div class="bg-indigo-700/30 rounded-lg p-3 flex-1 backdrop-blur-sm">
						<p class="text-xs uppercase text-indigo-200 font-semibold">Errors/Mints</p>
						<p class="font-mono text-xl mt-1">{mint.n_errors || 0}/{mint.n_mints || 0}</p>
					</div> -->

							<!-- <div class="bg-indigo-700/30 rounded-lg p-3 flex-1 backdrop-blur-sm">
						<p class="text-xs uppercase text-indigo-200 font-semibold">Ratio</p>
						<p class="font-mono text-xl mt-1">{errorRatio}</p>
					</div> -->
						</div>
					</div>
				{/if}

				<!-- Credit card-like pattern -->
				<!-- Dynamic pattern based on mint name -->
				<div class="absolute bottom-0 right-0 opacity-10">
					{#if mint.name}
						{@const hash = Array.from(mint.name).reduce((acc, char) => acc + char.charCodeAt(0), 0)}
						{@const hue = hash % 360}
						{@const pattern = hash % 4}

						{#if pattern === 0}
							<div
								class="w-64 h-24 border-2"
								style="border-color: hsl({hue}, 70%, 80%); border-radius: 9999px; margin-bottom: -4rem; margin-right: -4rem;"
							></div>
							<div
								class="w-44 h-44 border-2 absolute bottom-0 right-0"
								style="border-color: hsl({hue +
									40}, 70%, 80%); border-radius: 9999px; margin-bottom: -6rem; margin-right: -3rem;"
							></div>
						{:else if pattern === 1}
							<div
								class="w-48 h-48 rotate-45 border-2"
								style="border-color: hsl({hue}, 70%, 80%); margin-bottom: -5rem; margin-right: -5rem;"
							></div>
							<div
								class="w-32 h-32 rotate-45 border-2 absolute bottom-0 right-0"
								style="border-color: hsl({hue +
									60}, 70%, 80%); margin-bottom: -4rem; margin-right: -2rem;"
							></div>
						{:else if pattern === 2}
							<div
								class="w-60 h-60 border-2"
								style="border-color: hsl({hue}, 70%, 80%); clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); margin-bottom: -8rem; margin-right: -4rem;"
							></div>
							<div
								class="w-40 h-40 border-2 absolute bottom-0 right-0"
								style="border-color: hsl({hue +
									20}, 70%, 80%); clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); margin-bottom: -5rem; margin-right: -3rem;"
							></div>
						{:else}
							<div
								class="w-64 h-32 border-2"
								style="border-color: hsl({hue}, 70%, 80%); border-radius: 30%; margin-bottom: -4rem; margin-right: -4rem;"
							></div>
							<div
								class="w-32 h-64 border-2 absolute bottom-0 right-0"
								style="border-color: hsl({hue +
									80}, 70%, 80%); border-radius: 30%; margin-bottom: -8rem; margin-right: -2rem;"
							></div>
						{/if}
					{/if}
				</div>
			</div>
		{/await}
	</div>
{/if}
