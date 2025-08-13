<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { key, kind10002, lastNotificationView, writeRelays } from 'src/controller';
	import type { Request, SubscribeKind, AnyKind } from '@candypoets/nipworker';
	import Feed from 'src/routes/explore/feed.svelte';
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { onMount } from 'svelte';
	import Mentions from './mentions.svelte';
	import { processNotifications } from './notifications';
	import Reactions from './reactions.svelte';
	import Replies from './replies.svelte';
	import { chatManager } from 'src/controller/managers';

	export let visible = true;
	export let goBack: () => void;
	let loading = true;
	let notificationsData = [];
	let feedRequests: Request = [];

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: SubscribeKind
	): [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] {
		if (eventKind == 'CONNECTION_STATUS') return feed;
		const [event, ...context] = events;
		if (event.pubkey == $key?.pub) return feed;
		if (!event || !event.parsed) return feed;

		// Add new events to our feed for processing
		let updatedFeed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][];

		if (eventKind === 'CACHED_EVENT') {
			// For cached events, just add them to the feed
			updatedFeed = [...feed, [event, _.uniqBy(context, 'id')]];
		} else if (eventKind === 'FETCHED_EVENT') {
			// For fetched events, add them in timestamp order
			if (feed.length === 0 || event.created_at >= feed[0][0].created_at) {
				updatedFeed = [[event, _.uniqBy(context, 'id')], ...feed];
			} else {
				// Add and sort by timestamp
				updatedFeed = [...feed, [event, _.uniqBy(context, 'id')]].sort(
					(a, b) => b[0].created_at - a[0].created_at
				);
			}
		} else {
			return feed;
		}
		const processedFeed = processNotifications(updatedFeed);

		// Process the updated feed into grouped notifications
		return processedFeed;
	}

	onMount(() => {
		$lastNotificationView = Date.now();
		feedRequests =
			($key &&
				$key.pub && [
					// Mentions of user, reactions to user's posts, reposts of user's content
					{
						kinds: [1, 7, 6],
						tags: { '#p': [$key?.pub] },
						limit: 100,
						relays: $writeRelays
					}
					// Replies to user's posts
					// {
					// 	kinds: [1],
					// 	'#e': [], // This will be populated with the user's post IDs
					// 	limit: 40,
					// 	since: ago(14 * DAY)
					// }
				]) ||
			[];
		window.scrollTo(0, 0);
		loading = false;
	});
</script>

<!-- Header for the page -->
<Feed
	subscriptionID="notifications"
	requests={feedRequests}
	{updateFeed}
	{visible}
	headerItem={{ id: 'header' }}
>
	<svelte:fragment slot="sticky-header">
		<div
			class=" w-feed border-b border-base-200 px-4 py-3 h-16 flex items-center justify-between backdrop-blur"
		>
			<button on:click={() => goBack()} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold">Notifications</h1>
			<span class="w-10" />
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		<div
			class="w-feed unsafe-padding-top border-b border-base-200 h-16 flex items-center justify-between shadow-sm"
		>
			<button on:click={() => goBack()} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold">Notifications</h1>
			<span class="w-10" />
		</div>
	</svelte:fragment>

	<svelte:fragment slot="item-content" let:post let:context let:visible>
		<!-- {#if visible} -->
		{#if post.type === 'reply'}
			<Replies {post} {visible} />
		{:else if post.type === 'reaction'}
			<Reactions {post} {visible} />
		{:else if post.type === 'mention'}
			<Mentions {post} {visible} />
		{:else if post.type === 'repost'}
			<div class="p-4 border-b">
				<div class="flex items-center">
					<Icon icon="mdi:repeat" class="text-green-500 mr-2" />
					<span>
						{post.events.length}
						{post.events.length === 1 ? 'person' : 'people'} reposted your content
					</span>
				</div>
				<div class="mt-2 pl-6 text-sm text-gray-600">
					{#if post.originalPost}
						"{post.originalPost.content.substring(0, 100)}{post.originalPost.content.length > 100
							? '...'
							: ''}"
					{/if}
				</div>
			</div>
			<!-- {/if} -->
		{:else}
			<!-- Placeholder for non-visible items to maintain scroll performance -->
			<div class="p-4 border-b h-32"></div>
		{/if}
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
