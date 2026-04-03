<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import { fly, fade } from 'svelte/transition';

	let expanded = false;
	let loaded = false;
	let containerEl: HTMLDivElement;

	onMount(() => {
		loaded = true;

		// Add click outside listener
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function toggle(event?: MouseEvent) {
		event?.stopPropagation();
		expanded = !expanded;
	}

	function dismiss() {
		localStorage.setItem('shortcuts-guide-dismissed', 'true');
		expanded = false;
	}

	function handleClickOutside(event: MouseEvent) {
		if (expanded && containerEl && !containerEl.contains(event.target as Node)) {
			expanded = false;
		}
	}

	const otherShortcuts = [
		{ keys: ['Esc'], description: 'Go back' },
		{ keys: ['Ctrl', 'K'], description: 'Search' },
		{ keys: ['Ctrl', 'P'], description: 'New post' },
		{ keys: ['Ctrl', 'T'], description: 'Themes' }
	];
</script>

{#if loaded}
	<div
		bind:this={containerEl}
		class="fixed bottom-4 left-4 z-40 hidden lg:block"
		transition:fade={{ duration: 200 }}
	>
		{#if !expanded}
			<!-- Compact: Just the essential arrows -->
			<button
				class="flex items-center gap-1.5 bg-base-200/80 hover:bg-base-200 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-widget transition-all"
				on:click={(e) => toggle(e)}
				title="Click for more shortcuts"
			>
				<kbd
					class="kbd kbd-sm text-xs min-w-[1.5rem] text-center bg-sky-500 text-primary-content border-sky-500"
					>←</kbd
				>
				<span class="text-xs opacity-50">/</span>
				<kbd
					class="kbd kbd-sm text-xs min-w-[1.5rem] text-center bg-sky-500 text-primary-content border-sky-500"
					>→</kbd
				>
				<span class="text-[10px] opacity-60 ml-1">navigate</span>
				<span class="text-[10px] opacity-40 ml-0.5">+more</span>
			</button>
		{:else}
			<!-- Expanded: Full shortcuts panel -->
			<div
				class="bg-base-200/90 backdrop-blur-sm rounded-xl shadow-widget p-3 min-w-[220px]"
				transition:fly={{ y: 10, duration: 200 }}
			>
				<div class="flex items-center justify-between mb-3">
					<div class="flex items-center gap-2 text-xs font-medium opacity-70">
						<Icon icon="mdi:keyboard-outline" class="text-sm" />
						<span>Keyboard Shortcuts</span>
					</div>
					<div class="flex gap-1">
						<button
							class="btn btn-ghost btn-xs p-1 min-h-0 h-auto"
							on:click={(e) => toggle(e)}
							title="Collapse"
						>
							<Icon icon="mdi:chevron-down" class="text-sm" />
						</button>
						<button
							class="btn btn-ghost btn-xs p-1 min-h-0 h-auto text-error"
							on:click={dismiss}
							title="Don't show again"
						>
							<Icon icon="mdi:close" class="text-sm" />
						</button>
					</div>
				</div>

				<!-- Main shortcuts - always shown at top -->
				<div class="bg-info/10 rounded-lg p-2 mb-2 border border-primary/20">
					<div class="flex items-center justify-between gap-3">
						<span class="text-xs font-medium text-primary">Navigate between feeds</span>
						<span class="flex items-center gap-1 shrink-0">
							<kbd
								class="kbd kbd-sm text-xs min-w-[1.75rem] text-center bg-primary text-primary-content border-primary"
								>←</kbd
							>
							<span class="text-xs opacity-50">/</span>
							<kbd
								class="kbd kbd-sm text-xs min-w-[1.75rem] text-center bg-primary text-primary-content border-primary"
								>→</kbd
							>
						</span>
					</div>
				</div>

				<!-- Other shortcuts -->
				<div class="space-y-1.5 pt-1">
					{#each otherShortcuts as shortcut}
						<div class="flex items-center justify-between gap-3">
							<span class="text-xs opacity-60">{shortcut.description}</span>
							<span class="flex items-center gap-1 shrink-0">
								{#each shortcut.keys as key, i}
									<kbd class="kbd kbd-sm text-[10px] min-w-[1.5rem] text-center">{key}</kbd>
									{#if i < shortcut.keys.length - 1}
										<span class="text-xs opacity-40">+</span>
									{/if}
								{/each}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
