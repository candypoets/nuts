<script lang="ts">
	import { getContext, setContext } from 'svelte';
	import { writable, type Writable } from 'svelte/store';
	import VirtualList from 'src/components/VirtualList.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
		import Note from './note.svelte';
	import Placeholder from 'src/components/Placeholder.svelte';

	// Generic type for feed items
	type T = $$Generic;

	// Props - Core presentation props
	export let items: T[] = [];
	export let getItemId: (item: T) => string | number = (item: any) => item?.id?.() ?? Math.random();
	export let loading = false;

	// Layout/behavior props
	export let bottom = false;
	export let visible: boolean = true;
	export let backdrop: boolean = false;
	export let itemHeight: number | undefined = undefined;
	export let pullToRefresh = false;
	export let itemsPerRow = 1;
	export let stickyFooterVisible = false;

	// Viewport state - exported for parent binding (two-way bindable)
	export let start = 0;
	export let end = 0;
	export let down = true;
	export let viewport: HTMLElement | undefined = undefined;

	// Callback props
	export let onRefresh: (() => void | Promise<void>) | undefined = undefined;
	export let onNearBottom: ((event: { distance: number }) => void) | undefined = undefined;

	// Threshold for triggering onNearBottom (items remaining)
	export let nearBottomThreshold = 10;

	// Track if we've already triggered onNearBottom for current scroll position
	let nearBottomTriggered = false;
	let lastItemsLength = 0;

	// Reset trigger when user scrolls back to top OR when new items are loaded
	$: if (start === 0 || items.length > lastItemsLength) {
		nearBottomTriggered = false;
		lastItemsLength = items.length;
	}

	// Reactive: emit onNearBottom when end is within threshold of items.length
	// Only trigger when user has scrolled (start > 0) to avoid firing on initial load
	$: if (onNearBottom && items.length > 0 && start > 0 && !nearBottomTriggered) {
		const distance = items.length - end;
		if (distance <= nearBottomThreshold && distance >= 0) {
			nearBottomTriggered = true;
			onNearBottom({ distance });
		}
	}

	// Using a Svelte store so VirtualList gets reactive updates
	const heightRegistry: Writable<Map<string | number, number>> = writable(new Map());

	const noteHeightsContext = {
		// Set height for an item (called by Placeholder via ResizeObserver)
		setHeight: (id: string | number, height: number) => {
			heightRegistry.update(m => {
				m.set(id, height);
				return m;
			});
		},
		// Delete height entry when item unmounts
		deleteHeight: (id: string | number) => {
			heightRegistry.update(m => {
				m.delete(id);
				return m;
			});
		},
		// Get current height value (synchronous for VirtualList)
		getHeight: (id: string | number): number => {
			return $heightRegistry.get(id) ?? itemHeight ?? 200;
		},
		// Expose the store for reactive subscriptions
		heightRegistry
	};

	setContext('noteHeights', noteHeightsContext);

	const imageContext = getContext('imageContext');
</script>

<div class={'lg:pt-0 h-full min-h-screen mx-auto !pt-0 ' + $$props.class}>
	{#if start >= 1}
		<!-- Fixed header (only visible when scrolled) -->
		<div class="absolute z-10 w-full sticky-header" style="--header-visible: {down ? 0 : 1};">
			<div
				class="w-feed m-auto"
				style="-webkit-backdrop-filter: blur(12px);"
				on:click={() => viewport?.scrollTo({ top: 0, behavior: 'smooth' })}
			>
				<slot name="sticky-header" visible={true} scrolled={true} />
			</div>
		</div>
	{/if}
	<!-- Fixed footer (only visible when scrolled) -->
	<div
		class="fixed bottom-0 z-10 w-full sticky-footer"
		style="--footer-visible: {stickyFooterVisible || !down || (start < 1 ? 1 : 0)};"
	>
		<div class="m-auto" class:w-feed={!imageContext}>
			<slot name="sticky-footer" visible={true} scrolled={true} />
		</div>
	</div>
	<div class="absolute z-10 w-full">
		<div class="w-feed m-auto">
			<slot name="fixed-header" {start} />
		</div>
	</div>
	<svelte:component
		this={bottom ? VirtualListBottom : VirtualList}
		{items}
		bind:start
		bind:end
		bind:viewport
		bind:down
		{getItemId}
		let:item
		let:items
		let:itemIndex
		{itemsPerRow}
		{itemHeight}
		{backdrop}
		{loading}
		{onRefresh}
		{pullToRefresh}
	>
		{@const screenVisible = itemIndex >= start - 5}
		{@const subVisible = visible && screenVisible}
		<svelte:fragment slot="feed-header">
			<slot name="header" visible>Missing Template</slot>
		</svelte:fragment>
		<svelte:fragment slot="empty-content">
			<slot name="empty-content" />
		</svelte:fragment>
			<div class="block w-feed m-auto px-1 max-w-full">
				<Placeholder id={getItemId(item)} visible={screenVisible}>
					<slot
						name="item-content"
						post={item}
						posts={itemsPerRow > 1 ? items : undefined}
						visible={subVisible}
						index={itemIndex}
					>
						<Note note={item} context={[]} visible={subVisible} zaps />
					</slot>
				</Placeholder>
			</div>
	</svelte:component>
</div>

<style>
	.sticky-header {
		opacity: var(--header-visible);
		transform: translate3d(0, calc((1 - var(--header-visible)) * -100%), 0);
		transition:
			opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		contain: layout style;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}

	.sticky-footer {
		opacity: var(--footer-visible);
		transform: translate3d(0, calc((1 - var(--footer-visible)) * 100%), 0);
		transition:
			opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		contain: layout style;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}

	@supports not (bottom: env(keyboard-inset-height)) {
		.sticky-footer {
			bottom: max(0px, env(safe-area-inset-bottom));
		}
	}
</style>
