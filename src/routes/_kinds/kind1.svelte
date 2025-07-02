<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { isKind1, type AnyKind, type Kind1Parsed } from 'src/types';
	import Feed from 'src/routes/explore/feed.svelte';
	import Note from 'src/routes/explore/note.svelte';
	import {
		nostrManager,
		useSharedSubscription,
		type Request,
		type SubscribeKind
	} from 'src/model/nostr-main';
	import type { ParsedEvent } from 'src/types';
	import { getContext, onDestroy, onMount } from 'svelte';
	import Reply from '../explore/reply.svelte';
	import User from '../explore/user.svelte';

	export let postId: string;
	export let visible: boolean;
	export let depth: number = 0;

	let headerItem: ParsedEvent<Kind1Parsed> | undefined;
	let context: ParsedEvent<AnyKind>[] | undefined;
	let loading = true;
	let feedRequests: Request[] = [];
	let timeout: NodeJS.Timeout | undefined;
	let sub: () => void;

	function goBack() {
		// Get current path
		const currentPath = $page.url.pathname;

		// Find the last "/" and get everything before it
		const lastSlashIndex = currentPath.lastIndexOf('/');

		if (lastSlashIndex > 0) {
			// Navigate to the parent path (everything before last slash)
			const parentPath = currentPath.substring(0, lastSlashIndex);
			goto(parentPath);
		} else {
			// If no slash or at root, go to explore page
			goto('/explore');
		}
	}

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: SubscribeKind
	): [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] {
		if (eventKind == 'EOSE') return feed;
		const [event, ...context] = events;
		if (isKind1(event)) {
			// only show replies to root posts
			if (event?.parsed?.reply?.id && event.parsed?.reply?.id != postId) return feed;
			if (
				(!event?.parsed?.reply?.id || event?.parsed?.reply?.id == event?.parsed?.root?.id) &&
				event.parsed?.root?.id != postId
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
		timeout = setTimeout(async () => {
			if (visible) {
				sub = useSharedSubscription(
					'kind1_' + postId,
					[{ kinds: [1], ids: [postId], limit: 5, relays: [], cacheFirst: true }], // limits higher to accomodate for huge posts
					(events: ParsedEvent<AnyKind>[], kind: SubscribeKind) => {
						console.log('event', events, kind);
						if (kind == 'EOSE') return;
						const [event, ...rest] = events;
						if (!event?.parsed) return;
						if (isKind1(event)) {
							loading = false;
							// console.log('note events', note?.id, randomId, events, context);
							// profile = event;
							headerItem = event;
							context = rest;
							feedRequests = [
								{
									kinds: [1],
									tags: { '#e': [postId] },
									relays: []
								}
							];
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
		}
	}

	let imageContext = getContext('imageContext');

	onDestroy(unsubscribe);

	$: visible ? subscribe() : unsubscribe();
</script>

<Feed
	subscriptionID={'kind1_feed_' + postId}
	requests={feedRequests}
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
		{#if headerItem}
			<Note note={headerItem} {context} {visible} zaps />
			<Reply parent={headerItem} {context} />
		{/if}
	</svelte:fragment>
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
