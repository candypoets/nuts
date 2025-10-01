<script lang="ts">
	import type { ParsedData, ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import {
		MessageType,
		nipWorker,
		type ConnectionStatus,
		type SubscriptionConfig
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asConnectionStatus, asKind6, asParsedEvent, isKind1 } from '@candypoets/nipworker/utils';
	import Fuse from 'fuse.js';
	import { uniqBy } from 'lodash';
	import { getContext, onMount } from 'svelte';

	import VirtualList from 'src/components/VirtualList.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { limit } from 'src/controller/pagination';
	import { now } from 'src/lib/period';
	import Note from './note.svelte';
	import { formatDistanceToNow } from 'date-fns';

	// Props
	export let bottom = false;
	export let subscriptionID: string;
	export let requests: any[] = [];
	export let subscriptionOptions: SubscriptionConfig | undefined = undefined;
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
	export let pullToRefresh = false;

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

	// Track seen event IDs to avoid duplicates
	let seen_ids = new Set<number>();

	const imageContext = getContext('imageContext');

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
				if (page <= 0) {
					feed = uniqBy([...feed, ...cachedFeed], (item) => item.id()?.fnv1aHash()).sort(
						(a, b) => b.createdAt() - a.createdAt()
					);

					let since =
						feed.length > 0 ? Math.max(...feed.map((event) => Number(event.createdAt()))) : now();
					sub?.();
					nipWorker.cleanup();
					sub = useSubscription(
						subscriptionID + '_head',
						requests.map((r) => ({ ...r, since })),
						(message) => handleEvents(message, -1)
					);
				} else {
					feed = [...feed, ...cachedFeed];
				}
				cachedFeed = [];
				break;
			case MessageType.ConnectionStatus:
				const status = asConnectionStatus(message);
				if (status) {
					connectionStatus[status.relayUrl()!.toString()] = status;
					if (status.status()!.toString() == 'EOSE' && eose == false) {
						// if (eose == false && events.remainingConnections / events.totalConnections < 1) {
						loading = false;
						eose = true;
						if (page <= 0) {
							feed = uniqBy(
								[...fetchedFeed, ...feed].sort((a, b) => b.createdAt() - a.createdAt()),
								(item) => item.id()?.fnv1aHash()
							);
						} else {
							feed = uniqBy([...feed, ...fetchedFeed], (item) => item.id()?.fnv1aHash());
						}
						fetchedFeed = [];
					}
				}
				break;
			case MessageType.Eoce:
				if (!eoce) {
					eoce = true;
					if (page == 0) {
						feed = [...feed, ...cachedFeed];
					} else {
						feed = uniqBy([...feed, ...cachedFeed], (item) => item.id()?.fnv1aHash());
					}
					cachedFeed = [];
					// makeFuse();
				}
				break;

			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (seen_ids.has(parsedEvent?.id()?.fnv1aHash() as number)) {
					return;
				}
				seen_ids.add(parsedEvent?.id()?.fnv1aHash() as number);
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
					} else if (page <= 0) {
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
		if (feed.length > 0) {
			const mostRecentTime = feed[0].createdAt();
			const allIncoming = [...bufferFeed, ...fetchedFeed];
			let moreRecent: ParsedEvent[] = [];
			let leastRecent: ParsedEvent[] = [];
			for (const item of allIncoming) {
				if (item.createdAt() > mostRecentTime) {
					moreRecent.push(item);
				} else {
					leastRecent.push(item);
				}
			}
			feed = [...moreRecent, ...feed, ...leastRecent];
		}
		feed = uniqBy(feed, (item: ParsedEvent) => item?.id()?.fnv1aHash());
		bufferFeed = [];
		fetchedFeed = [];
		lastBufferDump = now();
		// makeFuse();
	}

	onMount(() => {
		initialItems.forEach((item) => seen_ids.add(item.id()?.fnv1aHash() as number));
		feed = initialItems;
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

	$: visible && subscriptionID && requests && requests.length ? subscribe() : unsubscribe();

	$: (subscriptionID, (feed = []));

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

	let paging = false;
	let baselineLen = 0;
	let lastUntil: number | null = null;
	let pageTimer: ReturnType<typeof setTimeout> | null = null;

	function finalizePage(reason: 'eose' | 'timeout') {
		if (pageTimer) {
			clearTimeout(pageTimer);
			pageTimer = null;
		}

		// decide success/failure for the page we just requested
		if (feed.length === baselineLen) {
			noResultsCount++;
			sinceMultiplier *= 5; // widen lookback only when we truly got nothing
		} else {
			noResultsCount = 0;
			sinceMultiplier = 1;
		}
		lastFeedLength = feed.length;

		// allow next cycle
		paging = false;
		eose = true;
	}

	function startPage() {
		// gate
		if (paging) return;
		paging = true;
		eose = false;

		// record baseline for THIS page
		baselineLen = feed.length;

		// tear down previous
		pagesub?.();
		nipWorker.cleanup();

		// compute a robust "older" window
		const sortedFeed = [...feed].sort((a, b) => b.createdAt() - a.createdAt());
		if (sortedFeed.length === 0) {
			// nothing yet; give it a moment and release gate
			pageTimer = setTimeout(() => finalizePage('timeout'), 5000);
			return;
		}

		const pageLimit = $limit ?? 20;

		// quantile near the tail + page boundary, then pick the newer to avoid huge jumps
		const baseQ = 0.85;
		const q = Math.min(0.97, baseQ + noResultsCount * 0.05);
		const idxQ = Math.max(
			0,
			Math.min(sortedFeed.length - 1, Math.floor((sortedFeed.length - 1) * q))
		);
		const tsQ = sortedFeed[idxQ]?.createdAt?.() ?? Math.floor(Date.now() / 1000);

		const pageEndIdx = Math.max(0, Math.min(sortedFeed.length - 1, currentPage * pageLimit - 1));
		const tsPage = sortedFeed[pageEndIdx]?.createdAt?.() ?? tsQ;

		const anchor = Math.max(tsQ, tsPage);
		const until = lastUntil != null ? Math.min(lastUntil - 1, anchor - 1) : anchor - 1;

		const oneDay = 24 * 60 * 60;
		const windowSeconds = (currentPage + 2) * oneDay * sinceMultiplier;
		const since = Math.max(0, until - windowSeconds);

		console.log(
			'pagination (older)',
			formatDistanceToNow((since || 0) * 1000, { addSuffix: true }),
			formatDistanceToNow((until || 0) * 1000, { addSuffix: true }),
			{
				currentPage,
				len: sortedFeed.length,
				pageLimit,
				idxQ,
				pageEndIdx,
				tsQ,
				tsPage,
				anchor,
				lastUntil,
				windowSeconds,
				sinceMultiplier
			}
		);

		// start the page subscription
		const subId = subscriptionID + ':until:' + until;
		currentPage++;
		lastUntil = until;

		pagesub = useSubscription(
			subId,
			requests.map((r) => ({ ...r, until, since })),
			(message) => {
				// your existing event handler
				handleEvents(message, currentPage);

				// If you can detect EOSE here, call finalizePage('eose') exactly once.
				// Example patterns (adjust to your actual message format):
				// if (message === 'EOSE' || message?.type === 'EOSE') {
				//   if (paging) finalizePage('eose');
				// }
			}
		);

		// Fallback finalize in case EOSE isn't exposed; give results time to arrive.
		// Increase with noResultsCount so we wait longer when probing deeper.
		pageTimer = setTimeout(
			() => {
				if (paging) finalizePage('timeout');
			},
			2000 + noResultsCount * 1000
		);
	}

	$: {
		// Replace your old reactive pagination block with this trigger:
		// Only kick a new page when:
		// - user scrolled to the end (end == feed.length)
		// - we’re not already paging
		// - attempts are within cap
		// - we actually have something loaded (start != 0)
		if (start != 0 && end == feed.length && !paging && noResultsCount <= 3) {
			console.log('pagination', noResultsCount);
			startPage();
		}
	}

	function refreshHead() {
		if (bufferFeed.length || fetchedFeed.length) {
			setBufferFeed();
		}
		const since = feed.length ? Number(feed[0].createdAt()) : now();
		const subId = subscriptionID + '_pull_' + Date.now();
		sub?.();
		nipWorker.cleanup();
		sub = useSubscription(
			subId,
			requests.map((r) => ({ ...r, since })),
			(message) => handleEvents(message, -1)
		);
	}
</script>

<div class="fixed bottom-4 left-4 text-white">
	{start} - {end} - {feed.length}
</div>

<div class={'lg:pt-0 h-full min-h-screen m-auto !pt-0 ' + $$props.class}>
	<!-- {#if start >= 1} -->
	{#if start >= 1}
		<!-- Fixed header (only visible when scrolled) -->
		<div class="absolute z-10 w-full sticky-header" style="--header-visible: {down ? 0 : 1};">
			<div
				class="w-feed m-auto backdrop-blur-md"
				style="-webkit-backdrop-filter: blur(12px);"
				on:click={() => viewport.scrollTo({ top: 0, behavior: 'smooth' })}
			>
				<slot name="sticky-header" visible={true} scrolled={true} {newPosts} />
			</div>
		</div>
	{/if}
	<!-- Fixed footer (only visible when scrolled) -->
	<div
		class="fixed bottom-0 z-10 w-full sticky-footer"
		style="--footer-visible: {!down || start < 1 ? 1 : 0};"
	>
		<div class="m-auto" class:w-feed={!imageContext}>
			<slot name="sticky-footer" visible={true} scrolled={true} {newPosts} />
		</div>
	</div>
	<!-- {/if} -->
	<div class="absolute z-10 w-full">
		<div class="w-feed m-auto">
			<slot name="fixed-header" {start} />
		</div>
	</div>
	<!-- {#key subscriptionID} -->
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
		let:itemIndex
		{itemHeight}
		{backdrop}
		{loading}
		onRefresh={refreshHead}
		{pullToRefresh}
	>
		{@const repost = asKind6(item) && item.pubkey()}
		{@const isVisible = visible && itemIndex >= start - 2}
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
	<!-- {/key} -->
</div>

<style>
	.sticky-header {
		opacity: var(--header-visible);
		transform: translate3d(0, calc((1 - var(--header-visible)) * -100%), 0);
		transition:
			opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		/*will-change: opacity, transform;*/
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
		/*will-change: opacity, transform;*/
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
