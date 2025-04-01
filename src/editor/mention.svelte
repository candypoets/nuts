<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/parsers';
	import { nostrManager, type EventKind } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onDestroy } from 'svelte';

	// Props from the mention suggestion plugin
	export let command = (item: { id: string; label: string }) => {};
	export let query = '';

	let selectedIndex = 0;
	let loading = true;
	let items: ParsedEvent<Kind0Parsed>[] = [];
	let sub: () => void | undefined;

	// Function to select an item and trigger the command
	function selectItem(index: number) {
		const item = items[index];
		if (item) {
			command({
				id: item.pubkey,
				label: item.parsed?.name || item.pubkey.slice(0, 8)
			});
		}
	}

	const handleEvents = (events: ParsedEvent<AnyKind>[], eventType: EventKind) => {
		const event = events?.[0];
		if (isKind0(event)) {
			items = [...items, event];
		}
	};

	// Reset selection when query changes
	$: if (query !== undefined) {
		selectedIndex = 0;

		_.throttle(() => {
			sub = nostrManager.subscribe(
				'mentionlist',
				[{ kinds: [0], search: query, limit: 10, relays: ['wss://nostr.fmt.wiz.biz'] }],
				handleEvents
			);
		}, 300);
	}

	// Handle keyboard navigation
	export function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'ArrowUp') {
			selectedIndex = (selectedIndex + items.length - 1) % items.length;
			return true;
		}

		if (event.key === 'ArrowDown') {
			selectedIndex = (selectedIndex + 1) % items.length;
			return true;
		}

		if (event.key === 'Enter' && items.length > 0) {
			selectItem(selectedIndex);
			return true;
		}

		return false;
	}

	onDestroy(() => {
		if (sub) {
			sub();
		}
	});
</script>

<div class="bg-white rounded-lg shadow-lg overflow-hidden w-72 max-h-80 overflow-y-auto">
	{#if loading}
		<div class="py-3 px-4 text-center text-gray-500">
			<Icon icon="mdi:loading" class="animate-spin h-5 w-5 mx-auto mb-1 text-gray-500" />
			<span>Loading profiles...</span>
		</div>
	{:else if items.length === 0}
		<div class="py-3 px-4 text-center text-gray-500">No matching profiles found</div>
	{:else}
		{#each items as item, index}
			<button
				class="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 text-left {selectedIndex ===
				index
					? 'bg-gray-100'
					: ''}"
				on:click={() => selectItem(index)}
			>
				{#if item.parsed?.picture}
					<img
						src={item.parsed.picture}
						alt=""
						class="w-8 h-8 rounded-full object-cover flex-shrink-0"
					/>
				{:else}
					<div
						class="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center"
					>
						<Icon icon="mdi:account-circle" class="w-4 h-4 text-gray-500"></Icon>
					</div>
				{/if}

				<div class="flex-1 min-w-0">
					<div class="font-medium text-gray-900 truncate">
						{item.parsed?.name}
					</div>
				</div>
			</button>
		{/each}
	{/if}
</div>
