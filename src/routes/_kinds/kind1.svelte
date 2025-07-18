<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import Note from 'src/routes/explore/note.svelte';
	import type { ParsedEvent } from 'src/types';
	import { isKind1, type AnyKind, type Kind1Parsed } from 'src/types';
	import { getContext, onDestroy } from 'svelte';
	import Reply from '../explore/reply.svelte';
	import { decode, type EventPointer } from 'nostr-tools/nip19';
	import { useSubscription, type SubscribeKind } from 'src/model/nostr-main';
	import { type Request } from 'src/model/nostr-main/pkg/nostr_main.js';
	import RelaysList from 'src/components/RelaysList.svelte';
	import Feed from '../explore/feed.svelte';
	import { getUserRelays } from '../queries/user';

	export let nevent: string;
	export let visible: boolean;
	export let depth: number = 0;
	export let goBack: () => void;

	let headerItem: ParsedEvent<Kind1Parsed> | undefined;
	let context: ParsedEvent<AnyKind>[] | undefined;
	let loading = true;
	let feedRequests: Request[] = [];
	let timeout: NodeJS.Timeout | undefined;
	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	const { data } = decode(nevent) as unknown as { data: EventPointer };

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: SubscribeKind
	): [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] {
		if (eventKind == 'EOSE') return feed;
		const [event, ...context] = events;
		if (isKind1(event)) {
			// only show replies to root posts
			if (event?.parsed?.reply?.id && event.parsed?.reply?.id != data?.id) return feed;
			if (
				(!event?.parsed?.reply?.id || event?.parsed?.reply?.id == event?.parsed?.root?.id) &&
				event.parsed?.root?.id != data?.id
			)
				return feed;
			// check if the event is already in the feed
			if (feed.some(([e]) => e.id === event.id)) return feed;
			if (eventKind == 'CACHED_EVENT') {
				// cached event are filtered in the worker
				return [...feed, [event, _.uniqBy(context, 'id')]];
			} else if (eventKind == 'FETCHED_EVENT') {
				if (event.created_at >= feed?.[0]?.[0]?.created_at) {
					return [[event, _.uniqBy(context, 'id')], ...feed];
				} else {
					// Add the event to the feed and sort by created_at (most recent first)
					return [...feed, [event, _.uniqBy(context, 'id')]].sort(
						(a, b) => b[0].created_at - a[0].created_at
					);
				}
			}
		} else {
			return feed;
		}
	}

	function subscribe() {
		timeout = setTimeout(() => {
			if (visible && !sub) {
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
					(events: ParsedEvent<AnyKind>[], kind: SubscribeKind) => {
						if (kind == 'EOSE') {
							return console.log(events);
						}
						const [event, ...rest] = events;
						if (!event?.parsed) return;
						if (isKind1(event)) {
							loading = false;
							// console.log('note events', note?.id, randomId, events, context);
							// profile = event;
							headerItem = event;
							context = rest;
							relaysub = getUserRelays(
								event.pubkey,
								(relays) => {
									feedRequests = [
										{
											kinds: [1],
											tags: { '#e': [data?.id] },
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
		}, 200);
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
	subscriptionID={'f_' + data?.id}
	requests={feedRequests}
	class="w-feed"
	{headerItem}
	{updateFeed}
	{visible}
>
	<svelte:fragment slot="sticky-header">
		<!-- {#if !imageContext} -->
		<div
			class="px-4 py-3 flex items-center justify-between backdrop-blur bg-base-100 bg-opacity-90"
		>
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold">Post</h1>
			<span />
		</div>
		<!-- {:else}
			<span />
		{/if} -->
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
		<RelaysList class="px-4" relays={data.relays || []} />
		{#if headerItem}
			<Note note={headerItem} {context} {visible} zaps />
		{/if}
	</svelte:fragment>
	<svelte.fragment slot="sticky-footer">
		<div class="m-safe py-4">
			{#if headerItem}
				<Reply parent={headerItem} {context} actionsOnTop />
			{/if}
		</div>
	</svelte.fragment>
	<svelte:fragment slot="item-content" let:post let:context let:visible>
		<Note
			note={post}
			{context}
			{visible}
			showRoot={false}
			showReplies={(replies) => replies.filter((r) => r.pubkey == headerItem?.pubkey)}
			zaps
		/>
	</svelte:fragment>
</Feed>
