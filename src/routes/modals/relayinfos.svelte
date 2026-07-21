<script lang="ts">
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import VirtualList from 'src/components/VirtualList.svelte';
	import SearchInput from 'src/components/SearchInput.svelte';
	import ModalHandle from 'src/components/ModalHandle.svelte';
	import {
		fetchRelayInfo,
		relayInfos,
		relayStatusMap,
		relaySubs,
		setSubRelays
	} from 'src/controller/relay';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { getContext, onDestroy, onMount } from 'svelte';

	export let subId: string = '';

	let animator: PagerAnimator = getContext('animator');
	let search = '';
	let viewport: HTMLElement;

	let relaysSelected = $relaySubs.get(subId)?.map(normalizeURL) || [];

	let relaysToFilter = $relaySubs.get(subId)?.map(normalizeURL) || [];

	type RelayItem = {
		url: string;
		status: string;
		info?: any;
	};

	// Derive the relays array from the stores
	$: relays = Array.from(
		new Set([...Array.from($relayStatusMap.keys()), ...relaysToFilter].map(normalizeURL))
	).map((url) => {
		const key = normalizeURL(url);
		const info = $relayInfos.get(key);
		return { url: key, status: $relayStatusMap.get(key) || '', info } as RelayItem;
	});
	onMount(() => {
		relaysToFilter.forEach((relay) => void fetchRelayInfo(relay));
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

	function relayLabel(url: string) {
		return normalizeURL(url)
			.replace(/^wss?:\/\//, '')
			.replace(/\/$/, '');
	}

	function relayInitials(name: string) {
		const words = name
			.replace(/[^a-zA-Z0-9\s]/g, ' ')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!words.length) return '?';
		if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
		return `${words[0][0]}${words[1][0]}`.toUpperCase();
	}

	function statusLabel(status?: string) {
		if (!status) return '';
		if (status === 'open' || status === 'connected' || status === 'EOSE' || status === 'OK')
			return 'live';
		if (status === 'SUBSCRIBED') return 'sub';
		if (status === 'connecting') return 'sync';
		if (status === 'failed' || status === 'FAILED') return 'fail';
		if (status === 'close' || status === 'CLOSED') return 'idle';
		return '';
	}

	function softwareLabel(software?: string) {
		if (!software) return '';
		return software
			.replace(/^https?:\/\/github\.com\//, '')
			.replace(/^nostr-/, '')
			.replace(/-relay$/, '')
			.replace(/\.git$/, '');
	}

	function toggleSelected(url: string) {
		if (relaysSelected.includes(url)) {
			relaysSelected = relaysSelected.filter((u) => u !== url);
		} else {
			relaysSelected = [...relaysSelected, url];
		}
		setSubRelays(subId, relaysSelected);
	}

	function handleRelayKeydown(event: KeyboardEvent, url: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		toggleSelected(url);
	}

	function handleBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') animator.goBack();
	}

	$: selectedCount = relaysSelected.length;

	onDestroy(() => setSubRelays(subId, relaysSelected));
</script>

<div
	class="h-screen flex items-end bg-base-100/40 backdrop-blur-sm"
	role="button"
	tabindex="-1"
	aria-label="Close relays"
	on:click={animator.goBack}
	on:keydown={handleBackdropKeydown}
>
	<div
		class="communities-modal flex w-full !h-[78vh] !min-h-fit flex-col overflow-hidden rounded-t-[1.75rem] border border-base-content/10 bg-base-100/95 shadow-widget backdrop-blur-xl md:mx-auto md:mb-6 md:h-[72vh] md:max-w-3xl md:rounded-2xl"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		on:click|stopPropagation
		on:keydown|stopPropagation
	>
		<ModalHandle />

		<div class="shrink-0 px-4 pb-3 pt-2 md:px-5">
			<div class="mb-4 flex items-end justify-between gap-4">
				<div class="min-w-0">
					<h2 class="text-2xl font-semibold leading-tight tracking-normal text-base-content">
						Communities
					</h2>
					<p class="mt-1 text-sm font-medium text-base-content/65">
						{selectedCount} selected · {filteredRelays.length} visible
					</p>
				</div>
				<div
					class="flex shrink-0 items-center gap-2 rounded-full bg-base-200 px-3 py-1.5 text-xs font-bold text-base-content/75"
				>
					<span class="h-2 w-2 rounded-full bg-success"></span>
					<span>{relays.length}</span>
				</div>
			</div>

			<div class="rounded-2xl bg-base-200/80 p-1 shadow-widget-down">
				<SearchInput
					placeholder="Search relays"
					bind:value={search}
					showSearchIcon={true}
					showClearButton={true}
					inputClassName="text-base-content placeholder:text-base-content/60"
				/>
			</div>
		</div>

		<!-- Virtualized list -->
		<div class="min-h-0 flex-1 overflow-hidden px-3 pb-safe md:px-4">
			{#if filteredRelays.length > 0}
				<VirtualList
					items={filteredRelays}
					{getItemId}
					itemsPerRow={1}
					height="100%"
					itemHeight={76}
					backdrop={false}
					loading={false}
					bind:viewport
					className="w-full !max-h-none"
					let:item
					let:items
				>
					{#each items as r (r.url)}
						{@const isSelected = relaysSelected?.includes(r.url)}
						{@const nips = Array.isArray(r.info?.supported_nips) ? r.info.supported_nips : []}
						{@const name = relayName(r)}
						{@const software = softwareLabel(r.info?.software)}
						<div
							class="group mb-2 grid min-h-16 cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2.5 shadow-widget transition duration-200 hover:-translate-y-0.5 hover:bg-base-300 {isSelected
								? 'border-primary bg-base-200'
								: 'border-base-content/10 bg-base-300/75'}"
							role="button"
							tabindex="0"
							aria-pressed={isSelected}
							on:click|stopPropagation={() => toggleSelected(r.url)}
							on:keydown|stopPropagation={(event) => handleRelayKeydown(event, r.url)}
						>
							<!-- Checkbox -->
							<div
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors {isSelected
									? 'border-primary bg-primary'
									: 'border-base-content/20 bg-base-100'}"
							>
								{#if isSelected}
									<Icon icon="mingcute:check-line" class="text-base text-primary-content" />
								{/if}
							</div>

							<!-- Icon or Status dot -->
							<div class="relative shrink-0">
								{#if r.info?.icon}
									<img
										src={proxyAvatarUrl(r.info.icon)}
										alt=""
										class="h-9 w-9 rounded-lg bg-base-200 object-cover ring-1 ring-base-content/10"
									/>
								{:else}
									<div
										class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-content ring-1 ring-base-content/10"
									>
										{relayInitials(name)}
									</div>
								{/if}
								<span
									class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-base-300"
									class:bg-success={r.status === 'open' || r.status === 'connected'}
									class:bg-info={r.status === 'SUBSCRIBED'}
									class:bg-warning={r.status === 'connecting'}
									class:bg-error={r.status === 'failed'}
									class:bg-base-content={!r.status || r.status === 'close'}
									class:opacity-30={!r.status || r.status === 'close'}
								></span>
							</div>

							<!-- Relay name & info -->
							<div class="min-w-0">
								<div class="flex min-w-0 items-center gap-2">
									<div class="truncate text-base font-semibold leading-tight text-base-content">
										{name}
									</div>
									{#if statusLabel(r.status)}
										<span
											class="hidden shrink-0 text-[11px] font-bold text-base-content/60 sm:inline"
											class:text-success={r.status === 'open' ||
												r.status === 'connected' ||
												r.status === 'EOSE' ||
												r.status === 'OK'}
											class:text-warning={r.status === 'connecting'}
											class:text-info={r.status === 'SUBSCRIBED'}
											class:text-error={r.status === 'failed' || r.status === 'FAILED'}
										>
											{statusLabel(r.status)}
										</span>
									{/if}
								</div>
								<div class="mt-0.5 truncate text-xs font-medium text-base-content/60">
									{r.info?.description || relayLabel(r.url)}
								</div>
								<!-- Description (if available) -->
							</div>

							<!-- Badges -->
							<div
								class="flex max-w-[45vw] shrink-0 items-center justify-end gap-1.5 overflow-hidden md:max-w-xs"
							>
								<!-- Search support -->
								{#if nips.includes(50)}
									<div
										class="rounded-md bg-info px-2 py-1 text-[10px] font-black leading-none text-info-content"
										title="Search support (NIP-50)"
									>
										search
									</div>
								{/if}
								<!-- Auth required -->
								{#if nips.includes(42)}
									<div
										class="rounded-md bg-warning px-2 py-1 text-[10px] font-black leading-none text-warning-content"
										title="Auth required (NIP-42)"
									>
										auth
									</div>
								{/if}
								<!-- NIP count -->
								{#if nips.length}
									<div
										class="rounded-md px-2 py-1 text-[10px] font-black leading-none"
										class:bg-primary={isSelected}
										class:text-primary-content={isSelected}
										class:bg-base-100={!isSelected}
										class:text-base-content={!isSelected}
									>
										{nips.length}
									</div>
								{/if}
								<!-- Software -->
								{#if software}
									<div
										class="hidden max-w-24 truncate rounded-md bg-base-100 px-2 py-1 text-[10px] font-black leading-none text-base-content/65 sm:inline-block"
										title={r.info.software}
									>
										{software}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</VirtualList>
			{:else}
				<div
					class="rounded-2xl border border-dashed border-base-content/20 bg-base-300/60 p-8 text-center text-sm font-semibold text-base-content/70"
				>
					No relays to show yet.
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(html[data-theme='nuts']) .communities-modal {
		border-color: rgba(242, 235, 221, 0.12);
		background: rgba(11, 23, 18, 0.98);
		box-shadow:
			0 24px 70px rgba(2, 9, 6, 0.58),
			inset 0 1px 0 rgba(242, 235, 221, 0.05);
	}
</style>
