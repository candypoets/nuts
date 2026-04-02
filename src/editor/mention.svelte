<script lang="ts">
	import { MessageType, type ParsedEvent, type WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind0, asParsedEvent, isKind0 } from '@candypoets/nipworker/utils';
	import Loader from 'src/components/Loader.svelte';
	import { sortBy, throttle, uniqBy } from 'lodash';
	import { nip19 } from 'nostr-tools';
	import { SEARCH_RELAYS } from 'src/lib/env';
	import { proxyAvatarUrl } from 'src/lib/proxy';
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
	let items: ParsedEvent[] = [];
	let sub: () => void | undefined;

	let eose = false;
	let eoce = false;

	let cachedEvents: ParsedEvent[] = [];
	let fetchedEvents: ParsedEvent[] = [];

	// Function to select an item and trigger the command
	function selectItem(index: number) {
		const item = items[index];
		if (item) {
			command({
				pubkey: item.pubkey(),
				type: 'nprofile',
				bech32: nip19.nprofileEncode({ pubkey: item.pubkey()!, relays: [] }),
				relays: []
			});
		}
	}

	function calculateScore(item: ParsedEvent, searchQuery: string): number {
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

	const handleEvents = (message: WorkerMessage) => {
		switch (message.type()) {
			case MessageType.ConnectionStatus:
				loading = false;
				eose = true;
				items = uniqBy([...cachedEvents, ...fetchedEvents, ...items], (item) => item.pubkey());
				items = sortBy(items, (item) => -calculateScore(item, query));
				break;
			case MessageType.Eoce:
				eoce = true;
				items = uniqBy([...cachedEvents, ...fetchedEvents, ...items], (item) => item.pubkey());
				items = sortBy(items, (item) => calculateScore(item, query));
				break;
			case MessageType.ParsedNostrEvent:
				if (isKind0(message)) {
					const parsedEvent = asParsedEvent(message) as ParsedEvent;
					if (!eoce) {
						// cached event are filtered and sorted in the worker
						cachedEvents = [parsedEvent, ...cachedEvents];
					} else if (!eose) {
						fetchedEvents = [parsedEvent, ...fetchedEvents];
					} else {
						items = uniqBy([parsedEvent, ...items], (item) => item?.pubkey());
						items = sortBy(items, (item) => -calculateScore(item, query));
					}
				}
		}
	};

	const subscribe = throttle((search: string) => {
		if (sub) {
			sub();
		}
		cachedEvents = [];
		fetchedEvents = [];
		eoce = false;
		eose = false;
		selectedIndex = 0;
		loading = true;
		sub = useSubscription(
			'mentionlist_' + search,
			[{ kinds: [0], search, limit: 10, relays: SEARCH_RELAYS, noCache: true }],
			handleEvents
		);
	}, 600);

	// Reset selection when query changes
	$: query && subscribe(query);

	// Re-sort existing items when query changes (for instant feedback)
	$: if (query && items.length > 0) {
		items = sortBy(items, (item) => -calculateScore(item, query));
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

<div class="bg-white rounded-lg shadow-lg w-72 max-h-80 overflow-scroll">
	{#if loading && query}
		<div class="py-3 px-4 text-center text-gray-500">
			<Loader size="sm" className="mx-auto mb-1 text-gray-500" />
			<div class="text-xs">Searching...</div>
		</div>
	{/if}
	{#if items.length === 0}
		<div class="py-3 px-4 text-center text-gray-500">No matching profiles found</div>
	{:else}
		{#each items as item, index}
			{@const kind0 = asKind0(item)}
			<button
				class="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 text-left {selectedIndex ===
				index
					? 'bg-gray-100'
					: ''}"
				on:click={() => selectItem(index)}
			>
				{#if kind0?.picture()}
					<img
						src={proxyAvatarUrl(kind0.picture() || '')}
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
						<span>{kind0?.name()}</span>
						{#if cachedEvents.some((cachedItem) => cachedItem.pubkey() === item.pubkey())}
							<Icon icon="mdi:check" class="ml-1 w-4 h-4 text-green-500 flex-shrink-0" />
						{/if}
					</div>
					<div class="text-xs text-gray-500">
						{item?.pubkey() ? `${item.pubkey()?.slice(0, 4)}...${item.pubkey()?.slice(-4)}` : ''}
					</div>
				</div>
			</button>
		{/each}
	{/if}
</div>
