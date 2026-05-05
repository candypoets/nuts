<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	// Props
	export let onGifSelect = (gif: any) => {}; // Callback for when a GIF is selected
	export let apiKey = 'AIzaSyB692q5nvoGphnMusHRvm1D_98a-DSQJRA'; // Tenor API key
	export let limit = 20;
	export let show = false;
	export let position = 'bottom'; // 'bottom' or 'top'
	export let searchOnFocus = true; // Whether to start search when input is focused

	// State
	let gifs: any[] = [];
	let trendingGifs: any[] = [];
	let searchTerm = '';
	let isLoading = false;
	let searchInput: HTMLInputElement;

	async function fetchTenorGifs(endpoint: string, params: Record<string, string | number>) {
		const searchParams = new URLSearchParams({
			key: apiKey,
			limit: String(limit),
			...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]))
		});
		const response = await fetch(`https://tenor.googleapis.com/v2/${endpoint}?${searchParams}`);

		if (!response.ok) {
			throw new Error(`Tenor request failed with status ${response.status}`);
		}

		return response.json();
	}

	onMount(() => {
		fetchTrendingGifs();
		if (searchInput && searchOnFocus) {
			searchInput.focus();
		}
	});

	async function fetchTrendingGifs() {
		if (trendingGifs.length > 0) return; // Don't fetch if we already have them

		isLoading = true;
		try {
			const data = await fetchTenorGifs('featured', {});
			trendingGifs = data.results;
			gifs = trendingGifs;
		} catch (error) {
			console.error('Error loading trending GIFs:', error);
		} finally {
			isLoading = false;
		}
	}

	async function searchGifs() {
		if (!searchTerm.trim()) {
			gifs = trendingGifs;
			return;
		}

		isLoading = true;
		try {
			const data = await fetchTenorGifs('search', { q: searchTerm });
			gifs = data.results;
		} catch (error) {
			console.error('Error searching GIFs:', error);
		} finally {
			isLoading = false;
		}
	}

	function handleSelect(gif: any) {
		// Call the provided callback with the selected GIF
		onGifSelect(gif);
	}
	let searchTimeout: NodeJS.Timeout;
	// Handle Enter key in search input
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			searchGifs();
		} else {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => searchGifs(), 1000);
		}
	}

	function toggleGifPicker() {
		show = !show;

		// Focus the editor after toggling
		// focusEditor();
	}
</script>

{#if show}
	<div
		class="bg-opacity-85 bg-base-100 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg"
		transition:fly={{ y: -10, duration: 150 }}
	>
		<div class="p-2 overflow-scroll h-[300px]">
			{#if isLoading}
				<div class="flex justify-center items-center py-8">
					<div
						class="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"
					></div>
				</div>
			{:else if gifs.length === 0}
				<div class="flex justify-center items-center py-8 text-gray-500 dark:text-gray-400 text-sm">
					No GIFs found
				</div>
			{:else}
				<div class="grid md:grid-cols-5 grid-cols-2 gap-2">
					{#each gifs as gif}
						<button
							class="overflow-hidden rounded aspect-[4/3] bg-gray-100 dark:bg-gray-700 hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700 transition"
							on:click={() => handleSelect(gif)}
						>
							<img
								src={gif.media_formats.tinygif.url}
								alt={gif.content_description || 'GIF'}
								class="w-full h-full object-cover"
								loading="lazy"
							/>
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<div class="p-2 border-b border-gray-200 dark:border-gray-700">
			<div class="relative">
				<input
					type="text"
					bind:value={searchTerm}
					bind:this={searchInput}
					placeholder="Search GIFs..."
					class="w-full p-2 pl-8 pr-8 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 transition"
					on:keydown={handleKeydown}
				/>
				<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
					<Icon icon="carbon:search" class="w-4 h-4 text-gray-400" />
				</div>
				<button
					class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
					on:click={searchGifs}
					aria-label="Search GIFs"
				>
					<Icon icon="carbon:arrow-right" class="w-4 h-4" />
				</button>
			</div>
		</div>
	</div>
	<!-- <div class="fixed inset-0 z-10" on:click={() => (show = false)}></div> -->
{/if}
