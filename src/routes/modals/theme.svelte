<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isParsedEvent } from '@candypoets/nipworker/utils';
	import type { WorkerMessage, ParsedEvent } from '@candypoets/nipworker';
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

	function fetchUserThemes(pubkey: string) {
		const relays = get(readRelays);

		unsubscribe = useSubscription(
			`themes_${pubkey}`,
			[
				{
					kinds: [THEME_DEFINITION_KIND],
					authors: [pubkey],
					limit: 100,
					relays,
					closeOnEOSE: true
				}
			],
			(message: WorkerMessage) => {
				const parsed = isParsedEvent(message);
				if (!parsed) return;

				const theme = eventToTheme(parsed);
				if (theme) {
					// O(1) deduplication using Map
					customThemesMap.set(theme.dTag, theme);
					// Trigger reactivity by reassigning
					customThemesMap = customThemesMap;
				}
			}
		);
	}

	// Merge built-in and custom themes
	$: allThemes = [...builtInThemes, ...customThemesMap.values()];
	$: builtInThemesList = builtInThemes;
	$: customThemesList = [...customThemesMap.values()];

	function selectTheme(theme: DittoTheme) {
		applyTheme(theme);
		animator?.goBack();
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
</script>

<!-- Modal structure -->
<div class="h-screen flex items-center">
	<div class="w-feed bg-base-300 p-4 rounded-lg max-h-[80vh] overflow-y-auto">
		<h3 class="font-bold text-lg">Select Theme</h3>
		<p class="py-4 text-sm text-gray-500">Choose your preferred theme.</p>

		<!-- Built-in Themes Section -->
		<div class="mb-6">
			<h4 class="text-sm font-semibold text-gray-500 uppercase mb-2">Built-in Themes</h4>
			<div class="grid grid-cols-1 gap-2">
				{#each builtInThemesList as theme, index}
					{@const active = $currentTheme?.dTag === theme.dTag}
					{@const highlighted = highlightedIndex === index}
					<button
						class="btn btn-outline btn-sm justify-start"
						class:btn-active={active}
						class:ring-accent={highlighted}
						class:border-2={highlighted}
						on:click={() => selectTheme(theme)}
						on:mouseenter={() => (highlightedIndex = index)}
					>
						<span
							class="w-4 h-4 rounded-full mr-2"
							style="background-color: {theme.properties['--primary'] || '#ccc'}"
						></span>
						<span class="flex-1 text-left">{theme.name}</span>
						{#if active}
							<span class="text-xs opacity-70">active</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<!-- Custom Themes Section -->
		{#if customThemesList.length > 0}
			<div class="mb-6">
				<h4 class="text-sm font-semibold text-gray-500 uppercase mb-2">
					Custom Themes ({customThemesList.length})
				</h4>
				<div class="grid grid-cols-1 gap-2">
					{#each customThemesList as theme, index}
						{@const displayIndex = builtInThemesList.length + index}
						{@const active = $currentTheme?.dTag === theme.dTag}
						{@const highlighted = highlightedIndex === displayIndex}
						<button
							class="btn btn-outline btn-sm justify-start"
							class:btn-active={active}
							class:ring-accent={highlighted}
							class:border-2={highlighted}
							on:click={() => selectTheme(theme)}
							on:mouseenter={() => (highlightedIndex = displayIndex)}
						>
							<span
								class="w-4 h-4 rounded-full mr-2"
								style="background-color: {theme.properties['--primary'] || '#ccc'}"
							></span>
							<span class="flex-1 text-left">{theme.name}</span>
							{#if active}
								<span class="text-xs opacity-70">active</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{:else if $key?.pub}
			<div class="mb-6">
				<h4 class="text-sm font-semibold text-gray-500 uppercase mb-2">Custom Themes</h4>
				<p class="text-sm text-gray-500 py-2">No custom themes found.</p>
			</div>
		{/if}

		<div class="modal-action">
			<button class="btn btn-sm" on:click={() => animator?.goBack()}>Close</button>
		</div>
	</div>
</div>
