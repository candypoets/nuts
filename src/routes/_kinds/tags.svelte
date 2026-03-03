<script lang="ts">
	import {
		type ConnectionStatus,
		type ParsedEvent,
		type RequestObject
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind1,
		asParsedEvent,
		ConnectionTracker
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { getContext, onDestroy } from 'svelte';

	import RelaysList from 'src/components/RelaysList.svelte';
	import { isMobile } from 'src/controller';
	import { limit } from 'src/controller/pagination';
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
	let sub: (() => void) | undefined;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};
	let connectionTracker = new ConnectionTracker();

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
		if (sub) {
			sub?.();
			sub = undefined;
		}
		connectionStatus = {};
		connectionTracker = new ConnectionTracker();
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
				if (sub) {
					sub?.();
					sub = undefined;
				}
				connectionStatus = {};
				connectionTracker = new ConnectionTracker();
			}
		});
	}

	// Handle incoming events from subscription
	function handleEvents(message: any) {
		// Handle connection status (including EOSE detection via resolutionRate)
		const status = asConnectionStatus(message);
		if (status && connectionTracker) {
			const relayUrl = status.relayUrl()?.toString();
			if (relayUrl) {
				// Normalize URL to match what RelaysList expects
				const normalizedUrl = normalizeURL(relayUrl);
				// Create new object for reactivity
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
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
		if (kind !== 1 && kind !== 30023) return;

		// Filter: only show root events (skip replies)
		if (kind === 1) {
			const kind1 = asKind1(parsedEvent);
			if (kind1) {
				const reply = kind1.reply()?.id();
				const root = kind1.root()?.id();
				// CASE 1: Has reply but no root = reply to something (nested)
				if (reply && !root) {
					return;
				}
				// CASE 2: Has both reply and root, but reply != root = reply to reply (nested)
				if (reply && root && reply.fnv1aHash() !== root.fnv1aHash()) {
					return;
				}
				// CASE 3: No reply tag = root post (allow it)
			}
		}

		const eventId = parsedEvent.id()?.fnv1aHash();
		if (!eventId) return;

		const existingIndex = feedItems.findIndex((item) => item.id()?.fnv1aHash() === eventId);
		if (existingIndex === -1) {
			feedItems = [...feedItems, parsedEvent].sort((a, b) => b.createdAt() - a.createdAt());
		}
	}

	// Subscribe to tag feed
	$: if (visible && tags.length > 0) {
		if (!sub) {
			loading = true;
			sub = useSubscription(
				subId,
				[
					{
						kinds: [1],
						tags: { '#t': tags },
						limit: $limit,
						noCache: true,
						relays: currentRelays
					}
				],
				handleEvents
			);
			setSubRelays(subId, currentRelays);
		}
	}

	// Cleanup when not visible or tags change
	$: if (!visible || tags.length === 0) {
		sub?.();
		sub = undefined;
	}

	onDestroy(() => {
		sub?.();
		relaySubUnsubscribe?.();
	});
</script>

<Feed
	items={feedItems}
	getItemId={(item) => item?.id?.()?.fnv1aHash?.() ?? Math.random()}
	class={imageContext ? 'w-full' : 'w-feed'}
	{visible}
	{loading}
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
