<script lang="ts">
	import { normalizeURL } from 'nostr-tools/utils';
	import type { Kind7375Parsed } from 'src/parsers';
	import type { Mint } from 'src/parsers/mint';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onMount } from 'svelte';

	export let mint: string;
	export let kind7375: ParsedEvent<Kind7375Parsed>;

	let mintData: Mint | null = null;
	let loading = true;
	let error: string | null = null;

	$: balance = (kind7375?.parsed?.proofs || []).reduce((acc, p) => (acc += p.amount), 0);

	onMount(async () => {
		try {
			loading = true;
			const response = await fetch(
				`https://api.audit.8333.space/mints/url/?url=${normalizeURL(mint).replace(/\/$/, '')}`
			);
			if (!response.ok) {
				throw new Error('Failed to fetch mint data');
			}
			mintData = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error occurred';
			mintData = {
				name: mint
			};
		} finally {
			loading = false;
		}
	});

	$: errorRatio =
		mintData?.n_errors && mintData?.n_mints
			? (mintData.n_errors / (mintData.n_mints + mintData.n_melts)).toFixed(2)
			: 'N/A';

	function generateColorFromUrl(url: string, opacity: number = 1): string {
		// Create a simple hash from the url
		let hash = 0;
		for (let i = 0; i < url.length; i++) {
			hash = (hash << 5) - hash + url.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}

		// Generate HSL components with constraints to ensure dark colors
		const h = Math.abs(hash % 360); // Hue 0-359
		const s = 65 + Math.abs((hash >> 8) % 25); // Saturation 65-90%
		const l = 15 + Math.abs((hash >> 16) % 15); // Lightness 15-30% for darker colors

		return `hsla(${h}, ${s}%, ${l}%, ${opacity})`;
	}
</script>

<div class="w-72 max-w-md mx-auto shrink-0 snap-always">
	{#if loading}
		<div class="p-6 h-full bg-gray-100 rounded-lg shadow-md animate-pulse">
			<div class="h-4 bg-gray-300 rounded w-3/4 mb-4"></div>
			<div class="h-4 bg-gray-300 rounded w-1/2"></div>
		</div>
	{:else if mintData}
		<div
			class="rounded-xl shadow-lg p-4 text-white relative overflow-hidden"
			style="background-image: linear-gradient(to left, {generateColorFromUrl(
				mint,
				0.5
			)}, {generateColorFromUrl(mint, 0.8)});"
		>
			<!-- Credit card chip design -->
			<div class="flex gap-2 items-start justify-between">
				<h2 class="font-bold tracking-wider -mt-1">
					{mintData.name
						? mintData.name.replace(/mint/gi, '').replace(/cashu/gi, '')
						: 'Unknown Mint'}
				</h2>
				<div
					class="w-3 h-3 rounded-full relative overflow-hidden"
					class:bg-green-500={mintData.state == 'OK'}
					class:bg-red-500={mintData.state == 'ERROR'}
					class:bg-yellow-500={!mintData.state}
				>
					<div class="absolute inset-0 bg-white opacity-50 animate-pulse"></div>
				</div>
			</div>

			<!-- Mint details -->
			<div class="mt-2">
				<!-- Stats cards with improved layout -->
				<div class="flex flex-wrap justify-between gap-2">
					<div class="bg-gray-700/30 rounded-lg p-3 flex-1 backdrop-blur-sm">
						<p class="text-xs uppercase text-indigo-200 font-semibold">Balance</p>
						<p class="font-mono text-xl mt-1">{balance || '0'}</p>
					</div>

					<div class="bg-gray-700/30 rounded-lg p-3 flex-1 backdrop-blur-sm">
						<p class="text-xs uppercase text-indigo-200 font-semibold">Success</p>
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
								<div class="h-full w-full flex items-center justify-center text-gray-500">N/A</div>
							{/if}
						</div>
					</div>

					<!-- <div class="bg-indigo-700/30 rounded-lg p-3 flex-1 backdrop-blur-sm">
						<p class="text-xs uppercase text-indigo-200 font-semibold">Errors/Mints</p>
						<p class="font-mono text-xl mt-1">{mintData.n_errors || 0}/{mintData.n_mints || 0}</p>
					</div> -->

					<!-- <div class="bg-indigo-700/30 rounded-lg p-3 flex-1 backdrop-blur-sm">
						<p class="text-xs uppercase text-indigo-200 font-semibold">Ratio</p>
						<p class="font-mono text-xl mt-1">{errorRatio}</p>
					</div> -->
				</div>
			</div>

			<!-- Credit card-like pattern -->
			<!-- Dynamic pattern based on mint name -->
			<div class="absolute bottom-0 right-0 opacity-10">
				{#if mintData.name}
					{@const hash = Array.from(mintData.name).reduce(
						(acc, char) => acc + char.charCodeAt(0),
						0
					)}
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
	{:else}
		<div class="p-4 bg-yellow-100 text-yellow-700 rounded-lg">
			<p>No mint data available</p>
		</div>
	{/if}
</div>
