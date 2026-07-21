<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isParsedEvent } from '@candypoets/nipworker/utils';
	import type { WorkerMessage, ParsedEvent } from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import Loader from 'src/components/Loader.svelte';
	import {
		builtInThemes,
		currentTheme,
		applyTheme,
		loadStoredTheme,
		eventToTheme,
		THEME_DEFINITION_KIND,
		type DittoTheme
	} from 'src/controller/theme';
	import { key } from 'src/controller/key';
	import { readRelays } from 'src/controller/nostr';
	import { get } from 'svelte/store';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';

	const animator: PagerAnimator = getContext('animator');

	let highlightedIndex: number = 0;
	let mounted = false;
	let unsubscribe: (() => void) | null = null;

	// Pagination state
	let loadingMore = false;
	let hasMore = true;
	let oldestTimestamp: number | undefined = undefined;
	let paginationCount = 0;
	const THEMES_PER_PAGE = 50;

	// Use Map for O(1) deduplication of custom themes
	let customThemesMap = new Map<string, DittoTheme>();

	onMount(() => {
		mounted = true;

		const stored = loadStoredTheme();
		if (stored) {
			const index = builtInThemes.findIndex((t) => t.dTag === stored.dTag);
			if (index >= 0) {
				highlightedIndex = index;
			}
		}

		const currentKey = get(key);
		if (currentKey?.pub) {
			fetchUserThemes(currentKey.pub);
		}

		document.addEventListener('keydown', handleKeydown);

		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});

	onDestroy(() => {
		document.removeEventListener('keydown', handleKeydown);
		if (unsubscribe) {
			unsubscribe();
		}
	});

	function fetchUserThemes(pubkey: string, loadMore = false) {
		if (loadingMore) return;
		if (loadMore && !hasMore) return;

		if (loadMore) {
			loadingMore = true;
			paginationCount++;
		}

		const relays = get(readRelays).filter((r): r is string => !!r);

		const subId = `themes_${pubkey}_${loadMore ? 'page_' + paginationCount : 'initial'}`;

		unsubscribe?.();
		unsubscribe = useSubscription(
			subId,
			[
				{
					kinds: [THEME_DEFINITION_KIND],
					// authors: [pubkey],
					limit: THEMES_PER_PAGE,
					relays,
					cacheFirst: true,
					closeOnEOSE: true,
					...(oldestTimestamp ? { until: oldestTimestamp - 1 } : {})
				}
			],
			(message: WorkerMessage) => {
				const parsed = isParsedEvent(message);
				if (!parsed) return;

				const theme = eventToTheme(parsed);
				if (theme) {
					// O(1) deduplication using Map
					const isNew = !customThemesMap.has(theme.dTag);
					customThemesMap.set(theme.dTag, theme);
					if (isNew) {
						// Trigger reactivity by reassigning
						customThemesMap = customThemesMap;
					}

					// Track oldest timestamp for pagination
					const eventTime = (parsed as ParsedEvent).createdAt();
					if (!oldestTimestamp || eventTime < oldestTimestamp) {
						oldestTimestamp = eventTime;
					}
				}
			}
		);

		// Reset loading after a delay (since we don't have onEose callback)
		if (loadMore) {
			setTimeout(() => {
				loadingMore = false;
				// If we got fewer than expected, likely no more themes
				if (customThemesMap.size < THEMES_PER_PAGE * paginationCount) {
					hasMore = false;
				}
			}, 2000);
		}
	}

	function handleNearBottom() {
		if (!hasMore || loadingMore) return;

		const currentKey = get(key);
		if (currentKey?.pub) {
			fetchUserThemes(currentKey.pub, true);
		}
	}

	// Merge built-in and custom themes
	$: allThemes = [...builtInThemes, ...customThemesMap.values()];
	$: customThemesList = [...customThemesMap.values()];

	function selectTheme(theme: DittoTheme) {
		console.log('[ThemeSelect] Selected:', theme.name, 'isDefault:', theme.isDefault);
		applyTheme(theme);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!mounted) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex + 1) % allThemes.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex - 1 + allThemes.length) % allThemes.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (allThemes[highlightedIndex]) {
				selectTheme(allThemes[highlightedIndex]);
			}
		}
	}

	function getItemId(item: DittoTheme) {
		return item?.dTag || Math.random().toString();
	}
</script>

<Feed
	class="bg-base-300 bg-opacity-85"
	items={allThemes}
	{getItemId}
	itemHeight={48}
	onNearBottom={handleNearBottom}
	stickyFooterVisible={loadingMore || !hasMore}
>
	<svelte:fragment slot="header">
		<div>
			<div class="px-4 pt-safe flex justify-between h-20 items-center">
				<button type="button" class="btn btn-ghost btn-sm" on:click={animator?.goBack}>
					<Icon icon="mingcute:down-line" class="text-xl" />
				</button>
			</div>
			<h2 class="text-xl font-bold px-4 pt-2">Select Theme</h2>
			<p class="px-4 py-2 text-sm text-gray-500">Choose your preferred theme.</p>
			<div class="flex items-center gap-3 px-4 pb-2 text-sm font-semibold text-gray-500">
				<span>Built-in themes ({builtInThemes.length})</span>
				{#if customThemesList.length > 0}
					<span aria-hidden="true">·</span>
					<span>Community themes ({customThemesList.length})</span>
				{/if}
			</div>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="item-content" let:post let:index>
		{@const theme = post}
		{@const active = $currentTheme?.dTag === theme.dTag}
		{@const isHighlighted = highlightedIndex === index}
		<button
			class="btn btn-outline btn-sm justify-start w-full mb-2"
			class:btn-active={active}
			class:ring-accent={isHighlighted}
			class:border-2={isHighlighted}
			on:click={() => selectTheme(theme)}
			on:mouseenter={() => (highlightedIndex = index)}
			type="button"
		>
			<span
				class="w-4 h-4 rounded-full mr-2"
				style="background-color: {theme.properties['--primary'] || '#ccc'}"
			></span>
			<span class="flex-1 text-left">{theme.name}</span>
			{#if theme.dTag === 'nuts'}
				<span class="text-xs font-semibold text-secondary">default</span>
			{/if}
			{#if active}
				<span class="text-xs opacity-70">active</span>
			{/if}
		</button>
	</svelte:fragment>

	<!-- <svelte:fragment slot="sticky-footer">
		{#if loadingMore}
			<div class="flex justify-center items-center py-4 bg-base-300/80 backdrop-blur-sm">
				<Loader size="sm" />
			</div>
		{:else if !hasMore && customThemesList.length > 0}
			<div class="text-center py-4 text-sm text-gray-500 bg-base-300/80 backdrop-blur-sm">
				{customThemesList.length} custom theme{customThemesList.length === 1 ? '' : 's'}
			</div>
		{/if}
	</svelte:fragment> -->
</Feed>
