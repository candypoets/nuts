<script lang="ts">
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import VirtualList from 'src/components/VirtualList.svelte';
	import SearchInput from 'src/components/SearchInput.svelte';
	import ModalHandle from 'src/components/ModalHandle.svelte';
	import { relayInfos, relayStatusMap, relaySubs, setSubRelays } from 'src/controller/relay';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { getContext, onDestroy } from 'svelte';

	export let subId: string = '';

	let animator: PagerAnimator = getContext('animator');
	let search = '';

	let relaysSelected = $relaySubs.get(subId)?.map(normalizeURL) || [];

	let relaysToFilter = $relaySubs.get(subId)?.map(normalizeURL) || [];

	type RelayItem = {
		url: string;
		status: string;
		info?: any;
	};

	// Derive the relays array from the stores
	$: relays = Array.from($relayStatusMap.entries()).map(([url, status]) => {
		const key = normalizeURL(url);
		const info = $relayInfos.get(key);
		return { url: key, status, info } as RelayItem;
	});
	let sorted = false;
	// Filter based on search
	$: filteredRelays = relays
		.filter((r) => {
			const name = r.info?.name ?? '';
			const desc = r.info?.description ?? '';
			const url = r.url ?? '';
			return (
				!search ||
				name.toLowerCase().includes(search.toLowerCase()) ||
				desc.toLowerCase().includes(search.toLowerCase()) ||
				url.toLowerCase().includes(search.toLowerCase())
			);
		})
		.sort((a, b) => {
			const aSelected = relaysToFilter?.includes(a.url) ? 1 : 0;
			const bSelected = relaysToFilter?.includes(b.url) ? 1 : 0;
			return bSelected - aSelected;
		});

	function relayName(r: RelayItem) {
		return r.info?.name ?? new URL(r.url.replace(/^wss?:\/\//, 'https://')).host;
	}

	const getItemId = (r: RelayItem) => r.url;

	function toggleSelected(url: string) {
		if (relaysSelected.includes(url)) {
			relaysSelected = relaysSelected.filter((u) => u !== url);
		} else {
			relaysSelected = [...relaysSelected, url];
		}
	}

	onDestroy(() => setSubRelays(subId, relaysSelected));
</script>

<div class="h-screen flex items-end" on:click={animator.goBack}>
	<div
		class="bg-base-300 bg-opacity-85 w-full !h-2/3 !min-h-fit rounded-t-2xl md:rounded-xl md:h-1/2 flex flex-col shadow-widget"
		on:click|stopPropagation
	>
		<ModalHandle />
		<!-- Header -->
		<!-- <div class="px-4 flex justify-center h-16 items-center shrink-0">
			<h2 class="text-xl font-bold">Relays</h2>
		</div> -->

		<!-- Search -->
		<div class="px-2 pb-3 mt-4 shrink-0">
			<SearchInput
				placeholder="Search relays"
				bind:value={search}
				showSearchIcon={true}
				showClearButton={true}
			/>
		</div>

		<!-- Virtualized list -->
		<div class="px-2 pb-safe flex-1 min-h-0 overflow-hidden">
			{#if filteredRelays.length > 0}
				<VirtualList
					items={filteredRelays}
					{getItemId}
					itemsPerRow={1}
					height="100%"
					itemHeight={44}
					className="w-full !max-h-none"
					let:item
					let:items
				>
					{#each items as r (r.url)}
						{@const isSelected = relaysSelected?.includes(r.url)}
						{@const nips = Array.isArray(r.info?.supported_nips) ? r.info.supported_nips : []}
						<div
							class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-base-200/60 transition-colors mb-1"
							class:bg-base-100={isSelected}
							on:click|stopPropagation={() => toggleSelected(r.url)}
						>
							<!-- Checkbox -->
							<div class="shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
								class:border-accent={isSelected}
								class:bg-accent={isSelected}
								class:border-base-300={!isSelected}
							>
								{#if isSelected}
									<Icon icon="mingcute:check-line" class="text-accent-content text-sm" />
								{/if}
							</div>

							<!-- Icon or Status dot -->
							{#if r.info?.icon}
								<img src={proxyAvatarUrl(r.info.icon)} alt="" class="w-5 h-5 rounded shrink-0 object-cover" />
							{:else}
								<div class="shrink-0 w-2 h-2 rounded-full"
									class:bg-success={r.status === 'open' || r.status === 'connected'}
									class:bg-warning={r.status === 'connecting'}
									class:bg-error={r.status === 'failed'}
									class:bg-base-300={r.status === 'close' || !r.status}
								></div>
							{/if}

							<!-- Relay name & info -->
							<div class="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
								<div class="font-medium truncate">
									{relayName(r)}
								</div>
								<!-- Description (if available) -->
								{#if r.info?.description}
									<div class="text-xs opacity-50 truncate hidden sm:block flex-1">
										{r.info.description}
									</div>
								{/if}
							</div>

							<!-- Badges -->
							<div class="flex items-center gap-1.5 shrink-0">
								<!-- Search support -->
								{#if nips.includes(50)}
									<div class="badge badge-xs badge-info" title="Search support (NIP-50)">search</div>
								{/if}
								<!-- Auth required -->
								{#if nips.includes(42)}
									<div class="badge badge-xs badge-warning" title="Auth required (NIP-42)">auth</div>
								{/if}
								<!-- NIP count -->
								{#if nips.length}
									<div class="badge badge-xs"
										class:badge-accent={isSelected}
										class:badge-ghost={!isSelected}
									>
										{nips.length}
									</div>
								{/if}
								<!-- Software -->
								{#if r.info?.software}
									{@const software = r.info.software
										.replace(/^https?:\/\/github\.com\//, '')
										.replace(/^nostr-/, '')
										.replace(/-relay$/, '')
										.replace(/\.git$/, '')}
									<div class="badge badge-xs badge-ghost hidden sm:inline-block truncate max-w-16" title={r.info.software}>
										{software}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</VirtualList>
			{:else}
				<div class="p-8 text-center opacity-70">No relays to show yet.</div>
			{/if}
		</div>
	</div>
</div>
