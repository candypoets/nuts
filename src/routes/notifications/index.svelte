<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ParsedEvent, RequestObject, WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asParsedEvent,
		asConnectionStatus,
		ConnectionTracker
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { key, lastNotificationView, writeRelays } from 'src/controller';
	import Feed from 'src/routes/explore/feed.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { processNotifications, type ProcessedNotification } from './notifications';
	import Reactions from './reactions.svelte';
	import Replies from './replies.svelte';
	import Mentions from './mentions.svelte';

	export let visible = true;
	export let goBack: () => void;

	let loading = true;

	// Raw events from subscription
	let rawEvents: ParsedEvent[] = [];
	// Processed notifications (grouped by type)
	let notificationItems: ProcessedNotification[] = [];

	// Track seen event IDs to prevent duplicates
	let seenEventIds = new Set<string>();

	// Subscription cleanup function
	let unsubscribe: (() => void) | undefined;
	let connectionTracker: ConnectionTracker | undefined;

	// Pagination state
	let until: number | undefined = undefined;
	let hasMore = true;
	let paginationCounter = 0;
	let itemsBeforePagination = 0;
	let paginationTimeout: ReturnType<typeof setTimeout> | undefined;
	let prevPaginationSubId: string | undefined = undefined;

	// Build subscription requests
	function buildRequests(isPagination = false): RequestObject[] {
		if (!$key?.pub) {
			return [];
		}

		const req: RequestObject = {
			// Mentions of user, reactions to user's posts, reposts of user's content
			kinds: [1, 7, 6],
			tags: { '#p': [$key.pub] },
			limit: 50,
			relays: $writeRelays,
			noCache: true
		};
		if (isPagination && until) {
			req.until = until;
		}
		return [req];
	}

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		// Handle connection status (including EOSE detection via resolutionRate)
		const status = asConnectionStatus(message);
		if (status && connectionTracker) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				connectionTracker.handleMessage(message);
				// When >50% of relays have reached EOSE, mark loading as done
				if (connectionTracker.resolutionRate > 0.5) {
					loading = false;
				}
			}
			return;
		}

		// Handle parsed events
		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent) return;

		// Filter out events authored by the logged-in user
		const author = parsedEvent.pubkey();
		if (author === $key?.pub) return;

		const kind = parsedEvent.kind();
		if (![1, 6, 7].includes(kind)) return;

		const eventId = parsedEvent.id();
		if (!eventId) return;

		// Check Set first (O(1)) for duplicate detection
		if (seenEventIds.has(eventId)) return;
		seenEventIds.add(eventId);

		rawEvents = [...rawEvents, parsedEvent];
	}

	// Process raw events into grouped notifications
	$: notificationItems = processNotifications(rawEvents);

	// Initialize subscription
	let hasInitialized = false;

	function initSubscription(isPagination = false) {
		if (!visible || !$key?.pub) return;
		if (!isPagination && hasInitialized) return;

		if (!isPagination) {
			// Clear previous state BEFORE marking initialized
			// This prevents race conditions with synchronous cached events
			rawEvents = [];
			seenEventIds.clear();
			hasInitialized = true;
		}
		loading = true;
		const requests = buildRequests(isPagination);
		if (requests.length > 0) {
			const subId = isPagination
				? 'notifications_page_' + $key.pub + '_' + paginationCounter + '_' + until
				: 'notifications_' + $key.pub;
			if (!isPagination) {
				unsubscribe?.();
			}
			connectionTracker = new ConnectionTracker();
			const unsub = useSubscription(subId, requests, handleEvents, {
				bytesPerEvent: 10 * 1024,
				pagination: isPagination ? prevPaginationSubId : undefined
			});
			if (!isPagination) {
				unsubscribe = unsub;
			}
			// Track this subId for next pagination
			if (isPagination) {
				prevPaginationSubId = subId;
			}
		}
	}

	$: if (visible && $key?.pub && !hasInitialized) {
		initSubscription();
	}

	// Cleanup subscription when not visible
	$: if (!visible) {
		unsubscribe?.();
		unsubscribe = undefined;
		connectionTracker = undefined;
		hasInitialized = false;
	}

	onMount(() => {
		$lastNotificationView = Date.now();
		window.scrollTo(0, 0);
		return () => {
			unsubscribe?.();
		};
	});

	onDestroy(() => {
		unsubscribe?.();
		if (paginationTimeout) clearTimeout(paginationTimeout);
		prevPaginationSubId = undefined;
	});

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		console.log('[Notifications] handleNearBottom called', {
			loading,
			hasMore,
			rawEventsLength: rawEvents.length
		});
		if (loading || !hasMore || rawEvents.length === 0) {
			console.log('[Notifications] Pagination blocked:', {
				loading,
				hasMore,
				rawEventsLength: rawEvents.length
			});
			return;
		}

		loading = true;
		itemsBeforePagination = rawEvents.length;
		paginationCounter++;

		// Use the createdAt of an item ~5 positions back as until (with overlap buffer)
		const overlapIndex = Math.max(0, rawEvents.length - 6);
		const cursorItem = rawEvents[overlapIndex];
		if (cursorItem) {
			until = cursorItem.createdAt() - 1;
			console.log(
				'[Notifications] Pagination cursor at index',
				overlapIndex,
				'of',
				rawEvents.length,
				'timestamp:',
				until
			);
		}

		initSubscription(true);

		// Fallback: clear loading after timeout if EOSE isn't received
		paginationTimeout = setTimeout(() => {
			console.log('[Notifications] Pagination timeout, clearing loading state');
			loading = false;
		}, 10000);
	}

	// Track when pagination completes and check if new items were added
	$: if (!loading && itemsBeforePagination > 0) {
		const itemsAtCheck = itemsBeforePagination;

		// Clear the timeout if it hasn't fired yet
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}

		// Check if we actually got new items
		const newItemsAdded = rawEvents.length - itemsAtCheck;
		console.log('[Notifications] Pagination complete. New items added:', newItemsAdded);
		if (newItemsAdded === 0) {
			hasMore = false;
			console.log('[Notifications] No more data available');
		}
		itemsBeforePagination = 0;
	}
</script>

<!-- Header for the page -->
<Feed
	items={notificationItems}
	{loading}
	{visible}
	getItemId={(item) => {
		// ProcessedNotification has id() that returns { fnv1aHash: () => string }
		const idObj = item?.id?.();

		return idObj || Math.random().toString();
	}}
	onNearBottom={handleNearBottom}
>
	<svelte:fragment slot="sticky-header">
		<div
			class="w-feed pt-safe bg-base-300 bg-opacity-85 mt-1 rounded-lg h-20 pb-2 flex items-center justify-between shadow-sm"
		>
			<button on:click={() => goBack()} class="p-1 rounded-full hover:bg-base-200 mx-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold">Notifications</h1>
			<span class="w-10" />
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		<div
			class="w-feed pt-safe bg-base-300 bg-opacity-85 backdrop-blur-gpu mt-1 rounded-lg h-20 pb-2 flex items-center justify-between shadow-sm mb-1"
		>
			<button on:click={() => goBack()} class="btn btn-sm btn-circle mx-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold">Notifications</h1>
			<span class="w-10" />
		</div>
	</svelte:fragment>

	<svelte:fragment slot="item-content" let:post let:context let:visible>
		<div class="bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg mb-1">
			<!-- {#if visible} -->
			{#if post.type === 'reply'}
				<Replies {post} {visible} />
			{:else if post.type === 'reaction'}
				<Reactions {post} {visible} />
			{:else if post.type === 'mention'}
				<Mentions {post} {visible} />
			{:else if post.type === 'repost'}
				{@const parsed = post.parsed}
				<div class="p-4 border-b">
					<div class="flex items-center">
						<Icon icon="mdi:repeat" class="text-green-500 mr-2" />
						<span>
							{parsed.events?.length || 0}
							{(parsed.events?.length || 0) === 1 ? 'person' : 'people'} reposted your content
						</span>
					</div>
					<div class="mt-2 pl-6 text-sm text-gray-600">
						{#if parsed.originalPost}
							"{parsed.originalPost.content?.substring(0, 100)}{parsed.originalPost.content
								?.length > 100
								? '...'
								: ''}"
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</svelte:fragment>
</Feed>

{#if !$key}
	<div class="flex flex-col items-center justify-center h-screen">
		<Icon icon="mdi:bell-off" class="text-6xl text-gray-300 mb-4" />
		<p class="text-gray-500">Sign in to view your notifications</p>
		<button
			class="mt-4 bg-primary text-white px-4 py-2 rounded-lg"
			on:click={() => goto('/settings')}
		>
			Sign In
		</button>
	</div>
{/if}
