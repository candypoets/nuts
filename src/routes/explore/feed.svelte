<script lang="ts">
	import type { NostrEvent, ParsedData, ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import {
		ConnectionStatus,
		MessageType,
		manager,
		type SubscriptionConfig
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind6,
		asNostrEvent,
		asParsedEvent,
		isKind1
	} from '@candypoets/nipworker/utils';
	import Fuse from 'fuse.js';
	import { getContext, onMount } from 'svelte';

	import VirtualList from 'src/components/VirtualList.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { limit } from 'src/controller/pagination';
	import { now } from 'src/lib/period';
	import Note from './note.svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { normalizeURL } from 'nostr-tools/utils';
	import Placeholder from 'src/components/Placeholder.svelte';

	type ParsedOrNostrEvent = ParsedEvent | NostrEvent;

	// Props
	export let bottom = false;
	export let subscriptionID: string;
	export let requests: any[] = [];
	export let subscriptionOptions: SubscriptionConfig | undefined = undefined;
	export let updateFeed:
		| ((feed: ParsedEvent[], newEvent: WorkerMessage) => ParsedEvent[])
		| undefined = undefined;

	export let kinds: ParsedData[] | undefined = undefined;
	export let visible: boolean = true;
	export let backdrop: boolean = false;
	export let search: string = '';
	export let fuseKeys: string[] = [];
	export let fuseResolver:
		| ((item: any, key: string) => string | string[] | null | undefined)
		| undefined = undefined;
	export let itemHeight: number | undefined = undefined;
	export let initialItems: ParsedEvent[] = [];
	export let pullToRefresh = false;
	export let itemsPerRow = 1;
	export let stickyFooterVisible = false;

	export let connectionStatus: { [url: string]: ConnectionStatus } = {};

	// Canonical feed: keep a sorted list (desc by createdAt) + a Map index for O(1) existence
	export let feed: ParsedEvent[] = [];
	const feedMap = new Map<number, ParsedEvent>();

	// Stage buffers in Maps for O(1) dedupe and cheap merges
	let cachedMap = new Map<number, ParsedEvent>();
	let fetchedMap = new Map<number, ParsedEvent>();
	let bufferMap = new Map<number, ParsedEvent>();

	// Track seen ids early to avoid reprocessing
	const seen_ids = new Set<number>();

	let newPosts: number = 0;
	let timeout: NodeJS.Timeout | undefined;
	let sub: () => void | undefined;
	let pagesub: () => void | undefined;

	let fuse: Fuse<any> | undefined;
	let filteredFeed: ParsedEvent[] = [];

	let start = 0;
	let end = 0;

	let lastBufferDump = 0;

	let viewport: HTMLElement;
	let down = true; // is the virtualScrool going down

	let eose = false;
	let eoce = false;
	let loading = true;

	const imageContext = getContext('imageContext');

	function getHash(e: ParsedEvent | undefined | null): number {
		return e?.id?.()?.fnv1aHash?.() as number;
	}

	function isCorrectKind(event: ParsedEvent) {
		return kinds != undefined ? kinds.some((k) => event.kind() == k) : isKind1;
	}

	// Binary search on createdAt descending list; returns insertion index
	function binarySearchDescByTs(arr: ParsedEvent[], ts: number): number {
		let lo = 0;
		let hi = arr.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if ((arr[mid]?.createdAt?.() ?? 0) < ts) {
				hi = mid;
			} else {
				lo = mid + 1;
			}
		}
		return lo;
	}

	// Batch invalidation to force Svelte to see list changes
	let dirtyScheduled = false;
	function invalidateFeed() {
		if (dirtyScheduled) return;
		dirtyScheduled = true;
		Promise.resolve().then(() => {
			feed = feed; // reassign to trigger reactivity
			dirtyScheduled = false;
		});
	}

	// Insert/update into feed; preserves sorted order; returns true if list changed
	function upsertIntoFeed(e: ParsedEvent): boolean {
		const id = getHash(e);
		if (!id) return false;

		if (feedMap.has(id)) {
			// update in place if needed; typically ts doesn't change
			feedMap.set(id, e);
			return false;
		}

		feedMap.set(id, e);
		const ts = e.createdAt?.() ?? 0;

		if (feed.length === 0) {
			feed.push(e);
			return true;
		}
		const headTs = feed[0]?.createdAt?.() ?? 0;
		if (ts >= headTs) {
			feed.unshift(e);
			return true;
		}
		const tailTs = feed[feed.length - 1]?.createdAt?.() ?? 0;
		if (ts <= tailTs) {
			feed.push(e);
			return true;
		}

		const idx = binarySearchDescByTs(feed, ts);
		feed.splice(idx, 0, e);
		return true;
	}

	function mergeMapIntoFeed(m: Map<number, ParsedEvent>): void {
		if (m.size === 0) return;
		let changed = false;
		for (const [id, e] of m) {
			changed = upsertIntoFeed(e) || changed;
		}
		m.clear();
		if (changed) invalidateFeed();
	}

	function mergePendingToFeed(): void {
		let changed = false;
		for (const [, e] of bufferMap) changed = upsertIntoFeed(e) || changed;
		for (const [, e] of fetchedMap) changed = upsertIntoFeed(e) || changed;
		for (const [, e] of cachedMap) changed = upsertIntoFeed(e) || changed;
		bufferMap.clear();
		fetchedMap.clear();
		cachedMap.clear();
		if (changed) invalidateFeed();
	}

	// In a separate function to avoid infinite loops in the reactive block
	const handleEvents = (message: WorkerMessage, page = 0) => {
		switch (message.type()) {
			case MessageType.BufferFull: {
				// bring cached into feed
				if (page <= 0) {
					mergeMapIntoFeed(cachedMap);

					// resume head subscription with "since"
					const since = feed.length > 0 ? (feed[0]?.createdAt?.() ?? now()) : now();
					sub?.();
					// manager.cleanup();
					sub = useSubscription(
						subscriptionID + '_head',
						requests.map((r) => ({ ...r, since })),
						(msg) => handleEvents(msg, -1)
					);
				} else {
					mergeMapIntoFeed(cachedMap);
				}
				break;
			}

			case MessageType.ConnectionStatus: {
				const status = asConnectionStatus(message);
				// console.log('connection status');
				if (status) {
					// console.log('status', status.relayUrl()!.toString(), status.status()!.toString());
					connectionStatus[normalizeURL(status.relayUrl()!.toString())] = status;
					if (status.status()!.toString() == 'EOSE' && eose == false) {
						loading = false;
						eose = true;
						// fold fetchedMap into feed
						mergeMapIntoFeed(fetchedMap);
					}
				}
				break;
			}

			case MessageType.Eoce: {
				// console.log('EOCE');
				if (!eoce) {
					eoce = true;
					// Make fetchedMap inherit everything processed during the cache phase
					fetchedMap = cachedMap;
					// Move cached into feed after cache phase closes
					mergeMapIntoFeed(cachedMap);
				}
				break;
			}

			case MessageType.ParsedNostrEvent: {
				const parsedEvent = asParsedEvent(message);
				const id = getHash(parsedEvent);
				if (!id) return;
				if (seen_ids.has(id)) return;
				seen_ids.add(id);

				if (updateFeed && parsedEvent && isCorrectKind(parsedEvent)) {
					// If custom updater is provided, apply on smallest structure available
					if (!eoce) {
						const before = Array.from(cachedMap.values());
						const after = updateFeed(before, message) || before;
						cachedMap.clear();
						for (const e of after) cachedMap.set(getHash(e)!, e);
					} else if (!eose) {
						const before = Array.from(fetchedMap.values());
						const after = updateFeed(before, message) || before;
						fetchedMap.clear();
						for (const e of after) fetchedMap.set(getHash(e)!, e);
					} else {
						// live: apply to feedList; mirror map once
						const out = updateFeed(feed, message) || feed;
						if (out !== feed) {
							feed = out; // reassignment already invalidates
							feedMap.clear();
							for (const e of feed) feedMap.set(getHash(e)!, e);
						} else {
							// ensure map consistency if updater mutated in place
							let changed = false;
							for (const e of feed) {
								const hid = getHash(e);
								if (hid && !feedMap.has(hid)) {
									feedMap.set(hid, e);
									changed = true;
								}
							}
							if (changed) invalidateFeed();
						}
					}
					break;
				}

				const kind1 = isKind1(message);
				if (parsedEvent && kind1) {
					// only show replies to root posts
					if (
						kind1.reply()?.id() &&
						kind1?.root()?.id()?.fnv1aHash() != kind1.reply()?.id()?.fnv1aHash()
					) {
						return;
					}

					if (!eoce) {
						// cached phase
						cachedMap.set(id, parsedEvent);
					} else if (!eose) {
						// pre-EOSE fetched phase
						fetchedMap.set(id, parsedEvent);
					} else if (page <= 0) {
						// head stream: buffer for batch merge
						bufferMap.set(id, parsedEvent);
					} else {
						// page stream post-EOSE: insert directly
						if (upsertIntoFeed(parsedEvent)) invalidateFeed();
					}
				}
				break;
			}
			case MessageType.NostrEvent: {
				const nostrEvent = asNostrEvent(message);
				console.log('NostrEvent!', nostrEvent);
				const id = nostrEvent?.id()?.fnv1aHash();
				if (!id) return;
				if (seen_ids.has(id)) return;
				seen_ids.add(id);
				if (!eoce) {
					// cached phase
					cachedMap.set(id, nostrEvent);
				} else if (!eose) {
					// pre-EOSE fetched phase
					fetchedMap.set(id, nostrEvent);
				} else if (page <= 0) {
					// head stream: buffer for batch merge
					bufferMap.set(id, nostrEvent);
				} else {
					// page stream post-EOSE: insert directly
					if (upsertIntoFeed(nostrEvent)) invalidateFeed();
				}
			}
		}
	};

	function subscribe() {
		timeout = setTimeout(() => {
			if (visible) {
				eoce = false;
				eose = false;
				bufferMap.clear();
				fetchedMap.clear();
				cachedMap.clear();
				sub = useSubscription(subscriptionID, requests, handleEvents, subscriptionOptions);
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
		// number of new posts visible before current viewport start
		const incomingCount = bufferMap.size + fetchedMap.size;
		newPosts = start > incomingCount ? incomingCount : start;

		let changed = false;

		if (feed.length > 0) {
			const mostRecentTime = feed[0].createdAt?.() ?? 0;

			// Fast-path newer head events first
			for (const [key, e] of bufferMap) {
				if ((e.createdAt?.() ?? 0) > mostRecentTime) {
					changed = upsertIntoFeed(e) || changed;
					bufferMap.delete(key);
				}
			}
			for (const [key, e] of fetchedMap) {
				if ((e.createdAt?.() ?? 0) > mostRecentTime) {
					changed = upsertIntoFeed(e) || changed;
					fetchedMap.delete(key);
				}
			}
		}

		// Merge remaining
		for (const [, e] of bufferMap) changed = upsertIntoFeed(e) || changed;
		for (const [, e] of fetchedMap) changed = upsertIntoFeed(e) || changed;
		bufferMap.clear();
		fetchedMap.clear();

		lastBufferDump = now();
		if (changed) invalidateFeed();
	}

	onMount(() => {
		// bootstrap from initial items
		feed = [];
		feedMap.clear();
		let changed = false;
		initialItems.forEach((item) => {
			const id = getHash(item);
			if (id) {
				seen_ids.add(id);
				changed = upsertIntoFeed(item) || changed;
			}
		});
		if (changed) invalidateFeed();

		const interval = setInterval(() => {
			if (loading) loading = false;
			if (now() - lastBufferDump > 2 && (bufferMap.size || fetchedMap.size)) {
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

	let previousSubscriptionID: string | undefined;

	$: if (subscriptionID !== previousSubscriptionID) {
		// unsubscribe();
		sub?.();
		previousSubscriptionID = subscriptionID;
		feed = [];
		feedMap.clear();
		seen_ids.clear();
	}

	// Search: only enable when fuseResolver and fuseKeys exist
	$: {
		if (fuseResolver && fuseKeys.length > 0 && feed.length > 0) {
			fuse = new Fuse<any>(feed, {
				keys: fuseKeys,
				threshold: 0.4,
				includeScore: true,
				getFn: (obj, p) => {
					const key = Array.isArray(p) ? p.join('.') : (p as string);
					const out = fuseResolver(obj, key);
					return out == null ? '' : out;
				}
			});
		} else {
			fuse = undefined;
		}

		if (search && fuse) {
			filteredFeed = fuse.search(search).map((r) => r.item);
		} else {
			filteredFeed = feed;
		}
	}

	// Pagination state
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
		manager.cleanup();

		// compute a robust "older" window
		const sortedFeed = feed; // already sorted desc
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

		// start the page subscription
		const subId = subscriptionID + ':until:' + until;
		currentPage++;
		lastUntil = until;

		pagesub = useSubscription(
			subId,
			requests.map((r) => ({ ...r, until, since })),
			(message) => {
				handleEvents(message, currentPage);
				// If you can detect EOSE here, call finalizePage('eose') exactly once.
			}
		);

		// Fallback finalize in case EOSE isn't exposed; give results time to arrive.
		pageTimer = setTimeout(
			() => {
				if (paging) finalizePage('timeout');
			},
			2000 + noResultsCount * 1000
		);
	}

	$: {
		// Trigger a new page when:
		// - user scrolled to the end (end == feedList.length)
		// - we’re not already paging
		// - attempts are within cap
		// - we actually have something loaded (start != 0)
		if (start != 0 && end == feed.length && !paging && noResultsCount <= 3) {
			console.log('pagination', noResultsCount);
			startPage();
		}
	}

	function refreshHead() {
		if (bufferMap.size || fetchedMap.size) {
			setBufferFeed();
		}
		const since = feed.length ? Number(feed[0].createdAt()) : now();
		const subId = subscriptionID + '_pull_' + Date.now();
		sub?.();
		manager.cleanup();
		sub = useSubscription(
			subId,
			requests.map((r) => ({ ...r, since })),
			(message) => handleEvents(message, -1)
		);
	}

	$: console.log('feed', feed);
</script>

<div class={'lg:pt-0 h-full min-h-screen mx-auto !pt-0 ' + $$props.class}>
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
		style="--footer-visible: {stickyFooterVisible || !down || (start < 1 ? 1 : 0)};"
	>
		<div class="m-auto" class:w-feed={!imageContext}>
			<slot name="sticky-footer" visible={true} scrolled={true} {newPosts} />
		</div>
	</div>
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
		let:items
		let:itemIndex
		{itemsPerRow}
		{itemHeight}
		{backdrop}
		{loading}
		onRefresh={refreshHead}
		{pullToRefresh}
	>
		{@const repost = asKind6(item) && item.pubkey()}
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
						note={repost ? { ...item?.parsed.repostedEvent, requests: item.requests } : item}
						context={[]}
						visible={subVisible}
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
