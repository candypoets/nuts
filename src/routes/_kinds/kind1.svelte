<script lang="ts">
	import {
		MessageType,
		type ConnectionStatus,
		type NostrEvent as RawNostrEvent,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import {
		createPaginatedSubscription,
		type PaginatedSubscription,
		useSubscription
	} from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind1,
		asKind1111,
		asParsedEvent,
		fbArray,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { decode, type EventPointer } from 'nostr-tools/nip19';
	import { getContext, onDestroy } from 'svelte';

	import { normalizeURL } from 'nostr-tools/utils';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { isMobile } from 'src/controller';
	import { defaultPipeline } from 'src/controller/nostr';
	import { FEED_PAGE_WINDOW_SECONDS, limit } from 'src/controller/pagination';
	import Feed from 'src/routes/explore/feed.svelte';
	import Note from 'src/routes/explore/note.svelte';
	import Highlight from 'src/routes/explore/_post/highlight.svelte';
	import ReferencedEvent from 'src/routes/explore/_post/ReferencedEvent.svelte';
	import { getUserRelays } from 'src/routes/queries/user';

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
	let repliesSubscription: PaginatedSubscription | undefined;
	let currentEventId: string | undefined = undefined;
	let rootKind: number | undefined;

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

	// Base subId for relay swapping
	$: baseSubId = 'event_' + data?.id;

	function resetStateForEvent() {
		eoce = false;
		eose = false;
		headerItem = undefined;
		rootKind = data.kind;
		context = [];
		feedItems = [];
		loading = true;
		connectionStatus = {};
		currentRelays = data.relays || [];
	}

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage): number | undefined {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				const normalizedUrl = normalizeURL(relayUrl);
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
			}
			return undefined;
		}

		switch (message.type()) {
			case MessageType.Eoce:
				eoce = true;
				return undefined;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (!parsedEvent) return undefined;

				const kind1 = asKind1(parsedEvent);
				const kind1111 = asKind1111(parsedEvent);
				if (kind1) {
					// only show replies to root posts
					if (kind1.reply()?.id() && kind1.reply()?.id() != data?.id) return undefined;
					if (
						(!kind1.reply()?.id() || kind1.reply()?.id() == kind1.root()?.id()) &&
						kind1?.root()?.id() != data?.id
					)
						return undefined;
					// if replies are quote return the feed
					if (fbArray(kind1, 'eventRefs').some((q) => q.id() == data.id)) return undefined;
				} else if (kind1111) {
					if (rootKind === 1111) {
						if (kind1111.parentId() !== data.id) return undefined;
					} else if (
						kind1111.rootId() !== data.id ||
						(kind1111.parentId() && kind1111.parentId() !== data.id)
					) {
						return undefined;
					}
				} else {
					return undefined;
				}

				const eventId = parsedEvent.id();
				const existingIndex = feedItems.findIndex((item) => item.id() === eventId);
				if (existingIndex === -1) {
					if (!eoce) {
						feedItems = [...feedItems, parsedEvent];
					} else if (parsedEvent.createdAt() >= feedItems?.[0]?.createdAt()) {
						feedItems = [parsedEvent, ...feedItems];
					} else {
						feedItems = [...feedItems, parsedEvent].sort((a, b) => b.createdAt() - a.createdAt());
					}
				}
				return parsedEvent.createdAt();
		}
		return undefined;
	}

	function replyRequest(kind: number, relays: string[]): RequestObject {
		if (kind === 1) {
			return { kinds: [1], tags: { '#e': [data.id] }, limit: $limit, noContext: true, relays };
		}
		if (kind === 1111) {
			return { kinds: [1111], tags: { '#e': [data.id] }, limit: $limit, noContext: true, relays };
		}
		return { kinds: [1111], tags: { '#E': [data.id] }, limit: $limit, noContext: true, relays };
	}

	function subscribeToReplies(kind: number, relays: string[]) {
		cachesub?.();
		repliesSubscription?.close();
		feedItems = [];

		const request = replyRequest(kind, relays);
		const replyKind = kind === 1 ? 1 : 1111;
		const cacheSubId = `thread_replies_cache_${data.id}_${replyKind}`;
		cachesub = useSubscription(cacheSubId, [{ ...request, cacheFirst: true }], handleEvents, {
			pipeline: $defaultPipeline.for(cacheSubId)
		});

		const repliesSubId = `thread_replies_${data.id}_${replyKind}`;
		repliesSubscription = createPaginatedSubscription({
			subId: repliesSubId,
			requests: [request],
			pageRequests: [request],
			windowSeconds: FEED_PAGE_WINDOW_SECONDS,
			maxEmptyPages: 3,
			initialLoading: false,
			onMessage: handleEvents,
			onStateChange: (state) => (loading = state.loading),
			options: (subscriptionId) => ({ pipeline: $defaultPipeline.for(subscriptionId) })
		});
		repliesSubscription.start();
	}

	function resolveRoot(kind: number, author: string | null) {
		loading = false;
		rootKind = kind;
		if (repliesSubscription || relaysub) return;

		if (author) {
			relaysub = getUserRelays(
				author,
				(relays) => {
					const effectiveRelays = relays.length > 0 ? relays : data.relays || [];
					if (relays.length > 0) currentRelays = relays;
					subscribeToReplies(kind, effectiveRelays);
				},
				'read'
			);
		} else {
			subscribeToReplies(kind, data.relays || []);
		}
	}

	function handleRawRoot(event: RawNostrEvent) {
		resolveRoot(event.kind(), event.pubkey());
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

			sub = useSubscription(
				'event_' + data?.id,
				[
					{
						ids: [data?.id],
						limit: 1,
						relays: data.relays || [],
						cacheFirst: true
					}
				],
				(message: WorkerMessage) => {
					const parsedEvent = isParsedEvent(message);
					if (parsedEvent?.id() == data.id) {
						headerItem = parsedEvent;
						resolveRoot(parsedEvent.kind(), parsedEvent.pubkey());
					}
				},
				{
					bytesPerEvent: 50 * 1024,
					pipeline: $defaultPipeline.for('event_' + data?.id)
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
		repliesSubscription?.close();
		repliesSubscription = undefined;
	}

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		if (loading || feedItems.length === 0) return;
		repliesSubscription?.loadMore();
	}

	let imageContext = getContext('imageContext');

	onDestroy(() => {
		unsubscribe();
	});

	// Reset and re-subscribe when the target nevent changes in-place
	$: if (data?.id && data.id !== currentEventId) {
		unsubscribe();
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
			<h1 class="text-lg font-semibold">Thread</h1>
			<span></span>
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

		{#if data.id}
			<ReferencedEvent
				noteId={data.id}
				kind={rootKind}
				relays={currentRelays}
				{visible}
				onEvent={handleRawRoot}
				let:event
			>
				<Note customEvent={event} {context} {visible} zaps main>
					<svelte:fragment slot="body">
						<Highlight {event} />
					</svelte:fragment>
				</Note>
				<svelte:fragment slot="fallback">
					{#if headerItem}
						<Note note={headerItem} {context} {visible} zaps main />
					{/if}
				</svelte:fragment>
			</ReferencedEvent>
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="item-content" let:post let:visible>
		<Note
			note={post}
			{context}
			{visible}
			showRoot={false}
			showReplies={(newPost) => (replies) => {
				const rep = replies.filter((r) => {
					const kind1 = asKind1(r);
					const kind1111 = asKind1111(r);
					return (
						(r.pubkey() == post?.pubkey() || r.pubkey() == headerItem?.pubkey()) &&
						(kind1?.reply()?.id() == newPost?.id() || kind1111?.parentId() == newPost?.id())
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
