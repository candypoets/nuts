<script lang="ts">
	import {
		MessageType,
		ParsePipeConfigT,
		PipeConfig,
		PipeT,
		SerializeEventsPipeConfigT,
		type ConnectionStatus,
		type ParsedEvent,
		type SubscriptionConfig,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind0, asParsedEvent, asConnectionStatus, isKind0 } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { sortBy, throttle } from 'lodash';
	import { createEventDispatcher } from 'svelte';

	import { onDestroy, onMount } from 'svelte';
	import VirtualList from 'src/components/VirtualList.svelte';
	import { mutePipeConfig } from 'src/controller/nostr';
	import { SEARCH_RELAYS } from 'src/lib/env';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { go } from './modal';

	export let goBack: () => void;

	// Mode: 'profiles' for searching profiles, 'hashtags' for jumping to hashtag view
	export let mode: 'profiles' | 'hashtags' = 'profiles';

	let selectedIndex = 0;
	let loading = true;
	let items: ParsedEvent[] = [];
	let sub: () => void | undefined;

	let eose = false;
	let eoce = false;

	let cachedEvents: ParsedEvent[] = [];
	let fetchedEvents: ParsedEvent[] = [];
	let seenPubkeys = new Map<string, ParsedEvent>();

	let _placeholder = mode === 'hashtags' ? 'Enter hashtag…' : 'Search…';
	export { _placeholder as placeholder };
	export let hotkey: string = 'k';
	export let requireMetaOrCtrl = true;
	export let maxHeight = '60vh';
	export let autoCloseOnSelect = true;

	const dispatch = createEventDispatcher<{ select: ParsedEvent | string }>();

	let query = '';
	let inputEl: HTMLInputElement;
	let activeIndex = 0;
	let hashtagHistory: string[] = [];
	const HASHTAG_HISTORY_KEY = 'cmdk_hashtag_history';

	// For hashtag mode: track if we have a valid tag to suggest
	$: tagSuggestion = mode === 'hashtags' && query.trim() ? query.trim().replace(/^#/, '') : null;

	$: if (activeIndex >= items.length) activeIndex = Math.max(0, items.length - 1);

	// Load hashtag history from sessionStorage
	function loadHashtagHistory(): string[] {
		try {
			const stored = sessionStorage.getItem(HASHTAG_HISTORY_KEY);
			return stored ? JSON.parse(stored) : [];
		} catch {
			return [];
		}
	}

	// Save hashtag to history
	function saveHashtagToHistory(tag: string) {
		try {
			const cleanTag = tag.replace(/^#/, '');
			if (!cleanTag) return;

			const history = loadHashtagHistory();
			// Remove if exists (to move to top) and add to front
			const filtered = history.filter(h => h.toLowerCase() !== cleanTag.toLowerCase());
			const newHistory = [cleanTag, ...filtered].slice(0, 10); // Keep last 10

			sessionStorage.setItem(HASHTAG_HISTORY_KEY, JSON.stringify(newHistory));
			hashtagHistory = newHistory;
		} catch {
			// Ignore storage errors
		}
	}

	// Initialize history on mount
	onMount(() => {
		hashtagHistory = loadHashtagHistory();
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(activeIndex + 1, items.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
		} else if (e.key === 'Enter') {
			if (mode === 'hashtags') {
				// In hashtag mode, navigate to tag view on Enter
				const tag = query.trim().replace(/^#/, '');
				if (tag) {
					goToTag(tag);
				}
			} else {
				// Profile mode: existing behavior
				const item = items[activeIndex];
				if (item) {
					dispatch('select', item);
					const profilePath = `nprofile:${item.pubkey()}`;
					go(profilePath);
				}
			}
		} else if (e.key === 'Tab' && !e.shiftKey && !query.trim()) {
			// Allow toggling between modes with Tab key only when input is empty
			e.preventDefault();
			mode = mode === 'profiles' ? 'hashtags' : 'profiles';
		}
	}

	function goToTag(tag: string) {
		const cleanTag = tag.replace(/^#/, '');
		if (cleanTag) {
			saveHashtagToHistory(cleanTag);
			dispatch('select', cleanTag);
			go(`tags:${encodeURIComponent(cleanTag)}`);
		}
	}


	function selectItem(item: ParsedEvent, idx: number) {
		activeIndex = idx;
		dispatch('select', item);
		const profilePath = `nprofile:${item.pubkey()}`;
		go(profilePath);
	}

	function getItemId(item: ParsedEvent) {
		return item.id();
	}

	function addOrUpdateEvent(event: ParsedEvent) {
		const pubkey = event.pubkey();
		if (!pubkey) return;

		const kind0 = asKind0(event);
		const name = kind0?.name() || 'unnamed';

		const existing = seenPubkeys.get(pubkey);
		// Always add if no existing, or if new event has newer created_at
		if (
			!existing ||
			(event.createdAt() && existing.createdAt() && event.createdAt() > existing.createdAt())
		) {
			console.log('[CMDK] addOrUpdateEvent: adding', name, pubkey.slice(0, 16));
			seenPubkeys.set(pubkey, event);
		} else {
			console.log('[CMDK] addOrUpdateEvent: skipping (older)', name);
		}
	}

	function matchesSearch(item: ParsedEvent, searchQuery: string): boolean {
		if (!searchQuery) return true;
		const lowerQuery = searchQuery.toLowerCase();

		const kind0 = asKind0(item);
		if (!kind0) return false;

		const name = (kind0.name() || '').toLowerCase();
		const displayName = (kind0.displayName() || '').toLowerCase();
		const nip05 = (kind0.nip05() || '').toLowerCase();

		// Check name field
		if (name.includes(lowerQuery)) {
			console.log('[CMDK] ✓ MATCH name:', kind0.name(), '- query:', searchQuery);
			return true;
		}

		// Check displayName field
		if (displayName.includes(lowerQuery)) {
			console.log('[CMDK] ✓ MATCH displayName:', kind0.displayName(), '- query:', searchQuery);
			return true;
		}

		// Check nip05 field
		if (nip05.includes(lowerQuery)) {
			console.log('[CMDK] ✓ MATCH nip05:', kind0.nip05(), '- query:', searchQuery);
			return true;
		}

		console.log('[CMDK] ✗ FILTERED OUT:', {
			name: kind0.name(),
			displayName: kind0.displayName(),
			nip05: kind0.nip05(),
			pubkey: item.pubkey()?.slice(0, 16) + '...',
			query: searchQuery
		});
		return false;
	}

	function getItemsFromMap(): ParsedEvent[] {
		// Client-side filter: only return items that match the search query
		const allItems = Array.from(seenPubkeys.values());
		const filtered = allItems.filter(item => matchesSearch(item, query));
		return filtered;
	}

	const subscribe = throttle((search: string) => {
		console.log('[CMDK] subscribe called with search:', search);
		// Clean up previous subscription before creating a new one
		if (sub) {
			sub();
		}
		seenPubkeys.clear();
		items = [];
		cachedEvents = [];
		fetchedEvents = [];
		eoce = false;
		eose = false;
		selectedIndex = 0;
		loading = true;
		const subscriptionId = 'cmdk_' + search;
		// Search broadly with higher limit, then filter client-side
		const filters = [{ kinds: [0], search, limit: 50, noCache: true, relays: SEARCH_RELAYS }];
		sub = useSubscription(subscriptionId, filters, handleEvents, {
			pipeline: [
				new PipeT(PipeConfig.MuteFilterPipeConfig, $mutePipeConfig),
				new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
				new PipeT(
					PipeConfig.SerializeEventsPipeConfig,
					new SerializeEventsPipeConfigT(new TextEncoder().encode('cmdk'))
				)
			]})
	}, 600);

	onDestroy(() => {
		if (sub) {
			sub();
		}
	});

	function calculateScore(item: ParsedEvent, searchQuery: string): number {
		const kind0 = asKind0(item);
		if (!kind0 || !searchQuery) return 0;

		const lowerQuery = searchQuery.toLowerCase();
		let score = 0;

		// Check name first (primary field)
		const name = kind0.name();
		if (name) {
			const lowerName = name.toLowerCase();
			if (lowerName === lowerQuery) score = 100; // Exact match: highest score
			else if (lowerName.startsWith(lowerQuery)) score = 50; // Starts with: high score
			else if (lowerName.includes(lowerQuery)) score = 10; // Contains: medium score
		}

		// Check displayName if no match on name (or add to score)
		const displayName = kind0.displayName();
		if (displayName && score < 100) {
			const lowerDisplayName = displayName.toLowerCase();
			if (lowerDisplayName === lowerQuery) score = Math.max(score, 90); // Exact on displayName
			else if (lowerDisplayName.startsWith(lowerQuery)) score = Math.max(score, 40);
			else if (lowerDisplayName.includes(lowerQuery)) score = Math.max(score, 5);
		}

		// Check nip05 as well
		const nip05 = kind0.nip05();
		if (nip05 && score < 50) {
			const lowerNip05 = nip05.toLowerCase();
			if (lowerNip05 === lowerQuery) score = Math.max(score, 80); // Exact on nip05
			else if (lowerNip05.includes(lowerQuery)) score = Math.max(score, 8);
		}

		// Small bonus for cached events, but don't override match quality
		if (cachedEvents.some((e) => e.pubkey() == item.pubkey())) score += 5;

		return score;
	}

	const handleEvents = (message: WorkerMessage) => {
		switch (message.type()) {
			case MessageType.ConnectionStatus: {
				const status = asConnectionStatus(message) as ConnectionStatus;
				loading = false;
				eose = true;
				// Process both cached and fetched events on EOSE
				cachedEvents.forEach(addOrUpdateEvent);
				fetchedEvents.forEach(addOrUpdateEvent);
				items = sortBy(getItemsFromMap(), (item) => -calculateScore(item, query));
				break;
			}
			case MessageType.Eoce:
				eoce = true;
				cachedEvents.forEach(addOrUpdateEvent);
				items = sortBy(getItemsFromMap(), (item) => calculateScore(item, query));
				break;
			case MessageType.ParsedNostrEvent: {
				if (isKind0(message)) {
					const parsedEvent = asParsedEvent(message) as ParsedEvent;
					const kind0 = asKind0(parsedEvent);
					if (eose) {
						// After EOSE, process immediately
						addOrUpdateEvent(parsedEvent);
						items = sortBy(getItemsFromMap(), (item) => -calculateScore(item, query));
					} else if (!eoce) {
						// Before EOSE and EOCE, cache events
						cachedEvents = [parsedEvent, ...cachedEvents];
					} else {
						fetchedEvents = [parsedEvent, ...fetchedEvents];
					}
				}
				break;
			}
		}
	};

	// Reset selection when query changes (only in profile mode)
	$: if (query && mode === 'profiles') subscribe(query);
</script>

<div class="flex items-start md:items-center justify-center p-4 h-screen" on:keydown={onKey}>
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
			<Icon icon={mode === 'hashtags' ? 'carbon:hashtag' : 'carbon:search'} class="text-xl opacity-70" />
			<input
				bind:this={inputEl}
				bind:value={query}
				placeholder={_placeholder}
				class="flex-1 text-lg md:text-xl bg-transparent outline-none py-2"
				autofocus
			/>
			<div class="hidden md:flex items-center gap-1 text-xs opacity-60">
				<kbd class="kbd kbd-sm">⌘</kbd><kbd class="kbd kbd-sm">{hotkey.toUpperCase()}</kbd>
			</div>
		</div>

		<!-- Mode Toggle -->
		<div class="flex items-center gap-2 px-4 py-2 bg-base-200/50 border-b border-base-300">
			<button
				type="button"
				class="px-3 py-1 rounded-full text-sm transition-colors {mode === 'profiles' ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}"
				on:click={() => mode = 'profiles'}
			>
				Profiles
			</button>
			<button
				type="button"
				class="px-3 py-1 rounded-full text-sm transition-colors {mode === 'hashtags' ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}"
				on:click={() => mode = 'hashtags'}
			>
				Hashtags
			</button>
			<span class="text-xs opacity-50 ml-2">(Press Tab to toggle)</span>
		</div>

		<!-- Results -->
		<div class="h-full" style={`max-height: ${maxHeight};`}>
			{#if mode === 'hashtags'}
				<!-- Hashtag Mode -->
				{#if query.trim()}
					<div class="divide-y divide-base-300">
						<button
							type="button"
							class="w-full text-left px-4 md:px-5 py-3 bg-base-300 opacity-75 hover:opacity-100 focus:opacity-100 outline-none flex items-center gap-3 opacity-100 !bg-base-200"
							on:click={() => goToTag(query)}
						>
							<Icon icon="carbon:hashtag" class="text-xl text-primary" />
							<div class="min-w-0 flex gap-2 items-center">
								<div class="font-medium truncate">#{query.trim().replace(/^#/, '')}</div>
								<span class="text-sm opacity-60">View tag feed</span>
							</div>
						</button>
					</div>
				{:else}
					<div class="px-6 py-10 text-center opacity-50">
						<Icon icon="carbon:hashtag" class="h-8 w-8 mx-auto mb-2" />
						<div>Type a hashtag to view its feed</div>
						<div class="text-sm opacity-60 mt-1">Press Enter to navigate</div>
					</div>
				{/if}
			{:else}
				<!-- Profile Mode (existing behavior) -->
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
						itemHeight={64}
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
													<img src={proxyAvatarUrl(kind0.picture())} alt="" />
												</div>
											</div>
										{:else}
											<div class="w-5"></div>
										{/if}
										<div class="min-w-0 flex gap-2">
											<div class="font-medium truncate">{kind0.name()}</div>
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
			{/if}
		</div>
	</div>
</div>
