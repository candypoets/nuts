<script lang="ts">
	import {
		MessageType,
		type ConnectionStatus,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind1,
		asParsedEvent,
		fbArray,
		isKind1,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { decode, type EventPointer } from 'nostr-tools/nip19';
	import { getContext, onDestroy } from 'svelte';

	import { normalizeURL } from 'nostr-tools/utils';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { isMobile } from 'src/controller';
	import { defaultPipeline } from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import Feed from 'src/routes/explore/feed.svelte';
	import Note from 'src/routes/explore/note.svelte';
	import { getUserRelays } from 'src/routes/queries/user';
	import { ALL_FEED_KINDS, type FeedKind } from 'src/controller/feed';

	export let nevent: string;
	export let visible: boolean;
	export let depth: number = 0;
	export let goBack: () => void;

	let eoce = false;
	let eose = false;

	let headerItem: ParsedEvent | undefined;
	let context: ParsedEvent[] = [];
	let loading = true;
	let timeout: NodeJS.Timeout | undefined;
	let sub: (() => void) | undefined;
	let cachesub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;
	let repliesSub: (() => void) | undefined;
	let paginationSub: (() => void) | undefined;
	let currentEventId: string | undefined = undefined;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let data: EventPointer = { id: '', relays: [] } as EventPointer;
	$: {
		try {
			const decoded = decode(nevent) as unknown as { data: EventPointer };
			data = decoded?.data || ({ id: '', relays: [] } as EventPointer);
		} catch (err) {
			console.error('kind1 failed to decode nevent', err);
			data = { id: '', relays: [] } as EventPointer;
		}
	}

	// Track actual relays being used (starts with nevent relays, updated by getUserRelays)
	let currentRelays: string[] = [];

	// Feed items managed by parent
	let feedItems: ParsedEvent[] = [];

	// Pagination state
	let until: number | undefined = undefined;
	let hasMore = true;
	let itemsBeforePagination = 0;
	let paginationTimeout: ReturnType<typeof setTimeout> | undefined;
	let paginationCheckTimeout: ReturnType<typeof setTimeout> | undefined;
	let paginationCounter = 0;
	let prevPaginationSubId: string | undefined = undefined;

	// Base subId for relay swapping
	$: baseSubId = 'kind1_' + data?.id;

	function resetStateForEvent() {
		eoce = false;
		eose = false;
		headerItem = undefined;
		context = [];
		feedItems = [];
		loading = true;
		connectionStatus = {};
		currentRelays = data.relays || [];
		until = undefined;
		hasMore = true;
		itemsBeforePagination = 0;
		paginationCounter = 0;
		prevPaginationSubId = undefined;
	}

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				const normalizedUrl = normalizeURL(relayUrl);
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
			}
			return;
		}

		switch (message.type()) {
			case MessageType.Eoce:
				eoce = true;
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (!parsedEvent) return;

				const kind1 = asKind1(parsedEvent);
				if (kind1) {
					// only show replies to root posts
					if (kind1.reply()?.id() && kind1.reply()?.id() != data?.id) return;
					if (
						(!kind1.reply()?.id() || kind1.reply()?.id() == kind1.root()?.id()) &&
						kind1?.root()?.id() != data?.id
					)
						return;
					// if replies are quote return the feed
					if (fbArray(kind1, 'mentions').some((q) => q.id() == data.id)) return;

					const eventId = parsedEvent.id();
					const existingIndex = feedItems.findIndex((item) => item.id() === eventId);
					if (existingIndex === -1) {
						if (!eoce) {
							feedItems = [...feedItems, parsedEvent];
						} else {
							if (parsedEvent.createdAt() >= feedItems?.[0]?.createdAt()) {
								feedItems = [parsedEvent, ...feedItems];
							} else {
								// Add the event to the feed and sort by created_at (most recent first)
								feedItems = [...feedItems, parsedEvent].sort(
									(a, b) => b.createdAt() - a.createdAt()
								);
							}
						}
					}
				}
				break;
		}
	}

	function subscribe() {
		if (visible && data?.id && !sub) {
			// Timeout to stop loading if event is not found
			timeout = setTimeout(() => {
				if (loading) {
					console.log('kind1 loading timeout - event not found');
					loading = false;
				}
			}, 1000);

			// eagerly fetch from the cache before 10002 resolve
			cachesub = useSubscription(
				'replies_cache' + data?.id,
				[
					{
						kinds: ALL_FEED_KINDS,
						tags: { '#e': [data?.id] },
						limit: $limit,
						cacheFirst: true,
						relays: data.relays || []
					}
				],
				handleEvents,
				{
					pipeline: $defaultPipeline.for('replies_cache' + data?.id)
				}
			);

			sub = useSubscription(
				'kind1_' + data?.id,
				[
					{
						kinds: [1],
						ids: [data?.id],
						limit: 1,
						relays: data.relays || [],
						cacheFirst: true
					}
				],
				(message: WorkerMessage) => {
					const parsedEvent = isParsedEvent(message);
					const kind1 = isKind1(message);
					if (kind1 && parsedEvent && parsedEvent.id() == data.id) {
						loading = false;
						// profile = event;
						headerItem = parsedEvent;
						relaysub = getUserRelays(
							parsedEvent?.pubkey(),
							(relays) => {
								// Use fetched relays or fall back to nevent relays
								const effectiveRelays = relays.length > 0 ? relays : data.relays || [];
								// Update current relays for UI (only if we got valid relays)
								if (relays.length > 0) {
									currentRelays = relays;
								}
								// Subscribe to replies for this post
								if (!repliesSub) {
									repliesSub = useSubscription(
										'replies_' + data?.id,
										[
											{
												tags: { '#e': [data?.id] },
												limit: $limit,
												noContext: true,
												relays: effectiveRelays
											}
										],
										handleEvents,
										{
											pipeline: $defaultPipeline.for('replies_' + data?.id)
										}
									);
								}
							},
							'read'
						);
					}
				},
				{
					bytesPerEvent: 50 * 1024,
					pipeline: $defaultPipeline.for('kind1_' + data?.id)
				}
			);
		}
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		sub?.();
		sub = undefined;
		relaysub?.();
		relaysub = undefined;
		cachesub?.();
		cachesub = undefined;
		repliesSub?.();
		repliesSub = undefined;
		paginationSub?.();
		paginationSub = undefined;
	}

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		if (loading || !hasMore || feedItems.length === 0) return;

		loading = true;
		itemsBeforePagination = feedItems.length;
		paginationCounter++;

		// Use the createdAt of the last item as until
		const lastItem = feedItems[feedItems.length - 1];
		if (lastItem) {
			until = lastItem.createdAt() - 1;
		}

		const pageSubId = 'replies_' + data?.id + '_page_' + paginationCounter + '_' + until;
		paginationSub?.();
		paginationSub = useSubscription(
			pageSubId,
			[
				{
					kinds: [1],
					tags: { '#e': [data?.id] },
					limit: $limit,
					until,
					noContext: true,
					relays: currentRelays.length ? currentRelays : data.relays || []
				}
			],
			handleEvents,
			{
				pipeline: $defaultPipeline.for(pageSubId),
				pagination: prevPaginationSubId
			}
		);
		// Track this subId for next pagination
		prevPaginationSubId = pageSubId;

		// Fallback: clear loading after timeout
		paginationTimeout = setTimeout(() => {
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

		// Delay the check to allow late events to arrive via subscription
		paginationCheckTimeout = setTimeout(() => {
			const newItemsAdded = feedItems.length - itemsAtCheck;
			if (newItemsAdded === 0) {
				hasMore = false;
			}
			itemsBeforePagination = 0;
		}, 500); // Wait 500ms for late events to arrive
	}

	let imageContext = getContext('imageContext');

	onDestroy(() => {
		unsubscribe();
		if (paginationTimeout) clearTimeout(paginationTimeout);
		if (paginationCheckTimeout) clearTimeout(paginationCheckTimeout);
	});

	// Reset and re-subscribe when the target nevent changes in-place
	$: if (data?.id && data.id !== currentEventId) {
		unsubscribe();
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}
		if (paginationCheckTimeout) {
			clearTimeout(paginationCheckTimeout);
			paginationCheckTimeout = undefined;
		}
		currentEventId = data.id;
		resetStateForEvent();
		if (visible) {
			subscribe();
		}
	}

	$: visible ? subscribe() : unsubscribe();
</script>

<Feed
	items={feedItems}
	getItemId={(item) => item?.id?.() ?? Math.random()}
	class={imageContext ? 'w-full' : 'w-feed'}
	{visible}
	{loading}
	onNearBottom={handleNearBottom}
>
	<svelte:fragment slot="sticky-header">
		<div class="px-4 py-3 flex items-center justify-between pt-safe bg-base-100 bg-opacity-90">
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold">Post</h1>
			<span />
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		{#if !imageContext}
			<div
				class="w-feed pt-safe border-primary-content h-20 flex items-center justify-between bg-base-300 bg-opacity-90 rounded-lg px-4"
			>
				<button on:click={goBack} class="p-1 rounded-full bg-base-200 bg-opacity-85 mr-4">
					<Icon icon="mdi:arrow-left" class="text-xl" />
				</button>
				<!-- <h1 class="text-lg font-semibold">Post</h1> -->
				<RelaysList
					subId={baseSubId}
					relays={currentRelays.map(normalizeURL)}
					{connectionStatus}
					mini
				/>
				<!-- <span class="w-10" /> -->
			</div>
		{/if}

		{#if headerItem}
			<Note note={headerItem} {context} {visible} zaps main />
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="item-content" let:post let:visible>
		<Note
			note={post}
			{context}
			{visible}
			showRoot={false}
			showReplies={(newPost) => (replies) => {
				// const postKind1 = asKind1(newPost);
				const rep = replies.filter((r) => {
					const kind1 = asKind1(r);
					return (
						(r.pubkey() == post?.pubkey() || r.pubkey() == headerItem?.pubkey()) &&
						kind1?.reply()?.id() == newPost?.id()
					);
				});
				if (!rep.length) {
					return rep;
				}
				let oldest = rep[0];
				for (const r of rep) {
					if (r.createdAt() < oldest.createdAt()) {
						oldest = r;
					}
				}
				return [oldest];
			}}
			zaps
		/>
	</svelte:fragment>
</Feed>
