<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ParsedEvent, RequestObject } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { key, lastNotificationView, writeRelays } from 'src/controller';
	import Feed from 'src/routes/explore/feed.svelte';
	import { onMount } from 'svelte';
	import { processNotifications, type ProcessedNotification } from './notifications';
	import Reactions from './reactions.svelte';
	import Replies from './replies.svelte';
	import Mentions from './mentions.svelte';

	export let visible = true;
	export let goBack: () => void;

	let loading = true;
	let eoce = false;

	// Raw events from subscription
	let rawEvents: ParsedEvent[] = [];
	// Processed notifications (grouped by type)
	let notificationItems: ProcessedNotification[] = [];

	// Subscription cleanup function
	let unsubscribe: (() => void) | undefined;

	// Build subscription requests
	function buildRequests(): RequestObject[] {
		if (!$key?.pub) {
			return [];
		}

		return [
			// Mentions of user, reactions to user's posts, reposts of user's content
			{
				kinds: [1, 7, 6],
				tags: { '#p': [$key.pub] },
				limit: 50,
				relays: $writeRelays,
				noCache: true
			},
			{
				kinds: [1, 7, 6],
				tags: { '#p': [$key.pub] },
				limit: 50,
				relays: $writeRelays,
				cacheFirst: true
			}
		];
	}

	// Handle incoming events from subscription
	function handleEvents(message: any) {
		const event = message.type ? message : null;
		if (!event) return;

		// Handle EOSE (End of Stream Event)
		if (event.type && typeof event.type === 'function' && event.type() === 3) {
			// EOSE message type
			eoce = true;
			loading = false;
			return;
		}

		// Handle parsed events
		if (event.kind && [1, 6, 7].includes(event.kind())) {
			const parsedEvent = asParsedEvent(message) as ParsedEvent;
			const eventId = parsedEvent.id()?.fnv1aHash();
			const existingIndex = rawEvents.findIndex(
				(item) => item.id()?.fnv1aHash() === eventId
			);
			if (existingIndex === -1) {
				if (!eoce) {
					rawEvents = [...rawEvents, parsedEvent];
				} else {
					rawEvents = [...rawEvents, parsedEvent].sort(
						(a, b) => b.createdAt() - a.createdAt()
					);
				}
			}
		}
	}

	// Process raw events into grouped notifications
	$: notificationItems = processNotifications(rawEvents);

	// Initialize subscription
	$: if (visible && $key?.pub) {
		if (rawEvents.length === 0 && !unsubscribe) {
			loading = true;
			const requests = buildRequests();
			if (requests.length > 0) {
				unsubscribe = useSubscription(
					'notifications_' + $key.pub,
					requests,
					handleEvents,
					{ bytesPerEvent: 10 * 1024 }
				);
			}
		}
	}

	// Cleanup subscription when not visible
	$: if (!visible) {
		unsubscribe?.();
		unsubscribe = undefined;
	}

	onMount(() => {
		$lastNotificationView = Date.now();
		window.scrollTo(0, 0);
		return () => {
			unsubscribe?.();
		};
	});
</script>

<!-- Header for the page -->
<Feed
	items={notificationItems}
	{loading}
	{visible}
	getItemId={(item) => item?.id?.()?.fnv1aHash?.() ?? Math.random()}
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
