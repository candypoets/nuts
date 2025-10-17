<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ParsedEvent } from '@candypoets/nipworker';
	import {
		type RequestObject,
		type SubscribeKind,
		type WorkerMessage,
		MessageType
	} from '@candypoets/nipworker';
	import { asParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { key, lastNotificationView, writeRelays } from 'src/controller';
	import Feed from 'src/routes/explore/feed.svelte';
	import { onMount } from 'svelte';
	import { processNotifications } from './notifications';
	import Reactions from './reactions.svelte';
	import Replies from './replies.svelte';
	import Mentions from './mentions.svelte';

	export let visible = true;
	export let goBack: () => void;
	let loading = true;
	let notificationsData = [];
	let eoce = false;
	let feedRequests: RequestObject[] = [];

	function updateFeed(
		feed: ParsedEvent[],
		message: WorkerMessage,
		eventKind: SubscribeKind
	): ParsedEvent[] {
		let updatedFeed = feed;
		switch (message.type()) {
			case MessageType.Eoce:
				if (!eoce) {
					eoce = true;
				}
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message);
				if (!eoce) {
					updatedFeed = [...feed, parsedEvent as ParsedEvent];
				} else {
					updatedFeed = [...feed, parsedEvent as ParsedEvent].sort(
						(a, b) => b.createdAt() - a.createdAt()
					);
				}
				break;
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
			class="w-feed pt-safe bg-base-300 bg-opacity-85 backdrop-blur-gpu mt-1 rounded-lg h-20 pb-2 flex items-center justify-between shadow-sm"
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
