<script lang="ts">
	import _ from 'lodash';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	import VirtualList from 'src/components/VirtualList.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { ago, DAY, now } from 'src/lib/period';
	import { isKind, isKind1, isKind6, type AnyKind, type Kind1Parsed } from 'src/types';
	import { nostrManager, type SubscribeKind } from 'src/model/nostr';
	import type { ParsedEvent } from 'src/types';
	import Note from './note.svelte';
	import { formatDate } from 'date-fns';
	import type { NostrEvent } from 'nostr-tools';

	// Props
	export let bottom = false;
	export let subscriptionID: string;
	export let requests: any[] = [];
	export let updateFeed:
		| ((
				feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
				newEvents: ParsedEvent<AnyKind>[],
				eventKind: SubscribeKind
		  ) => [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][])
		| undefined = undefined;
	export let feed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	export let kinds: number[] | undefined = undefined;
	export let visible: boolean = true;
	export let backdrop: boolean = false;

	let cachedFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	let fetchedFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	// used in order to throttle fast incoming events
	let bufferFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	let newPosts: number = 0;
	let timeout: NodeJS.Timeout | undefined;
	let sub: () => void | undefined;

	let start = 0;
	let end = 0;

	let lastBufferDump = 0;

	let viewport: HTMLElement;
	let top: number = 0;

	let eose = false;
	let eoce = false;
	let loading = true;
	// Combined feed including the header item if provided
	$: combinedItems = feed;

	function isCorrectKind(event: NostrEvent) {
		return kinds != undefined ? kinds.some((k) => isKind(k)?.(event)) : isKind1;
	}

	// In a separate function to avoid infinite loops in the reactive block
	const handleEvents = (events: ParsedEvent<AnyKind>[], eventKind: SubscribeKind, page = 0) => {
		if (eventKind == 'EOSE' && !eose) {
			loading = false;
			eose = true;
			feed = _.uniqBy([...fetchedFeed, ...feed], (item) => item[0].id)
				.sort((a, b) => b[0].created_at - a[0].created_at)
				.slice(0, (page + 1) * 100);
			fetchedFeed = [];
			return;
		}
		if (eventKind == 'EOCE' && !eoce) {
			eoce = true;
			feed = [...feed, ...cachedFeed.slice(0, 100)];
			cachedFeed = [];
			return;
		}
		const [event, ...context] = events;
		if (!event?.parsed) return;
		if (updateFeed) {
			if (!eoce) {
				cachedFeed = updateFeed(cachedFeed, events, eventKind);
			} else if (!eose) {
				fetchedFeed = updateFeed(fetchedFeed, events, eventKind);
			} else {
				if (!page) {
					feed = updateFeed(feed, events, eventKind);
				}
			}
			return;
		}
		if (isCorrectKind(event)) {
			// only show replies to root posts
			if (event?.parsed?.reply?.id && event?.parsed?.root?.id != event?.parsed?.reply?.id) return;
			// check if the event is already in the feed
			if (!eoce) {
				// cached event are filtered and sorted in the worker
				cachedFeed = [...cachedFeed, [event, _.uniqBy(context, 'id')]];
			} else if (!eose) {
				fetchedFeed = [[event, _.uniqBy(context, 'id')], ...fetchedFeed];
			} else {
				if (!page) {
					bufferFeed.push([event, _.uniqBy(context, 'id')]);
				}
			}
		}
	};

	function subscribe() {
		timeout = setTimeout(() => {
			if (visible) {
				eoce = false;
				eose = false;
				cachedFeed = [];
				sub = nostrManager.subscribe(subscriptionID, requests, handleEvents);
			}
		}, 300);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			sub?.();
		}
	}

	function setBufferFeed() {
		newPosts = start > bufferFeed.length ? bufferFeed.length : start;
		feed = [...feed, ...bufferFeed]
			.sort((a, b) => b[0].created_at - a[0].created_at)
			.slice(0, (lastPageFetch + 1) * 100);
		bufferFeed = [];

		lastBufferDump = now();
	}

	onMount(() => {
		const interval = setInterval(() => {
			if (loading) loading = false;
			if (now() - lastBufferDump > 2 && !!bufferFeed.length) {
				setBufferFeed();
			}
		}, 2000);
		return () => {
			unsubscribe();
			clearInterval(interval);
		};
	});

	$: page = Math.floor(end / 100);

	let lastPageFetch = 0;

	// pagination
	$: {
		if (end % 100 > 80) {
			if (lastPageFetch <= page) {
				lastPageFetch++;

				eose = false;
				eoce = false;
				// get the last item in the feed
				const lastEvent = feed[feed.length - 1][0];
				// get the next page results from the cache
				const pageSub = nostrManager.subscribe(
					subscriptionID + page,
					requests.map((r) => ({
						...r,

						until: lastEvent.created_at,
						since: lastEvent.created_at - (r?.since ? now() - r.since : 30 * DAY)
					})),
					(events: ParsedEvent<AnyKind>[], eventKind: SubscribeKind) => {
						handleEvents(events, eventKind, lastPageFetch);
						if (eventKind == 'EOSE') {
							// stop the sub on EOSE
							pageSub();
						}
					}
				);
			}
		}
	}

	function decreaseNewPosts() {
		newPosts--;
	}

	$: start < newPosts && decreaseNewPosts();

	$: visible && requests && requests.length ? subscribe() : unsubscribe();
</script>

<div
	class={'lg:pt-0 overflow-scroll scrollbar-hide h-full min-h-screen m-auto !pt-0 ' + $$props.class}
>
	{#if start >= 1}
		<!-- Fixed header (only visible when scrolled) -->
		<div class="absolute z-10 w-full">
			<div class="w-feed m-auto" on:click={() => viewport.scrollTo({ top: 0, behavior: 'smooth' })}>
				<slot name="sticky-header" visible={true} scrolled={true} {newPosts} />
			</div>
		</div>
	{/if}
	<div class="absolute z-10 w-full">
		<div class="w-feed m-auto">
			<slot name="fixed-header" {start} />
		</div>
	</div>
	<svelte:component
		this={bottom ? VirtualListBottom : VirtualList}
		items={combinedItems}
		bind:start
		bind:end
		bind:viewport
		bind:top
		getItemId={(item) => item.data[0]?.id}
		let:item
		{backdrop}
	>
		{@const repost = isKind6(item[0]) && item[0].pubkey}
		<svelte:fragment slot="feed-header">
			<slot name="header" visible>Missing Template</slot>
		</svelte:fragment>
		<div class="block w-feed m-auto px-1 max-w-full">
			<slot
				name="item-content"
				post={item[0]}
				context={item[1]}
				visible={visible && feed.findIndex((note) => note[0]?.id === item[0].id) >= start - 2}
			>
				<Note
					note={repost ? item[0]?.parsed.repostedEvent : item[0]}
					context={item[1]}
					visible={visible && feed.findIndex((note) => note[0]?.id === item[0].id) >= start - 2}
					{repost}
				/>
			</slot>
		</div>
		{#if loading}
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
	</svelte:component>
</div>
