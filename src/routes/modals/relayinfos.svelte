<script lang="ts">
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import VirtualList from 'src/components/VirtualList.svelte';
	import { isMobile } from 'src/controller';
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
			// if (sorted) return 0;
			// sorted = true;
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
		class="bg-base-300 bg-opacity-85 backdrop-blur-md w-full !h-2/3 !min-h-fit rounded-t-2xl md:rounded-xl md:h-1/2 flex flex-col shadow-widget"
		on:click|stopPropagation
	>
		<!-- Header -->
		<div class="px-4 pt-safe flex justify-between h-16 items-center shrink-0">
			<div on:click={animator.goBack}>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</div>
			<h2 class="text-xl font-bold">Relays</h2>
			<div></div>
		</div>

		<!-- Search -->
		<div class="p-4 shrink-0">
			<div class="join bg-base-200 rounded-md w-full">
				<div class="join-item p-2">
					<Icon icon="carbon:search" />
				</div>
				<input
					placeholder="Search relays"
					bind:value={search}
					class="join-item flex-grow px-2 outline-none bg-transparent"
				/>
			</div>
		</div>

		<!-- Virtualized list -->
		<div class="px-4 pb-safe flex-1 min-h-0">
			{#if filteredRelays.length > 0}
				<VirtualList
					items={filteredRelays}
					{getItemId}
					itemsPerRow={$isMobile ? 2 : 3}
					height="100%"
					className="w-full"
					let:item
					let:items
				>
					<div
						class="grid gap-4 mb-4"
						style="grid-template-columns: repeat({$isMobile ? 2 : 3}, minmax(0, 1fr));"
					>
						{#each items as r (r.url)}
							<div
								class="bg-base-200 rounded-xl relative cursor-pointer"
								on:click|stopPropagation={(_) => toggleSelected(r.url)}
								class:border={relaysSelected?.includes(r.url)}
								class:border-accent={relaysSelected?.includes(r.url)}
							>
								<div class="card-body p-4">
									<div class="flex items-center gap-3">
										{#if r.info?.icon}
											<div class="avatar">
												<div class="w-10 h-10 rounded">
													<img src={proxyAvatarUrl(r.info.icon)} alt="Relay icon" />
												</div>
											</div>
										{:else}
											<div class="avatar placeholder">
												<div
													class="bg-base-300 text-base-content w-10 h-10 rounded flex items-center justify-center"
												>
													<Icon icon="mingcute:server-line" class="text-lg" />
												</div>
											</div>
										{/if}
										<div class="min-w-0">
											<div class="font-semibold truncate">
												{relayName(r)}
											</div>
											<div class="text-xs opacity-70 truncate">{r.url}</div>
										</div>
										<div class="ml-auto absolute left-2 top-2">
											{#if r.status === 'open' || r.status === 'connected'}
												<Icon icon="mingcute:check-circle-fill" class="text-success" />
											{:else if r.status === 'connecting'}
												<Icon icon="mingcute:time-line" class="text-warning" />
											{:else if r.status === 'close'}
												<Icon icon="codicon:debug-disconnect" />
											{:else if r.status === 'failed'}
												<Icon icon="icon-park-solid:applet-closed" class="text-red-500" />
											{/if}
										</div>
									</div>
									{#if r.info?.description}
										<p class="text-sm mt-2 line-clamp-3">{r.info.description}</p>
									{/if}
									<div class="mt-2 flex flex-wrap gap-2 text-xs opacity-70">
										{#if r.info?.software}<span>SW: {r.info.software}</span>{/if}
										{#if r.info?.version}<span>v{r.info.version}</span>{/if}
										{#if r.info?.supported_nips?.length}
											<span
												>NIPs: {r.info.supported_nips.slice(0, 6).join(', ')}{r.info.supported_nips
													.length > 6
													? '…'
													: ''}</span
											>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				</VirtualList>
			{:else}
				<div class="p-8 text-center opacity-70">No relays to show yet.</div>
			{/if}
		</div>
	</div>
</div>
—
