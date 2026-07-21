<script lang="ts">
	import type { ConnectionStatus } from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { isMobile } from 'src/controller';
	import { fetchRelayInfo, relayInfos, relaySubs, setSubRelays } from 'src/controller/relay';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';

	export let subId = '';
	export let relays: string[] = [];
	export let rootNavigation = false;
	const nav = usePagerNavigation();

	export let connectionStatus: { [relay_url: string]: ConnectionStatus | 'SUBSCRIBED' | undefined };

	const normalize = (r: string = ''): string => {
		if (r == '') return '';
		return normalizeURL(r.replace(/relay\./g, ''))
			.replace(/\/$/, '')
			.replace(/^wss?:\/\//, '');
	};

	const relayNames: Record<string, string> = {
		'wss://relay.nuts.cash': 'Nuts',
		'wss://relay.damus.io': 'Damus',
		'wss://nos.lol': 'Nos',
		'wss://relay.thibautduchene.fr': 'Thibaut',
		'wss://purplepag.es': 'Purple Pages',
		'wss://user.kindpag.es': 'Kind Pages'
	};

	const relayColorClasses = [
		'bg-primary',
		'bg-secondary',
		'bg-accent',
		'bg-info',
		'bg-warning',
		'bg-success'
	];

	const isAdditionalRelay = (relay: string) => !normalizedRelays.includes(normalizeURL(relay));

	const uniqueNormalizedRelays = (values: string[]) => [
		...new Set(values.filter(Boolean).map((relay) => normalizeURL(relay)))
	];

	function getStatusValue(status?: ConnectionStatus | 'SUBSCRIBED'): string | undefined {
		return typeof status === 'string' ? status : status?.status()?.toString();
	}

	function relayColorClass(key: string): string {
		let hash = 0;
		for (let index = 0; index < key.length; index += 1) {
			hash = (hash * 31 + key.charCodeAt(index)) % relayColorClasses.length;
		}
		return relayColorClasses[hash];
	}

	function communityName(relay: string): string {
		const key = normalizeURL(relay);
		return $relayInfos.get(key)?.name?.trim() || relayNames[key] || normalize(relay);
	}

	function initials(name: string): string {
		const words = name
			.replace(/[^a-zA-Z0-9\s]/g, ' ')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!words.length) return '?';
		if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
		return `${words[0][0]}${words[1][0]}`.toUpperCase();
	}

	function openRelayInfos() {
		setSubRelays(subId, displayRelays.map(normalizeURL));
		if (rootNavigation) {
			nav ? nav.root(`relayinfos:${subId}`) : go(`relayinfos:${subId}`);
		} else {
			nav ? nav.push(`relayinfos:${subId}`) : go(`relayinfos:${subId}`);
		}
	}

	function openCommunityRelay(relay: string) {
		const eventPath = `community:${encodeURIComponent(normalizeURL(relay))}`;
		nav ? nav.push(eventPath) : go(eventPath);
	}

	function handleListClick() {
		if (mini) openRelayInfos();
	}

	function handleOpenKeydown(event: KeyboardEvent) {
		if (!mini) return;
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		openRelayInfos();
	}

	$: additionalRelays = Object.keys(connectionStatus || {}).filter((r) => !relays.includes(r));
	export let mini = false;

	let showAll = false;

	let relayToShow = $isMobile ? 3 : 6;
	let relayInfoFetchKey = '';

	$: normalizedRelays = uniqueNormalizedRelays(relays);
	$: displayedRelays = uniqueNormalizedRelays(
		showAll ? normalizedRelays : [...normalizedRelays, ...additionalRelays]
	).slice(0, showAll ? undefined : relayToShow);
	$: displayRelays = uniqueNormalizedRelays([...normalizedRelays, ...additionalRelays]);
	$: if (!mini && displayRelays.length) {
		const key = displayRelays.join('\n');
		if (relayInfoFetchKey !== key) {
			relayInfoFetchKey = key;
			displayRelays.forEach((relay) => void fetchRelayInfo(relay));
		}
	}

	$: hasMore = relays.length > relayToShow;

	function getStatusClasses(status?: ConnectionStatus | 'SUBSCRIBED') {
		switch (getStatusValue(status)) {
			case 'EOSE':
				return 'bg-green-500';
			case 'FAILED':
				return 'bg-red-500';
			case 'SUBSCRIBED':
				return 'bg-blue-500 animate-pulse'; // blue pulsing for "loading"
			case 'OK':
				return 'bg-green-400';
			case 'CLOSED':
				return 'bg-gray-500';
			default:
				return 'bg-gray-300 opacity-50'; // unknown or undefined
		}
	}

	function getWideStatusClasses(status?: ConnectionStatus | 'SUBSCRIBED') {
		switch (getStatusValue(status)) {
			case 'EOSE':
				return 'border-lime-400';
			case 'OK':
				return 'border-green-400';
			case 'FAILED':
				return 'border-red-400';
			case 'CLOSED':
				return 'border-slate-400';
			case 'SUBSCRIBED':
				return 'border-sky-400 animate-pulse';
			case 'connecting':
			case 'open':
			case 'connected':
				return 'border-cyan-400 animate-pulse';
			default:
				return 'border-zinc-400 animate-pulse';
		}
	}
</script>

<div>
	<div
		on:click|stopPropagation={handleListClick}
		on:keydown={handleOpenKeydown}
		role="button"
		tabindex="0"
		class="community-list flex gap-2 items-center justify-end flex-wrap overflow-visible pt-1 {$$props.class ||
			''}"
		class:cursor-pointer={mini}
		class:!gap-0={mini}
		class:!flex-nowrap={!mini}
		class:!overflow-x-auto={!mini}
		class:scrollbar-hide={!mini}
	>
		{#if mini}
			{#each displayedRelays as relay (relay)}
				<span
					class="flex items-center text-xs px-2 py-1 bg-base-200 rounded-full relative overflow-hidden"
					class:!max-w-2={mini}
					class:bg-transparent={mini || isAdditionalRelay(relay)}
				>
					<span
						class={`w-2 h-2 mr-1 shrink-0 rounded-full ${getStatusClasses(
							connectionStatus?.[normalizeURL(relay)]
						)}`}
						class:!w-1={mini}
						class:!h-1={mini}
					></span>
					<span
						class:text-gray-500={!connectionStatus?.[normalizeURL(relay)]}
						class:hidden={mini}
						class="truncate"
					>
						{normalize(relay)}
					</span>
				</span>
			{:else}
				{#if !$isMobile}
					<span class="text-xs opacity-60 {$$props.class || ''}"
						><Icon icon="streamline-ultimate:server-add" /></span
					>
				{:else}
					<span class="text-xs opacity-60 {$$props.class || ''}">No relays found</span>
				{/if}
			{/each}
		{:else if displayRelays.length}
			{#each displayRelays as relay (relay)}
				{@const key = normalizeURL(relay)}
				{@const info = $relayInfos.get(key)}
				{@const name = communityName(relay)}
				<button
					type="button"
					class="community-tile group flex w-16 shrink-0 flex-col items-center gap-1 bg-transparent p-0"
					title={name}
					aria-label={name}
					on:click|stopPropagation={() => openCommunityRelay(relay)}
				>
					<span
						class={`relative flex h-9 w-9 items-center justify-center rounded-full border bg-transparent p-0 transition-transform duration-200 group-hover:-translate-y-0.5 group-active:translate-y-0 ${getWideStatusClasses(
							connectionStatus?.[key]
						)}`}
					>
						<span
							class={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ${relayColorClass(
								key
							)}`}
						>
							{#if info?.icon}
								<img src={proxyAvatarUrl(info.icon)} alt="" class="h-full w-full object-cover" />
							{:else}
								<span class="text-[10px] font-bold text-base-100">{initials(name)}</span>
							{/if}
						</span>
					</span>
					<span
						class="community-name hidden max-w-full truncate text-[10px] font-medium leading-none text-base-content/65 md:block"
					>
						{name}
					</span>
				</button>
			{/each}
			<button
				type="button"
				class="community-tile manage-community flex w-16 shrink-0 flex-col items-center gap-1 bg-transparent p-0"
				title="Manage relays"
				aria-label="Manage relays"
				on:click|stopPropagation={openRelayInfos}
			>
				<span
					class="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-base-200 bg-base-300"
				>
					<Icon icon="mingcute:add-line" class="text-lg text-base-content/75" />
				</span>
				<span
					class="community-name hidden max-w-full truncate text-[10px] font-medium leading-none text-base-content/65 md:block"
				>
					Manage
				</span>
			</button>
		{:else if !$isMobile}
			<span class="text-xs opacity-60 {$$props.class || ''}"
				><Icon icon="streamline-ultimate:server-add" /></span
			>
		{:else}
			<span class="text-xs opacity-60 {$$props.class || ''}">No relays found</span>
		{/if}
		{#if mini}
			{#if hasMore && !showAll}
				<button
					class="text-xs px-2 py-1 text-gray-500 rounded-full hover:opacity-80 transition-opacity whitespace-nowrap relative"
					style="margin-left: -0.5rem; z-index: 0;"
					on:click|stopPropagation={() => (showAll = true)}
				>
					+{relays.length - relayToShow} more
				</button>
			{:else if hasMore && showAll}
				<button
					class="text-xs px-2 py-1 bg-base-300 rounded-full hover:opacity-80 transition-opacity whitespace-nowrap relative"
					style="margin-left: -0.5rem; z-index: 0;"
					on:click|stopPropagation={() => (showAll = false)}
				>
					Show less
				</button>
			{/if}
		{/if}
	</div>
</div>

<style>
	:global(html[data-theme='nuts']) .community-list {
		gap: 0.65rem;
	}

	:global(html[data-theme='nuts']) .community-tile > span:first-of-type {
		border-radius: 0.75rem;
	}

	:global(html[data-theme='nuts']) .community-tile > span:first-of-type > span {
		border-radius: 0.6rem;
	}

	:global(html[data-theme='nuts']) .community-name {
		color: rgba(242, 235, 221, 0.7);
		font-size: 0.6875rem;
	}

	:global(html[data-theme='nuts']) .manage-community > span:first-of-type {
		border-color: rgba(231, 182, 56, 0.58);
		background: rgba(231, 182, 56, 0.08);
	}
</style>
