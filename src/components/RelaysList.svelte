<script lang="ts">
	import type { ConnectionStatus } from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { isMobile } from 'src/controller';
	import { relaySub, relaySubs } from 'src/controller/relay';
	import { go } from 'src/routes/modals/modal';

	export let subId = '';
	export let relays: string[] = [];

	export let connectionStatus: { [relay_url: string]: ConnectionStatus | 'SUBSCRIBED' | undefined };

	const normalize = (r: string = '') => {
		if (r == '') return '';
		return normalizeURL(r.replace(/relay\./g, ''))
			.replace(/\/$/, '')
			.replace(/^wss?:\/\//, '');
	};

	const isAdditionalRelay = (relay: string) => !relays.includes(relay);

	$: additionalRelays = Object.keys(connectionStatus || {}).filter((r) => !relays.includes(r));
	export let mini = false;

	let showAll = false;

	let relayToShow = $isMobile ? 3 : 6;

	$: displayedRelays = showAll ? relays : [...relays, ...additionalRelays].slice(0, relayToShow);

	$: hasMore = relays.length > relayToShow;

	function getStatusClasses(status?: ConnectionStatus) {
		switch (status?.status()?.toString()) {
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
</script>

<div>
	<div
		on:click|stopPropagation={(_) => {
			$relaySubs.set(subId, relays);
			go(`relayinfos:${subId}`);
		}}
		class="cursor-pointer flex gap-2 items-center justify-end flex-wrap overflow-visible pt-1 {$$props.class ||
			''}"
		class:!gap-0={mini}
	>
		{#each displayedRelays as relay, i}
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
				<span class:text-gray-500={!connectionStatus?.[normalizeURL(relay)]} class:hidden={mini} class="truncate">
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
		{#if !mini}
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
