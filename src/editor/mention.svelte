<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { nip19 } from 'nostr-tools';
	import { SEARCH_RELAYS } from 'src/lib/env';
	import { isKind0, type AnyKind, type Kind0Parsed } from 'src/parsers';
	import { nostrManager, type EventKind } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onDestroy } from 'svelte';

	// Props from the mention suggestion plugin
	export let command = (item: {
		type: string;
		bech32: string;
		pubkey: string;
		relays: Array<string>;
	}) => {};
	export let query = '';

	let selectedIndex = 0;
	let loading = true;
	let items: ParsedEvent<Kind0Parsed>[] = [];
	let sub: () => void | undefined;

	let eose = false;
	let eoce = false;

	let cachedEvents: ParsedEvent<Kind0Parsed>[] = [];
	let fetchedEvents: ParsedEvent<Kind0Parsed>[] = [];

	// Function to select an item and trigger the command
	function selectItem(index: number) {
		const item = items[index];
		if (item) {
			command({
				pubkey: item.pubkey,
				type: 'nprofile',
				bech32: nip19.nprofileEncode({ pubkey: item.pubkey, relays: [] }),
				relays: []
			});
		}
	}

	function calculateScore(item: ParsedEvent<Kind0Parsed>, searchQuery: string): number {
		if (!item.parsed?.name || !searchQuery) return 0; // No name or query means no match score

		const lowerName = item.parsed.name.toLowerCase();
		const lowerQuery = searchQuery.toLowerCase();
		let score = 0;

		if (lowerName === lowerQuery) score = 3; // Exact match: highest score
		if (lowerName.startsWith(lowerQuery)) score = 2; // Starts with query: high score
		if (lowerName.includes(lowerQuery)) score = 1; // Contains query: medium score
		if (cachedEvents.some((e) => e.pubkey == item.pubkey)) score += 3;
		return score;
	}

	const handleEvents = (events: ParsedEvent<AnyKind>[], eventKind: EventKind) => {
		if (eventKind == 'EOCE' && !eoce) {
			eoce = true;
			items = _.uniqBy(cachedEvents, 'pubkey');
			items = _.sortBy(items, (item) => calculateScore(item, query));
			return;
		}
		if (eventKind == 'EOSE' && !eose) {
			loading = false;
			eose = true;
			items = _.uniqBy([...fetchedEvents, ...items], 'pubkey');
			items = _.sortBy(items, (item) => -calculateScore(item, query));
			return;
		}
		const [event, ...context] = events;
		if (isKind0(event)) {
			// check if the event is already in the feed
			if (!eoce) {
				// cached event are filtered and sorted in the worker
				cachedEvents = [event, ...cachedEvents];
			} else if (!eose) {
				fetchedEvents = [event, ...fetchedEvents];
			} else {
				items = _.uniqBy([event, ...items], 'pubkey');
				items = _.sortBy(items, (item) => -calculateScore(item, query));
			}
		}
	};

	const subscribe = _.throttle((search: string) => {
		cachedEvents = [];
		fetchedEvents = [];
		eoce = false;
		eose = false;
		selectedIndex = 0;
		loading = true;
		sub = nostrManager.subscribe(
			'mentionlist_nocache',
			[{ kinds: [0], search, limit: 10, relays: SEARCH_RELAYS }],
			handleEvents
		);
	}, 300);

	// Reset selection when query changes
	$: query && subscribe(query);

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

<div class="bg-white rounded-lg shadow-lg w-72 max-h-80 overflow-scroll">
	{#if loading}
		<div class="py-3 px-4 text-center text-gray-500">
			<Icon icon="mdi:loading" class="animate-spin h-5 w-5 mx-auto mb-1 text-gray-500" />
			<!-- <span>Loading profiles...</span> -->
		</div>
	{/if}
	{#if items.length === 0}
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
					<div class="font-medium text-gray-900 truncate flex items-center">
						<span>{item.parsed?.name}</span>
						{#if cachedEvents.some((cachedItem) => cachedItem.pubkey === item.pubkey)}
							<Icon icon="mdi:check" class="ml-1 w-4 h-4 text-green-500 flex-shrink-0" />
						{/if}
					</div>
					<div class="text-xs text-gray-500">
						{item.parsed?.pubkey
							? `${item.parsed.pubkey.slice(0, 4)}...${item.parsed.pubkey.slice(-4)}`
							: ''}
					</div>
				</div>
			</button>
		{/each}
	{/if}
</div>
