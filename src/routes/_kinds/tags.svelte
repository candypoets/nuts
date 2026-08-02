<script lang="ts">
	import {
		type ConnectionStatus,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import {
		createPaginatedSubscription,
		type PaginatedSubscription
	} from '@candypoets/nipworker/hooks';
	import { asConnectionStatus, asKind1, asParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { getContext, onDestroy } from 'svelte';

	import RelaysList from 'src/components/RelaysList.svelte';
	import { isMobile } from 'src/controller';
	import { FEED_PAGE_WINDOW_SECONDS, limit } from 'src/controller/pagination';
	import { relaySub, setSubRelays } from 'src/controller/relay';
	import { normalizeURL } from 'nostr-tools/utils';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import Feed from 'src/routes/explore/feed.svelte';
	import Note from 'src/routes/explore/note.svelte';
	import Notifications from '../explore/notifications.svelte';

	export let tags: string[] = [];
	export let visible: boolean;
	export let goBack: () => void;

	let loading = true;

	// Feed items managed by parent
	let feedItems: ParsedEvent[] = [];

	let headerItem: ParsedEvent | undefined;
	let context: ParsedEvent[] = [];
	let feedSubscription: PaginatedSubscription | undefined;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let imageContext = getContext('imageContext');

	// Dynamic relay management
	let currentRelays = DEFAULT_RELAYS;
	let relayCounter = 0;
	let currentSubId: string | undefined;
	let relaySubUnsubscribe: (() => void) | undefined;

	// Generate subId based on tags (use join to ensure unique ids for different tag combinations)
	$: subId = 'tags_' + tags.join('_');

	// Track last tags to detect changes
	let lastTags: string[] = [];
	$: if (JSON.stringify(tags) !== JSON.stringify(lastTags)) {
		// Tags changed - reset feed and subscription
		lastTags = [...tags];
		feedItems = [];
		feedSubscription?.close();
		feedSubscription = undefined;
		connectionStatus = {};
	}

	// Subscribe to relay changes for this subId
	$: if (subId && subId !== currentSubId) {
		// Clean up previous subscription before creating new one
		relaySubUnsubscribe?.();
		currentSubId = subId;
		relaySubUnsubscribe = relaySub(subId).subscribe((subRelays) => {
			if (subRelays && JSON.stringify(subRelays) !== JSON.stringify(currentRelays)) {
				currentRelays = subRelays;
				relayCounter++;
				// Reset subscription with new relays
				feedSubscription?.close();
				feedSubscription = undefined;
				connectionStatus = {};
			}
		});
	}

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage): number | undefined {
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				const normalizedUrl = normalizeURL(relayUrl);
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
			}
			return undefined;
		}

		// Handle parsed events
		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent) return undefined;
		const kind = parsedEvent.kind();
		if (kind !== 1 && kind !== 30023) return undefined;

		// Filter: only show root events (skip replies)
		if (kind === 1) {
			const kind1 = asKind1(parsedEvent);
			if (kind1) {
				const reply = kind1.reply()?.id();
				const root = kind1.root()?.id();
				// CASE 1: Has reply but no root = reply to something (nested)
				if (reply && !root) {
					return undefined;
				}
				// CASE 2: Has both reply and root, but reply != root = reply to reply (nested)
				if (reply && root && reply !== root) {
					return undefined;
				}
				// CASE 3: No reply tag = root post (allow it)
			}
		}

		const eventId = parsedEvent.id();
		if (!eventId) return;

		const existingIndex = feedItems.findIndex((item) => item.id() === eventId);
		if (existingIndex === -1) {
			feedItems = [...feedItems, parsedEvent].sort((a, b) => b.createdAt() - a.createdAt());
			return parsedEvent.createdAt();
		}
		return undefined;
	}

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		if (loading || feedItems.length === 0) return;
		feedSubscription?.loadMore();
	}

	// Subscribe to tag feed
	$: if (visible && tags.length > 0) {
		if (!feedSubscription) {
			const subscriptionSubId = `${subId}_${relayCounter}`;
			feedSubscription = createPaginatedSubscription({
				subId: subscriptionSubId,
				requests: [
					{
						kinds: [1],
						tags: { '#t': tags },
						limit: $limit,
						noCache: true,
						relays: currentRelays
					}
				],
				windowSeconds: FEED_PAGE_WINDOW_SECONDS,
				maxEmptyPages: 3,
				onMessage: handleEvents,
				onStateChange: (state) => (loading = state.loading)
			});
			feedSubscription.start();
			setSubRelays(subId, currentRelays);
		}
	}

	// Cleanup when not visible or tags change
	$: if (!visible || tags.length === 0) {
		feedSubscription?.close();
		feedSubscription = undefined;
	}

	onDestroy(() => {
		feedSubscription?.close();
		relaySubUnsubscribe?.();
	});
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
		<div class="px-4 py-3 flex items-center justify-between bg-base-300 bg-opacity-85">
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold text-primary">{tags.map((tag) => `#${tag}`).join(' ')}</h1>
			<span />
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		{#if !imageContext}
			<div
				class="w-feed pt-safe border-primary-content h-20 flex items-center justify-between bg-base-300 bg-opacity-90 rounded-lg px-4"
			>
				<div class="flex gap-2">
					<button on:click={goBack} class="p-1 rounded-full bg-base-200 bg-opacity-85 mr-4">
						<Icon icon="mdi:arrow-left" class="text-xl" />
					</button>
					<h1 class="text-lg font-semibold text-primary">
						{tags.map((tag) => `#${tag}`).join(' ')}
					</h1>
				</div>
				<RelaysList {subId} relays={currentRelays} {connectionStatus} mini={$isMobile} />
				<!-- <span class="w-10" /> -->
			</div>
		{/if}

		{#if headerItem}
			<Note note={headerItem} {context} {visible} zaps main />
		{/if}
	</svelte:fragment>
</Feed>
