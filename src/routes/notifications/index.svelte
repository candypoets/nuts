<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ParsedEvent, RequestObject, WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asParsedEvent, asConnectionStatus, ConnectionTracker } from '@candypoets/nipworker/utils';
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
	
	// Raw events from subscription
	let rawEvents: ParsedEvent[] = [];
	// Processed notifications (grouped by type)
	let notificationItems: ProcessedNotification[] = [];

	// Track seen event IDs to prevent duplicates
	let seenEventIds = new Set<number>();

	// Subscription cleanup function
	let unsubscribe: (() => void) | undefined;
	let connectionTracker: ConnectionTracker | undefined;

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
	function handleEvents(message: WorkerMessage) {
		// Handle connection status (including EOSE detection via resolutionRate)
		const status = asConnectionStatus(message);
		if (status && connectionTracker) {
			const relayUrl = status.relayUrl()?.toString();
			if (relayUrl) {
				connectionTracker.handleMessage(message);
				// When >50% of relays have reached EOSE, mark loading as done
				if (connectionTracker.resolutionRate > 0.5) {
					loading = false;
				}
			}
			return;
		}

		// Handle parsed events
		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent) return;

		const kind = parsedEvent.kind();
		if (![1, 6, 7].includes(kind)) return;

		const eventId = parsedEvent.id()?.fnv1aHash();
		if (!eventId) return;
		
		// Check Set first (O(1)) for duplicate detection
		if (seenEventIds.has(eventId)) return;
		seenEventIds.add(eventId);

		rawEvents = [...rawEvents, parsedEvent];
	}

	// Process raw events into grouped notifications
	$: notificationItems = processNotifications(rawEvents);

	// Initialize subscription
	let hasInitialized = false;
	
	function initSubscription() {
		if (!visible || !$key?.pub) return;
		if (hasInitialized) return;
		
		hasInitialized = true;
		loading = true;
		const requests = buildRequests();
		if (requests.length > 0) {
			unsubscribe?.();
			connectionTracker = new ConnectionTracker();
			unsubscribe = useSubscription(
				'notifications_' + $key.pub,
				requests,
				handleEvents,
				{ bytesPerEvent: 10 * 1024 }
			);
		}
	}
	
	$: if (visible && $key?.pub && !hasInitialized) {
		initSubscription();
	}

	// Cleanup subscription when not visible
	$: if (!visible) {
		unsubscribe?.();
		unsubscribe = undefined;
		connectionTracker = undefined;
		hasInitialized = false;
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
	getItemId={(item) => {
		// ProcessedNotification has id() that returns { fnv1aHash: () => string }
		const idObj = item?.id?.();
		if (idObj && typeof idObj.fnv1aHash === 'function') {
			return idObj.fnv1aHash();
		}
		return Math.random().toString();
	}}
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
				{@const parsed = post.parsed}
				<div class="p-4 border-b">
					<div class="flex items-center">
						<Icon icon="mdi:repeat" class="text-green-500 mr-2" />
						<span>
							{parsed.events?.length || 0}
							{(parsed.events?.length || 0) === 1 ? 'person' : 'people'} reposted your content
						</span>
					</div>
					<div class="mt-2 pl-6 text-sm text-gray-600">
						{#if parsed.originalPost}
							"{parsed.originalPost.content?.substring(0, 100)}{parsed.originalPost.content?.length > 100
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
