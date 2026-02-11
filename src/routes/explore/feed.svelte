<script lang="ts">
	import { getContext } from 'svelte';

	import VirtualList from 'src/components/VirtualList.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import Note from './note.svelte';
	import Placeholder from 'src/components/Placeholder.svelte';

	// Generic type for feed items
	type T = $$Generic;

	// Props - Core presentation props
	export let items: T[] = [];
	export let getItemId: (item: T) => string | number = (item: any) =>
		item?.id?.()?.fnv1aHash?.() ?? Math.random();
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

	const imageContext = getContext('imageContext');
</script>

<div class={'lg:pt-0 h-full min-h-screen mx-auto !pt-0 ' + $$props.class}>
	{#if start >= 1}
		<!-- Fixed header (only visible when scrolled) -->
		<div class="absolute z-10 w-full sticky-header" style="--header-visible: {down ? 0 : 1};">
			<div
				class="w-feed m-auto backdrop-blur-md"
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
		{@const repost = item?.kind && item?.repostedEvent}
		{@const screenVisible = itemIndex >= start - 10}
		{@const subVisible = visible}
		<svelte:fragment slot="feed-header">
			<slot name="header" visible>Missing Template</slot>
		</svelte:fragment>
		<svelte:fragment slot="empty-content">
			<slot name="empty-content" />
		</svelte:fragment>
		<div class="block w-feed m-auto px-1 max-w-full">
			<Placeholder visible={screenVisible}>
				<slot
					name="item-content"
					post={item}
					posts={itemsPerRow > 1 ? items : undefined}
					visible={subVisible}
					index={itemIndex}
				>
					<Note
						note={repost ? item?.repostedEvent?.() : item}
						context={[]}
						visible={subVisible}
						showRoot={!repost}
						{repost}
					/>
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
		contain: layout style paint;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}

	.sticky-footer {
		opacity: var(--footer-visible);
		transform: translate3d(0, calc((1 - var(--footer-visible)) * 100%), 0);
		transition:
			opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		contain: layout style paint;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}

	@supports not (bottom: env(keyboard-inset-height)) {
		.sticky-footer {
			bottom: max(0px, env(safe-area-inset-bottom));
		}
	}
</style>
