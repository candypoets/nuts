<script lang="ts">
	import Fuse from 'fuse.js';
	import _ from 'lodash';
	import { onMount } from 'svelte';

	import type { NostrEvent } from 'nostr-tools';
	import VirtualList from 'src/components/VirtualList.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { now } from 'src/lib/period';
	import Note from './note.svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { limit } from 'src/controller/pagination';
	import { isKind, isKind1, isKind6 } from '@candypoets/nipworker/utils';
	import { cleanup, type SubscriptionOptions } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import type {
		ParsedEvent,
		AnyKind,
		SubscribeKind,
		Kind1Parsed
	} from 'node_modules/@candypoets/nipworker/dist/types';

	// Props
	export let bottom = false;
	export let subscriptionID: string;
	export let requests: any[] = [];
	export let subscriptionOptions: SubscriptionOptions | undefined = undefined;
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
	export let itemHeight: number | undefined = undefined;
	export let initialItems: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] = [];

	let cachedFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	let fetchedFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	// used in order to throttle fast incoming events
	let bufferFeed: [ParsedEvent<Kind1Parsed>, ParsedEvent<AnyKind>[]][] = [];
	let newPosts: number = 0;
	let timeout: NodeJS.Timeout | undefined;
	let sub: () => void | undefined;
	let pagesub: () => void | undefined;

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
			if (eose == false && events.remainingConnections / events.totalConnections < 1) {
				loading = false;
				eose = true;
				if (page == 0) {
					feed = _.uniqBy([...fetchedFeed, ...feed], (item) => item[0].id).sort(
						(a, b) => b[0].created_at - a[0].created_at
					);
				} else {
					feed = _.uniqBy(
						[...feed, ...fetchedFeed.sort((a, b) => b[0].created_at - a[0].created_at)],
						(item) => item[0].id
					);
				}
				// makeFuse();
				fetchedFeed = [];
			}
			return;
		}
		if (eventKind == 'EOCE' && !eoce) {
			eoce = true;
			if (page == 0) {
				feed = [...feed, ...initialItems, ...cachedFeed];
			} else {
				feed = [...feed, ...cachedFeed];
			}
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
				feed = updateFeed(feed, events, eventKind);
				// makeFuse();
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
				bufferFeed.push([event, _.uniqBy(context, 'id')]);
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
				sub = useSubscription(subscriptionID, requests, handleEvents, subscriptionOptions);
			}
		}, 300);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			// feed = [];
			sub?.();
		}
	}

	function setBufferFeed() {
		newPosts = start > bufferFeed.length ? bufferFeed.length : start;
		feed = [...feed, ...fetchedFeed, ...bufferFeed].sort(
			(a, b) => b[0].created_at - a[0].created_at
		);
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

	let currentPage = 0;
	let lastFeedLength = 0;
	let noResultsCount = 0;
	let sinceMultiplier = 1;

	$: {
		if (start != 0 && end == feed.length && !!eose && noResultsCount <= 3) {
			eoce = false;
			eose = false;
			setTimeout(() => (eose = true), 2000);
			// Check if the last pagesub yielded new results
			if (lastFeedLength == feed.length) {
				noResultsCount++;
				// Exponential increase in since range
				sinceMultiplier *= 5;
			} else {
				// Reset counters if we got new results
				noResultsCount = 0;
				sinceMultiplier = 1;
			}

			lastFeedLength = feed.length;

			currentPage++;
			setTimeout(() => {
				pagesub?.();
				cleanup();
				const until = feed[Math.min(currentPage * $limit, feed.length - 1)][0].created_at;
				const since = until - (currentPage + 2) * 24 * 60 * 60 * sinceMultiplier;
				pagesub = useSubscription(
					subscriptionID + since,
					requests.map((r) => ({ ...r, until, since })),
					(events: ParsedEvent<AnyKind>[], eventKind: SubscribeKind) =>
						handleEvents(events, eventKind, currentPage)
				);
			}, noResultsCount * 1000);
		}
	}
</script>

<div class="fixed bottom-4 left-4 text-white">
	{start} - {end} - {feed.length}
</div>
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

	<!-- {#if start >= 1} -->
	<!-- Fixed footer (only visible when scrolled) -->
	<div
		class="fixed bottom-0 z-10 w-full sticky-footer"
		style="--footer-visible: {!down || start < 1 ? 1 : 0};"
	>
		<div class="w-feed m-auto">
			<slot name="sticky-footer" visible={true} scrolled={true} {newPosts} />
		</div>
	</div>
	<!-- {/if} -->
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

	.sticky-footer {
		opacity: var(--footer-visible);
		transform: translate3d(0, calc((1 - var(--footer-visible)) * 100%), 0);
		transition:
			opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		will-change: opacity, transform;
		contain: layout style paint;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		/* Stay above keyboard on mobile */
		/* bottom: env(keyboard-inset-height, 0); */
	}

	/* Fallback for older browsers */
	@supports not (bottom: env(keyboard-inset-height)) {
		.sticky-footer {
			/* Use viewport height units for better keyboard handling */
			bottom: max(0px, env(safe-area-inset-bottom));
		}
	}
</style>
