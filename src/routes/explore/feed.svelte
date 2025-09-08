<script lang="ts">
	import type { ParsedData, ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import {
		cleanup,
		MessageType,
		type ConnectionStatus,
		type NostrManager,
		type SubscriptionOptions
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind6,
		asParsedEvent,
		isKind1,
		isKind6
	} from '@candypoets/nipworker/utils';
	import Fuse from 'fuse.js';
	import _ from 'lodash';
	import { onMount } from 'svelte';

	import VirtualList from 'src/components/VirtualList.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { limit } from 'src/controller/pagination';
	import { now } from 'src/lib/period';
	import Note from './note.svelte';

	// Props
	export let bottom = false;
	export let subscriptionID: string;
	export let requests: any[] = [];
	export let subscriptionOptions: SubscriptionOptions | undefined = undefined;
	export let manager: NostrManager | undefined = undefined;
	export let updateFeed:
		| ((feed: ParsedEvent[], newEvent: WorkerMessage) => ParsedEvent[])
		| undefined = undefined;
	export let feed: ParsedEvent[] = [];
	export let kinds: ParsedData[] | undefined = undefined;
	export let visible: boolean = true;
	export let backdrop: boolean = false;
	export let search: string = '';
	export let fuseKeys: string[] = [];
	export let itemHeight: number | undefined = undefined;
	export let initialItems: ParsedEvent[] = [];

	export let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let cachedFeed: ParsedEvent[] = [];
	let fetchedFeed: ParsedEvent[] = [];
	// used in order to throttle fast incoming events
	let bufferFeed: ParsedEvent[] = [];
	let newPosts: number = 0;
	let timeout: NodeJS.Timeout | undefined;
	let sub: () => void | undefined;
	let pagesub: () => void | undefined;
	let headsub: () => void | undefined;

	let fuse: Fuse<any>;
	let filteredFeed: ParsedEvent[] = [];

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

	function isCorrectKind(event: ParsedEvent) {
		return kinds != undefined ? kinds.some((k) => event.kind() == k) : isKind1;
	}

	// In a separate function to avoid infinite loops in the reactive block
	const handleEvents = (message: WorkerMessage, page = 0) => {
		switch (message.type()) {
			case MessageType.BufferFull:
				let since = feed.length > 0 ? Number(feed[0].createdAt()) : now();
				headsub?.();
				cleanup();
				headsub = useSubscription(
					subscriptionID + '_head',
					requests.map((r) => ({ ...r, since })),
					handleEvents
				);
				break;
			case MessageType.ConnectionStatus:
				const status = asConnectionStatus(message);
				if (status) {
					connectionStatus[status.relayUrl()!.fnv1aHash()] = status;
					if (status.status()!.toString() == 'EOSE' && eose == false) {
						// if (eose == false && events.remainingConnections / events.totalConnections < 1) {
						loading = false;
						eose = true;
						if (page == 0) {
							feed = _.uniqBy([...fetchedFeed, ...feed], (item) => item.id()!.fnv1aHash()).sort(
								(a, b) => Number(b.createdAt() - a.createdAt())
							);
						} else {
							feed = _.uniqBy(
								[...feed, ...fetchedFeed.sort((a, b) => Number(b.createdAt() - a.createdAt()))],
								(item) => item.id()!.fnv1aHash()
							);
						}
						fetchedFeed = [];
					}
				}
				break;
			case MessageType.Eoce:
				if (!eoce) {
					eoce = true;
					if (page == 0) {
						feed = [...feed, ...initialItems, ...cachedFeed];
					} else {
						feed = [...feed, ...cachedFeed];
					}
					console.log('cache done', subscriptionID);
					cachedFeed = [];
					// makeFuse();
				}
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (updateFeed && parsedEvent && isCorrectKind(parsedEvent)) {
					if (!eoce) {
						cachedFeed = updateFeed(cachedFeed, message);
					} else if (!eose) {
						fetchedFeed = updateFeed(fetchedFeed, message);
					} else {
						feed = updateFeed(feed, message);
						// makeFuse();
					}
					break;
				}

				const kind1 = isKind1(message);
				if (parsedEvent && kind1) {
					// only show replies to root posts
					if (
						kind1.reply()?.id() &&
						kind1?.root()?.id()!.fnv1aHash() != kind1.reply()!.id()!.fnv1aHash()
					)
						return;
					// check if the event is already in the feed
					if (!eoce) {
						// cached event are filtered and sorted in the worker
						cachedFeed = [...cachedFeed, parsedEvent];
					} else if (!eose) {
						fetchedFeed = [parsedEvent, ...fetchedFeed];
					} else {
						bufferFeed.push(parsedEvent);
					}
				}
				break;
		}
	};

	function subscribe() {
		timeout = setTimeout(() => {
			if (visible) {
				eoce = false;
				eose = false;
				cachedFeed = [];
				// feed = [];
				sub = useSubscription(subscriptionID, requests, handleEvents, subscriptionOptions, manager);
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
		feed = [...feed, ...fetchedFeed, ...bufferFeed].sort((a, b) =>
			Number(b.createdAt() - a.createdAt())
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
	// $: {
	// 	if (search && fuse) {
	// 		const results = fuse.search(search);
	// 		filteredFeed = results.map((result) => result.item) as [
	// 			ParsedEvent<AnyKind>,
	// 			ParsedEvent<AnyKind>[]
	// 		][];
	// 	} else {
	// 		filteredFeed = feed as [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][];
	// 	}
	// }

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
				const until = Number(feed[Math.min(currentPage * $limit, feed.length - 1)].createdAt());
				const since = until - (currentPage + 2) * 24 * 60 * 60 * sinceMultiplier;
				pagesub = useSubscription(
					subscriptionID + since,
					requests.map((r) => ({ ...r, until, since })),
					(message) => handleEvents(message, currentPage)
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
		getItemId={(item) => {
			return item?.id().fnv1aHash();
		}}
		let:item
		{itemHeight}
		{backdrop}
		{loading}
	>
		{@const repost = asKind6(item) && item.pubkey()}
		{@const isVisible =
			visible &&
			feed.findIndex((note) => note.id()?.toString() === item.id()?.toString()) >= start - 2}
		<svelte:fragment slot="feed-header">
			<slot name="header" visible>Missing Template</slot>
		</svelte:fragment>
		<div class="block w-feed m-auto px-1 max-w-full">
			<slot name="item-content" post={item} visible={isVisible}>
				<Note
					note={repost ? { ...item?.parsed.repostedEvent, requests: item.requests } : item}
					context={[]}
					visible={isVisible}
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
