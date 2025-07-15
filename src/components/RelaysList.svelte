<script lang="ts">
	export let relays: string[];

	let showAll = false;

	$: displayedRelays = showAll ? relays : relays.slice(0, 3);
	$: hasMore = relays.length > 3;
</script>

<div>
	{#if relays.length > 0}
		<div class="flex flex-wrap gap-2 items-center {$$props.class || ''}">
			{#each displayedRelays as relay}
				<span class="text-xs px-2 py-1 bg-base-200 rounded-full opacity-80">
					{relay.replace('wss://', '').replace('ws://', '')}
				</span>
			{/each}
			{#if hasMore && !showAll}
				<button
					class="text-xs px-2 py-1 bg-primary text-primary-content rounded-full hover:opacity-80 transition-opacity"
					on:click={() => (showAll = true)}
				>
					+{relays.length - 3} more
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
