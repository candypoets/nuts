<script lang="ts">
	import type { ConnectionStatus } from '@candypoets/nipworker';
	import { normalizeURL } from 'nostr-tools/utils';
	import { isMobile } from 'src/controller';
	export let relays: string[];
	export let connectionStatus: { [relay_url: string]: ConnectionStatus | 'SUBSCRIBED' | undefined };

	let showAll = false;

	$: normalizedUrls = relays.map((r) => normalizeURL(r).replace(/\/$/, ''));

	let relayToShow = $isMobile ? 3 : 5;

	$: displayedRelays = showAll ? normalizedUrls : normalizedUrls.slice(0, relayToShow);
	$: hasMore = relays.length > relayToShow;

	function getStatusClasses(status?: ConnectionStatus) {
		switch (status) {
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
	{#if relays.length > 0}
		<div class="flex flex-wrap gap-2 items-center {$$props.class || ''}">
			{#each displayedRelays as relay}
				<span class="flex items-center text-xs px-2 py-1 bg-base-200 rounded-full opacity-80">
					<span class={`w-2 h-2 mr-1 rounded-full ${getStatusClasses(connectionStatus?.[relay])}`}
					></span>
					<span class:text-gray-500={!connectionStatus?.[relay]}>
						{relay.replace('wss://', '').replace('ws://', '')}
					</span>
				</span>
			{/each}
			{#if hasMore && !showAll}
				<button
					class="text-xs px-2 py-1 bg-primary text-primary-content rounded-full hover:opacity-80 transition-opacity"
					on:click={() => (showAll = true)}
				>
					+{relays.length - relayToShow} more
				</button>
			{:else if hasMore && showAll}
				<button
					class="text-xs px-2 py-1 bg-base-300 rounded-full hover:opacity-80 transition-opacity"
					on:click={() => (showAll = false)}
				>
					Show less
				</button>
			{/if}
		</div>
	{:else}
		<span class="text-xs opacity-60 {$$props.class || ''}">No relays found</span>
	{/if}
</div>
