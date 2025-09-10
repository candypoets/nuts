<script lang="ts">
	import {
		MessageType,
		type ConnectionStatus,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind1, asParsedEvent, isKind1, isParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { decode, type EventPointer } from 'nostr-tools/nip19';
	import { getContext, onDestroy } from 'svelte';

	import RelaysList from 'src/components/RelaysList.svelte';
	import { limit } from 'src/controller/pagination';
	import Feed from 'src/routes/explore/feed.svelte';
	import Note from 'src/routes/explore/note.svelte';
	import Reply from 'src/routes/explore/reply.svelte';
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
	let feedRequests: RequestObject[] = [];
	let timeout: NodeJS.Timeout | undefined;
	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	const { data } = decode(nevent) as unknown as { data: EventPointer };

	function updateFeed(feed: ParsedEvent[], message: WorkerMessage): ParsedEvent[] {
		switch (message.type()) {
			case MessageType.Eoce:
				eoce = true;
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (parsedEvent) {
					const kind1 = asKind1(parsedEvent);
					if (kind1) {
						// only show replies to root posts
						if (kind1.reply()?.id() && kind1.reply()?.id()?.toString() != data?.id) return feed;
						if (
							(!kind1.reply()?.id() ||
								kind1.reply()?.id()?.toString() == kind1.root()?.id()?.toString()) &&
							kind1?.root()?.id()?.toString() != data?.id
						)
							return feed;
						// check if the event is already in the feed
						if (feed.some((e) => e.id()?.fnv1aHash() === parsedEvent.id()?.fnv1aHash()))
							return feed;
						if (!eoce) {
							// cached event are filtered in the worker
							return [...feed, parsedEvent];
						} else {
							if (parsedEvent.createdAt() >= feed?.[0]?.createdAt()) {
								return [parsedEvent, ...feed];
							} else {
								// Add the event to the feed and sort by created_at (most recent first)
								return [...feed, parsedEvent].sort((a, b) => b.createdAt() - a.createdAt());
							}
						}
					}
				}
				break;
		}
		return feed;
	}

	function subscribe() {
		if (visible && !sub) {
			sub = useSubscription(
				data?.id,
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
								feedRequests = [
									{
										kinds: [1],
										tags: { '#e': [data?.id] },
										limit: $limit,
										noContext: true,
										relays
									}
								];
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
			sub?.();
			sub = undefined;
			relaysub?.();
			relaysub = undefined;
		}
	}

	let imageContext = getContext('imageContext');

	onDestroy(unsubscribe);

	$: visible ? subscribe() : unsubscribe();
</script>

<Feed
	subscriptionID={'kind1' + data?.id}
	requests={feedRequests}
	class="w-feed"
	{headerItem}
	{updateFeed}
	{visible}
	bind:connectionStatus
	backdrop
>
	<svelte:fragment slot="sticky-header">
		<div
			class="px-4 py-3 flex items-center justify-between backdrop-blur bg-base-100 bg-opacity-90"
		>
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
				class="w-feed unsafe-padding-top border-b border-base-200 h-16 flex items-center justify-between shadow-sm"
			>
				<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
					<Icon icon="mdi:arrow-left" class="text-xl" />
				</button>
				<h1 class="text-lg font-semibold">Post</h1>
				<span class="w-10" />
			</div>
		{/if}

		{#if headerItem}
			<Note note={headerItem} {context} {visible} zaps main />
		{/if}
		<RelaysList relays={data.relays || []} {connectionStatus} />
	</svelte:fragment>
	<svelte.fragment slot="sticky-footer">
		<div class="md:pb-4 pb-safe pt-0 backdrop-blur-md">
			{#if headerItem}
				<Reply parent={headerItem} {context} actionsOnTop />
			{/if}
		</div>
	</svelte.fragment>
	<svelte:fragment slot="item-content" let:post let:visible>
		<Note
			note={post}
			{context}
			{visible}
			showRoot={false}
			showReplies={(replies) =>
				replies.filter((r) => r.pubkey == headerItem?.pubkey || r.pubkey == post?.pubkey)}
			zaps
		/>
	</svelte:fragment>
</Feed>
