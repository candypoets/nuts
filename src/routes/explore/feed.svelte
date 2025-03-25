<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import VirtualList from 'src/comp/VirtualList.svelte';
	import { updateVc } from 'src/lib';
	import { isKind1, type AnyKind, type Kind1Parsed } from 'src/parsers';
	import { posting } from 'src/stores';
	import { nostrManager, type EventKind } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { crossfade, fly } from 'svelte/transition';
	import Note from './note.svelte';

	// Props
	export let subscriptionID: string;
	export let headerItem: ParsedEvent<AnyKind> | undefined = undefined;
	export let requests: any[] = [];
	export let updateFeed:
		| ((
				feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
				newEvents: ParsedEvent<AnyKind>[],
				eventKind: EventKind
		  ) => [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][])
		| undefined = undefined;

	let feed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	let newPosts: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];

	let start = 0;
	let end = 0;

	let viewport: HTMLElement;
	let top: number = 0;
	let oldTop = 0;

	let topper: HTMLElement;
	let footer: HTMLElement;
	let fadein = false;

	let eoses = 0;

	// Combined feed including the header item if provided
	$: combinedItems = headerItem ? [headerItem, ...feed] : feed;

	// In a separate function to avoid infinite loops in the reactive block
	const handleEvents = (events: ParsedEvent<AnyKind>[], eventKind: EventKind) => {
		if (eventKind == 'EOSE') {
			// eoses++;
			return;
		}
		const [event, ...context] = events;
		if (!event.parsed) return;
		if (updateFeed) {
			feed = updateFeed(feed, events, eventKind);
			return;
		}
		if (isKind1(event)) {
			// only show replies to root posts
			if (event?.parsed?.reply?.id && event?.parsed?.root?.id != event?.parsed?.reply?.id) return;
			// check if the event is already in the feed
			// if (feed.some(([e]) => e.id === event.id)) return;
			if (eventKind == 'CACHED_EVENT') {
				// cached event are filtered in the worker
				feed = [...feed, [event, _.uniqBy(context, 'id')]];
			} else if (eventKind == 'FETCHED_EVENT') {
				if (event.created_at >= feed?.[0]?.[0]?.created_at) {
					feed = [[event, _.uniqBy(context, 'id')], ...feed];
				} else {
					// Add the event to the feed and sort by created_at (most recent first)
					feed = [...feed, [event, _.uniqBy(context, 'id')]].sort(
						(a, b) => b[0].created_at - a[0].created_at
					);
				}
			}
		}
	};

	$: {
		if (requests && requests.length) {
			setTimeout(() => {
				console.log('SUBSCRIBING: ', subscriptionID, requests, handleEvents);
				nostrManager.subscribe(subscriptionID, requests, handleEvents);
			}, 100);
		}
	}

	onMount(() => {
		updateVc();
		// nostrManager.subscribe(subscriptionID, requests, handleEvents);
		return () => {
			console.log('UNSUBSCRIBING: ', subscriptionID, requests);
			nostrManager.unsubscribe(subscriptionID);
		};
	});

	$: {
		if (top > oldTop + 25) {
			topper?.classList.add('toggle-up');
			footer?.classList.add('blur-in');
			fadein = true;
			oldTop = top;
		} else if (top < oldTop - 25) {
			topper?.classList.remove('toggle-up');
			footer?.classList.remove('blur-in');
			fadein = false;
			oldTop = top;
		} else if (top == 0) {
			topper?.classList.remove('toggle-up');
			footer?.classList.remove('blur-in');
			fadein = false;
			oldTop = top;
		}
	}
</script>

<div
	class="lg:pt-0 overflow-scroll scrollbar-hide container-height lg:h-screen lg:container-height m-auto !pt-0"
	on:click={() => {
		$posting = false;
		// goto('/explore');
	}}
	id="container"
>
	<button
		class="p-4 bg-primary rounded-full text-white fixed bottom-28 lg:bottom-4 lg:right-1/3 right-4 z-10 border-opacity-0 lg:translate-x-20"
		class:bg-opacity-10={fadein}
		on:click={(e) => {
			e.stopPropagation();
			$posting = true;
		}}
	>
		<Icon icon="teenyicons:add-outline" class="text-2xl" />
	</button>

	<div class="absolute top-6 w-full z-40" transition:fly={{ y: -50, duration: 300 }}>
		{#if newPosts.length}
			<div
				class="flex justify-center cursor-pointer"
				on:click={() => {
					viewport.scrollTo({ top: 0, behavior: 'smooth' });
					feed = _.uniqBy([...newPosts, ...feed], 'id');
					newPosts = [];
				}}
			>
				<div class="bg-primary text-white text-sm py-1 px-2 rounded-lg">
					{newPosts.length} new posts
				</div>
			</div>
		{/if}
	</div>

	<VirtualList
		items={combinedItems}
		bind:start
		bind:end
		bind:viewport
		bind:top
		getItemId={(item) => (headerItem && item.index == 0 ? 'header-item' : item.data[0]?.id)}
		let:item
	>
		{#if headerItem && item.id == headerItem?.id}
			<!-- Regular header in normal document flow (only visible at the top) -->
			<!-- <div class="relative w-feed m-auto">
					<slot name="sticky-header" visible={true} scrolled={false} />
				</div> -->
			{#if start >= 1}
				<!-- Fixed header (only visible when scrolled) -->
				<div class="fixed left-0 top-0 right-0 w-full z-30 backdrop-blur bg-base-100 bg-opacity-50">
					<div class="w-feed m-auto">
						<slot name="sticky-header" visible={true} scrolled={true} />
					</div>
				</div>
			{/if}
			<!-- Render header item -->
			<div
				class="block w-feed lg:m-auto py-1 px-1 max-w-full"
				transition:fly={{ y: 200, duration: 300 }}
				id="header"
			>
				<!-- Render custom header content -->
				<slot name="header-content" {item} visible={start < 1} />
			</div>
		{:else}
			{@const post = item[0]}
			{@const context = item[1]}
			{@const visible = feed.findIndex((note) => note[0]?.id === post.id) >= start - 2}
			<div class="block w-feed lg:m-auto py-1 px-1 max-w-full">
				<slot name="item-content" {post} {context} {visible}>
					<Note note={post} {context} {visible} />
				</slot>
			</div>
		{/if}
		{#if !feed.length}
			<div
				class="lg:pt-0 overflow-scroll scrollbar-hide container-height lg:container-height m-auto w-feed !pt-0"
			>
				{#each Array(8) as _}
					<div class="lg:hover:bg-base-200 rounded-md pt-2 px-1 mb-4 first:pt-16">
						<div class="flex items-center mb-2">
							<div class="w-10 h-10 rounded-full shimmer"></div>
							<div class="ml-2 flex-grow">
								<div class="h-4 rounded w-1/4 shimmer"></div>
								<div class="h-3 rounded w-1/3 mt-1 shimmer"></div>
							</div>
						</div>
						<div class="h-16 rounded shimmer"></div>
						<div class="flex justify-between mt-2">
							<div class="h-4 rounded w-1/6 shimmer"></div>
							<div class="h-4 rounded w-1/6 shimmer"></div>
							<div class="h-4 rounded w-1/6 shimmer"></div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</VirtualList>
</div>
