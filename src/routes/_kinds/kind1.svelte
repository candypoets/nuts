<script lang="ts">
	import {
		MessageType,
		type ConnectionStatus,
		type ParsedEvent,
		type RequestObject,
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

	import RelaysList from 'src/components/RelaysList.svelte';
	import { limit } from 'src/controller/pagination';
	import Feed from 'src/routes/explore/feed.svelte';
	import Note from 'src/routes/explore/note.svelte';
	import Reply from 'src/routes/explore/reply.svelte';
	import { getUserRelays } from 'src/routes/queries/user';
	import { go } from '../modals/modal';
	import User from '../explore/user.svelte';
	import { isMobile } from 'src/controller';
	import { normalizeURL } from 'nostr-tools/utils';

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
	let relaysub: (() => void) | undefined;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	const { data } = decode(nevent) as unknown as { data: EventPointer };

	// Feed items managed by parent
	let feedItems: ParsedEvent[] = [];

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl()?.toString();
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
					if (kind1.reply()?.id() && kind1.reply()?.id()?.toString() != data?.id) return;
					if (
						(!kind1.reply()?.id() ||
							kind1.reply()?.id()?.toString() == kind1.root()?.id()?.toString()) &&
						kind1?.root()?.id()?.toString() != data?.id
					)
						return;
					// if replies are quote return the feed
					if (fbArray(kind1, 'mentions').some((q) => q.id()?.toString() == data.id)) return;

					const eventId = parsedEvent.id()?.fnv1aHash();
					const existingIndex = feedItems.findIndex((item) => item.id()?.fnv1aHash() === eventId);
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
		if (visible && !sub) {
			console.log('subscribe');
			// Timeout to stop loading if event is not found
			timeout = setTimeout(() => {
				if (loading) {
					console.log('kind1 loading timeout - event not found');
					loading = false;
				}
			}, 5000);
			sub = useSubscription(
				'kind1_' + data?.id,
				[
					{
						kinds: [1],
						ids: [data?.id],
						limit: 5,
						relays: data.relays || [],
						cacheFirst: true
					}
				], // limits higher to accomodate for huge posts
				(message: WorkerMessage) => {
					const parsedEvent = isParsedEvent(message);
					const kind1 = isKind1(message);
					if (kind1 && parsedEvent && parsedEvent.id()?.toString() == data.id) {
						loading = false;
						// profile = event;
						headerItem = parsedEvent;
						relaysub = getUserRelays(
							parsedEvent?.pubkey()?.toString(),
							(relays) => {
								// Subscribe to replies for this post
								if (!feedItems.length) {
									useSubscription(
										'replies_' + data?.id,
										[
											{
												kinds: [1],
												tags: { '#e': [data?.id] },
												limit: $limit,
												noContext: true,
												relays
											}
										],
										handleEvents
									);
								}
							},
							'read'
						);
					}
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
	}

	let imageContext = getContext('imageContext');

	onDestroy(unsubscribe);

	$: visible ? subscribe() : unsubscribe();
</script>

<Feed
	items={feedItems}
	getItemId={(item) => item?.id?.()?.fnv1aHash?.() ?? Math.random()}
	class={imageContext ? 'w-full' : 'w-feed'}
	{visible}
	{loading}
>
	<svelte:fragment slot="sticky-header">
		<div class="px-4 py-3 flex items-center justify-between bg-base-100 bg-opacity-90">
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
				<button
					on:click={goBack}
					class="p-1 rounded-full bg-base-200 bg-opacity-85 backdrop-blur-gpu mr-4"
				>
					<Icon icon="mdi:arrow-left" class="text-xl" />
				</button>
				<!-- <h1 class="text-lg font-semibold">Post</h1> -->
				<RelaysList
					relays={(data.relays || []).map(normalizeURL)}
					{connectionStatus}
					mini={$isMobile}
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
						(r.pubkey()?.fnv1aHash() == post?.pubkey()?.fnv1aHash() ||
							r.pubkey()?.fnv1aHash() == headerItem?.pubkey()?.fnv1aHash()) &&
						kind1?.reply()?.id()?.fnv1aHash() == newPost?.id()?.fnv1aHash()
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
