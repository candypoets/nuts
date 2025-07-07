<script lang="ts">
	import _ from 'lodash';
	import { onMount } from 'svelte';
	import Fuse from 'fuse.js';

	import type { NostrEvent } from 'nostr-tools';
	import VirtualList from 'src/components/VirtualList.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { DAY, now } from 'src/lib/period';
	import { nostrManager, useSharedSubscription, type SubscribeKind } from 'src/model/nostr-main';
	import type { ParsedEvent } from 'src/types';
	import { isKind, isKind1, isKind6, type AnyKind, type Kind1Parsed } from 'src/types';
	import Note from './note.svelte';
	import { slide } from 'svelte/transition';

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
	export let search: string = '';
	export let fuseKeys: string[] = [];
	export let itemHeight: number;
	export let initialItems: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] = [];

	let cachedFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	let fetchedFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	// used in order to throttle fast incoming events
	let bufferFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	let newPosts: number = 0;
	let timeout: NodeJS.Timeout | undefined;
	let sub: () => void | undefined;
	let fuse: Fuse<any>;
	let filteredFeed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] = [];

	let start = 0;
	let end = 0;

	let lastBufferDump = 0;

	let viewport: HTMLElement;
	let down = true; // is the virtualScrool going down

	let eose = false;
	let eoce = false;
	let loading = true;

	function makeFuse() {
		if (fuseKeys.length > 0 && feed.length > 0) {
			fuse = new Fuse<any>(feed, {
				keys: fuseKeys,
				threshold: 0.4,
				includeScore: true
			});
		}
	}

	function isCorrectKind(event: NostrEvent) {
		return kinds != undefined ? kinds.some((k) => isKind(k)?.(event)) : isKind1;
	}

	// In a separate function to avoid infinite loops in the reactive block
	const handleEvents = (events: ParsedEvent<AnyKind>[], eventKind: SubscribeKind, page = 0) => {
		if (eventKind == 'EOSE') {
			if (events.remainingConnections / events.totalConnections <= 0.8 && eose == false) {
				loading = false;
				eose = true;
				feed = _.uniqBy([...fetchedFeed, ...feed], (item) => item[0].id)
					.sort((a, b) => b[0].created_at - a[0].created_at)
					.slice(0, (page + 1) * 100);
				// console.log(subscriptionID, 'ok', feed);
				// makeFuse();
				fetchedFeed = [];
			}
			return;
		}
		if (eventKind == 'EOCE' && !eoce) {
			eoce = true;
			feed = [...initialItems, ...cachedFeed.slice(0, 100)];
			cachedFeed = [];
			// makeFuse();
			return;
		}
		const [event, ...context] = events;
		if (!event?.parsed) return;
		if (updateFeed && isCorrectKind(event)) {
			if (!eoce) {
				cachedFeed = updateFeed(cachedFeed, events, eventKind);
			} else if (!eose) {
				fetchedFeed = updateFeed(fetchedFeed, events, eventKind);
			} else {
				if (!page) {
					feed = updateFeed(feed, events, eventKind);
					// makeFuse();
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
				// feed = [];

				sub = useSharedSubscription(subscriptionID, requests, handleEvents);
			}
		}, 300);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			console.log(subscriptionID, 'feed unsubscribe');
			// feed = [];
			sub?.();
		}
	}

	function setBufferFeed() {
		newPosts = start > bufferFeed.length ? bufferFeed.length : start;
		feed = [...feed, ...fetchedFeed, ...bufferFeed]
			.sort((a, b) => b[0].created_at - a[0].created_at)
			.slice(0, lastPageFetch + 1 * 100);
		bufferFeed = [];

		lastBufferDump = now();

		// makeFuse();
	}

	onMount(() => {
		const interval = setInterval(() => {
			if (loading) loading = false;
			if (now() - lastBufferDump > 2 && !!bufferFeed.length) {
				setBufferFeed();
			}
		}, 1000);

		return () => {
			unsubscribe();
			clearInterval(interval);
		};
	});

	$: page = Math.floor(end / 100);

	let lastPageFetch = 0;

	// pagination
	// $: {
	// 	if (end % 100 > 80) {
	// 		if (lastPageFetch <= page) {
	// 			lastPageFetch++;

	// 			eose = false;
	// 			eoce = false;
	// 			// get the last item in the feed
	// 			const lastEvent = feed[feed.length - 1][0];
	// 			// get the next page results from the cache
	// 			const pageSub = useSharedSubscription(
	// 				subscriptionID + page,
	// 				requests.map((r) => ({
	// 					...r,
	// 					until: lastEvent.created_at,
	// 					since: lastEvent.created_at - (r?.since ? now() - r.since : 30 * DAY)
	// 				})),
	// 				(events: ParsedEvent<AnyKind>[], eventKind: SubscribeKind) => {
	// 					handleEvents(events, eventKind, lastPageFetch);
	// 					if (eventKind == 'EOSE') {
	// 						// stop the sub on EOSE
	// 						pageSub?.();
	// 					}
	// 				}
	// 			);
	// 		}
	// 	}
	// }

	function decreaseNewPosts() {
		newPosts--;
	}

	$: start < newPosts && decreaseNewPosts();

	$: visible && requests && requests.length ? subscribe() : unsubscribe();

	// Filter feed based on search query
	$: {
		if (search && fuse) {
			const results = fuse.search(search);
			filteredFeed = results.map((result) => result.item) as [
				ParsedEvent<AnyKind>,
				ParsedEvent<AnyKind>[]
			][];
		} else {
			filteredFeed = feed as [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][];
		}
	}
</script>

<div
	class={'lg:pt-0 overflow-scroll scrollbar-hide h-full min-h-screen m-auto !pt-0 ' + $$props.class}
>
	{#if start >= 1}
		<!-- Fixed header (only visible when scrolled) -->
		<div class="absolute z-10 w-full sticky-header" style="--header-visible: {down ? 0 : 1};">
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
		items={search ? filteredFeed : feed}
		bind:start
		bind:end
		bind:viewport
		bind:down
		getItemId={(item) => item.data[0]?.id}
		let:item
		{itemHeight}
		{backdrop}
		{loading}
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
					note={repost ? { ...item[0]?.parsed.repostedEvent, requests: item[0].requests } : item[0]}
					context={item[1]}
					visible={visible && feed.findIndex((note) => note[0]?.id === item[0].id) >= start - 2}
					{repost}
				/>
			</slot>
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
		will-change: opacity, transform;
		contain: layout style paint;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}
</style>
