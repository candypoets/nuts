<script lang="ts">
	import { page } from '$app/stores';
	import { ago, DAY } from 'src/lib/period';
	import { isKind0, isKind1, type AnyKind, type Kind0Parsed, type Kind1Parsed } from 'src/parsers';
	import Feed from 'src/routes/explore/feed.svelte';
	import { nostrManager, type EventKind } from 'src/wasm/manager';
	import type { NIP02Parsed } from 'src/workers/nip02';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import Note from 'src/routes/explore/note.svelte';
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { goto } from '$app/navigation';

	// Get pubkey from URL parameter
	const post = $page.params.post;

	let headerItem: ParsedEvent<Kind1Parsed> | undefined;
	let context: ParsedEvent<AnyKind>[] | undefined;
	let loading = true;
	let feedRequests: any[] = [];

	// Function to handle navigation back
	function goBack() {
		// Try to go back in history if possible
		if (window.history.length > 1) {
			window.history.back();
		} else {
			// If no history, go to explore page
			goto('/explore');
		}
	}

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: EventKind
	): [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] {
		const [event, ...context] = events;
		if (isKind1(event)) {
			// only show replies to root posts
			if (event?.parsed?.reply?.id && event?.parsed?.root?.id != event?.parsed?.reply?.id)
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

	onMount(() => {
		window.scrollTo(0, 0);
		const sub = nostrManager.subscribe(
			'profile_' + post,
			[{ kinds: [1], ids: [post], limit: 1, relays: [], cacheFirst: true }],
			(events: ParsedEvent<AnyKind>[]) => {
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
							tags: { '#e': [post] },
							since: ago(30 * DAY)
						}
					];
				}
			}
		);
		return sub;
	});
</script>

{#if headerItem && feedRequests.length > 0}
	<Feed subscriptionID={'replies_' + post} requests={feedRequests} {headerItem} {updateFeed}>
		<svelte:fragment slot="sticky-header">
			<div
				class="w-full border-b border-base-200 px-4 py-3 flex items-center justify-between shadow-sm"
			>
				<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
					<Icon icon="mdi:arrow-left" class="text-xl" />
				</button>
				<h1 class="text-lg font-semibold">Post</h1>
				<span />
			</div>
		</svelte:fragment>
		<svelte.fragment slot="header-content" let:item>
			<Note note={item} {context} visible={true} zaps />
			<div class="w-feed h-12" />
		</svelte.fragment>
		<svelte.fragment slot="item-content" let:post let:context let:visible>
			<Note
				note={post}
				{context}
				{visible}
				showRoot={false}
				showReplies={(replies) => replies.filter((r) => r.pubkey == headerItem.pubkey)}
				zaps
			/>
		</svelte.fragment>
	</Feed>
{/if}
