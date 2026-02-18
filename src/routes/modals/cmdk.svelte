<script lang="ts">
	import {
		MessageType,
		ParsePipeConfigT,
		PipeConfig,
		PipeT,
		SerializeEventsPipeConfigT,
		type ParsedEvent,
		type SubscriptionConfig,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind0, asParsedEvent, isKind0 } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { sortBy, throttle } from 'lodash';
	import { createEventDispatcher } from 'svelte';

	import { onDestroy } from 'svelte';
	import VirtualList from 'src/components/VirtualList.svelte';
	import { SEARCH_RELAYS } from 'src/lib/env';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { go } from './modal';

	export let goBack: () => void;

	let selectedIndex = 0;
	let loading = true;
	let items: ParsedEvent[] = [];
	let sub: () => void | undefined;

	let eose = false;
	let eoce = false;

	let cachedEvents: ParsedEvent[] = [];
	let fetchedEvents: ParsedEvent[] = [];
	let seenPubkeys = new Map<string, ParsedEvent>();

	export let placeholder = 'Search…';
	export let hotkey: string = 'k';
	export let requireMetaOrCtrl = true;
	export let maxHeight = '60vh';
	export let autoCloseOnSelect = true;

	const dispatch = createEventDispatcher<{ select: ParsedEvent }>();

	let query = '';
	let inputEl: HTMLInputElement;
	let activeIndex = 0;

	$: if (activeIndex >= items.length) activeIndex = Math.max(0, items.length - 1);

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(activeIndex + 1, items.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
		} else if (e.key === 'Enter') {
			const item = items[activeIndex];
			if (item) {
				dispatch('select', item);
				const profilePath = `nprofile:${item.pubkey()!.toString()}`;
				// if (autoCloseOnSelect) goBack();
				go(profilePath);
			}
		}
	}

	const subscriptionOptions: SubscriptionConfig = {
		pipeline: [
			new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
			new PipeT(
				PipeConfig.SerializeEventsPipeConfig,
				new SerializeEventsPipeConfigT(new TextEncoder().encode('cmdk'))
			)
		]
	};

	function selectItem(item: ParsedEvent, idx: number) {
		activeIndex = idx;
		dispatch('select', item);
		const profilePath = `nprofile:${item.pubkey()!.toString()}`;
		go(profilePath);
	}

	function getItemId(item: ParsedEvent) {
		return item.id()?.toString();
	}

	function addOrUpdateEvent(event: ParsedEvent) {
		const pubkey = event.pubkey()?.toString();
		if (!pubkey) return;

		const existing = seenPubkeys.get(pubkey);
		// Always add if no existing, or if new event has newer created_at
		if (!existing || (event.created_at && existing.created_at && event.created_at > existing.created_at)) {
			console.log('[CMDK] adding/updating event:', { pubkey: pubkey.slice(0, 16), created_at: event.created_at, existing: existing?.created_at });
			seenPubkeys.set(pubkey, event);
		} else {
			console.log('[CMDK] skipping event (older or duplicate):', { pubkey: pubkey.slice(0, 16), created_at: event.created_at, existing: existing?.created_at });
		}
	}

	function getItemsFromMap(): ParsedEvent[] {
		return Array.from(seenPubkeys.values());
	}

	const subscribe = throttle((search: string) => {
		console.log('[CMDK] subscribe called:', { search, relays: SEARCH_RELAYS });
		// Clean up previous subscription before creating a new one
		if (sub) {
			console.log('[CMDK] cleaning up previous subscription');
			sub();
		}
		console.log('[CMDK] resetting state, items was:', items.length, 'seenPubkeys was:', seenPubkeys.size);
		seenPubkeys.clear();
		items = [];
		cachedEvents = [];
		fetchedEvents = [];
		eoce = false;
		eose = false;
		selectedIndex = 0;
		loading = true;
		const subscriptionId = 'cmdk_' + search;
		const filters = [{ kinds: [0], search, limit: 10, noCache: true, relays: SEARCH_RELAYS }];
		console.log('[CMDK] creating subscription:', { subscriptionId, search, filters, relays: SEARCH_RELAYS });
		sub = useSubscription(
			subscriptionId,
			filters,
			handleEvents,
			subscriptionOptions
		);
	}, 600);

	onDestroy(() => {
		if (sub) {
			sub();
		}
	});

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
		console.log('[CMDK] handleEvents:', { type: message.type(), query });
		switch (message.type()) {
			case MessageType.ConnectionStatus:
				console.log('[CMDK] ConnectionStatus received, items count:', items.length);
				loading = false;
				eose = true;
				fetchedEvents.forEach(addOrUpdateEvent);
				items = sortBy(getItemsFromMap(), (item) => -calculateScore(item, query));
				console.log('[CMDK] after ConnectionStatus, items count:', items.length, 'seenPubkeys:', seenPubkeys.size);
				break;
			case MessageType.Eoce:
				console.log('[CMDK] Eoce received, cachedEvents count:', cachedEvents.length);
				eoce = true;
				cachedEvents.forEach(addOrUpdateEvent);
				items = sortBy(getItemsFromMap(), (item) => calculateScore(item, query));
				console.log('[CMDK] after Eoce, items count:', items.length, 'seenPubkeys:', seenPubkeys.size);
				break;
			case MessageType.ParsedNostrEvent:
				if (isKind0(message)) {
					const parsedEvent = asParsedEvent(message) as ParsedEvent;
					console.log('[CMDK] ParsedNostrEvent received:', {
						name: parsedEvent.parsed?.name,
						pubkey: parsedEvent.pubkey()?.toString().slice(0, 16) + '...',
						created_at: parsedEvent.created_at,
						eoce,
						eose
					});
					if (!eoce) {
						// cached event are filtered and sorted in the worker
						cachedEvents = [parsedEvent, ...cachedEvents];
					} else if (!eose) {
						fetchedEvents = [parsedEvent, ...fetchedEvents];
					} else {
						addOrUpdateEvent(parsedEvent);
						items = sortBy(getItemsFromMap(), (item) => -calculateScore(item, query));
					}
				}
		}
	};

	// Reset selection when query changes
	$: query && subscribe(query);
</script>

<div
	class="backdrop-blur-gpu flex items-start md:items-center justify-center p-4 h-screen"
	on:keydown={onKey}
>
	<!-- Container -->
	<div
		class="w-full max-w-2xl rounded-xl shadow-widget overflow-hidden md:h-2/3 h-screen"
		role="dialog"
		aria-modal="true"
	>
		<!-- Input -->
		<div
			class="flex items-center bg-base-200 gap-3 px-4 md:px-5 py-3 md:py-4 border-b border-base-300"
		>
			<Icon icon="carbon:search" class="text-xl opacity-70" />
			<input
				bind:this={inputEl}
				bind:value={query}
				{placeholder}
				class="flex-1 text-lg md:text-xl bg-transparent outline-none py-2"
				autofocus
			/>
			<div class="hidden md:flex items-center gap-1 text-xs opacity-60">
				<kbd class="kbd kbd-sm">⌘</kbd><kbd class="kbd kbd-sm">{hotkey.toUpperCase()}</kbd>
			</div>
		</div>
		<!-- Results -->
		<div class="h-full" style={`max-height: ${maxHeight};`}>
			{#if loading && query}
				<div class="px-6 py-10 text-center">
					<Icon icon="mdi:loading" class="animate-spin h-6 w-6 mx-auto mb-2 opacity-70" />
					<div class="opacity-60 text-sm">Searching...</div>
				</div>
			{:else if items.length > 0 && query}
				<VirtualList
					{items}
					{getItemId}
					itemsPerRow={1}
					height="100%"
					className="w-full"
					let:item
					let:items
					let:itemIndex
				>
					<div class="divide-y divide-base-300">
						{#each items as it, i (getItemId(it))}
							{@const kind0 = asKind0(item)}
							{#if kind0}
								<button
									type="button"
									class="w-full text-left px-4 md:px-5 py-3 bg-base-300 opacity-75 hover:opacity-100 focus:opacity-100 outline-none flex items-center gap-3"
									class:opacity-100={itemIndex === activeIndex}
									class:!bg-base-200={itemIndex === activeIndex}
									on:click={() => selectItem(it, i)}
								>
									{#if kind0.picture()}
										<div class="avatar">
											<div class="w-7 h-7 rounded">
												<img src={proxyAvatarUrl(kind0.picture()?.toString())} alt="" />
											</div>
										</div>
									{:else}
										<div class="w-5"></div>
									{/if}
									<div class="min-w-0 flex gap-2">
										<div class="font-medium truncate">{kind0.name()?.toString()}</div>
									</div>
								</button>
							{/if}
						{/each}
					</div>
				</VirtualList>
			{:else if query && !loading}
				<div class="px-6 py-10 text-center opacity-70">
					<Icon icon="carbon:search" class="h-8 w-8 mx-auto mb-2 opacity-50" />
					<div>No results found for "{query}"</div>
					<div class="text-sm opacity-60 mt-1">Try a different search term</div>
				</div>
			{:else}
				<div class="px-6 py-10 text-center opacity-50">
					<Icon icon="carbon:search" class="h-8 w-8 mx-auto mb-2" />
					<div>Start typing to search profiles</div>
				</div>
			{/if}
		</div>
	</div>
</div>
