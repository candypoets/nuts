<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import { fly, fade } from 'svelte/transition';

	let collapsed = true;
	let loaded = false;
	let containerEl: HTMLDivElement;

	onMount(() => {
		// Check if user has dismissed it before
		const dismissed = localStorage.getItem('shortcuts-guide-dismissed');
		if (dismissed === 'true') {
			collapsed = true;
		} else {
			// Auto-expand on first visit, then collapse after 5 seconds
			collapsed = false;
			setTimeout(() => {
				collapsed = true;
			}, 5000);
		}
		loaded = true;

		// Add click outside listener
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function toggle(event?: MouseEvent) {
		event?.stopPropagation();
		collapsed = !collapsed;
	}

	function dismiss() {
		localStorage.setItem('shortcuts-guide-dismissed', 'true');
		collapsed = true;
	}

	function handleClickOutside(event: MouseEvent) {
		if (!collapsed && containerEl && !containerEl.contains(event.target as Node)) {
			collapsed = true;
		}
	}

	const shortcuts = [
		{ keys: ['←', '→'], description: 'Navigate feeds', separator: '/' },
		{ keys: ['Esc'], description: 'Go back' },
		{ keys: ['Ctrl', 'K'], description: 'Search' },
		{ keys: ['Ctrl', 'P'], description: 'New post' },
		{ keys: ['Ctrl', 'T'], description: 'Themes' }
	];

	function formatKeys(keys: string[], separator?: string) {
		if (separator && keys.length === 2) {
			return `${keys[0]} ${separator} ${keys[1]}`;
		}
		return keys.join(' + ');
	}
</script>

{#if loaded}
	<div
		bind:this={containerEl}
		class="fixed top-4 left-4 z-40 hidden lg:block"
		transition:fade={{ duration: 200 }}
	>
		{#if collapsed}
			<!-- Collapsed: Just a hint button -->
			<button
				class="btn btn-ghost btn-sm gap-2 text-xs opacity-60 hover:opacity-100 transition-opacity"
				on:click={(e) => toggle(e)}
				title="Show keyboard shortcuts"
			>
				<Icon icon="mdi:keyboard-outline" class="text-lg" />
				<span class="text-[10px]">Shortcuts</span>
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

				<div class="space-y-2">
					{#each shortcuts as shortcut}
						<div class="flex items-center justify-between gap-3">
							<span class="text-xs opacity-70">{shortcut.description}</span>
							<span class="flex items-center gap-1 shrink-0">
								{#if shortcut.separator && shortcut.keys.length === 2}
									<kbd class="kbd kbd-sm text-[10px] min-w-[1.5rem] text-center">{shortcut.keys[0]}</kbd>
									<span class="text-xs opacity-50">{shortcut.separator}</span>
									<kbd class="kbd kbd-sm text-[10px] min-w-[1.5rem] text-center">{shortcut.keys[1]}</kbd>
								{:else}
									{#each shortcut.keys as key, i}
										<kbd class="kbd kbd-sm text-[10px] min-w-[1.5rem] text-center">{key}</kbd>
										{#if i < shortcut.keys.length - 1}
											<span class="text-xs opacity-50">+</span>
										{/if}
									{/each}
								{/if}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
