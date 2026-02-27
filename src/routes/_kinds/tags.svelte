<script lang="ts">
	import {
		type ConnectionStatus,
		type ParsedEvent,
		type RequestObject
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asConnectionStatus, asParsedEvent, ConnectionTracker } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { getContext, onDestroy } from 'svelte';

	import RelaysList from 'src/components/RelaysList.svelte';
	import { isMobile } from 'src/controller';
	import { limit } from 'src/controller/pagination';
	import { relaySub, setSubRelays } from 'src/controller/relay';
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

	// Handle incoming events from subscription
	function handleEvents(message: any) {
		// Handle connection status (including EOSE detection via resolutionRate)
		const status = asConnectionStatus(message);
		if (status && connectionTracker) {
			const relayUrl = status.relayUrl()?.toString();
			if (relayUrl) {
				// Create new object for reactivity
				connectionStatus = { ...connectionStatus, [relayUrl]: status };
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
			const subId = 'tags_' + tags.reduce((acc, cur) => (acc += cur), '');
			sub = useSubscription(
				subId,
				[
					{
						kinds: [1],
						tags: { '#t': tags },
						limit: $limit,
						noCache: true,
						relays: DEFAULT_RELAYS
					}
				],
				handleEvents
			);
			setSubRelays(subId, DEFAULT_RELAYS);
		}
	}

	// Cleanup when not visible or tags change
	$: if (!visible || tags.length === 0) {
		sub?.();
		sub = undefined;
	}

	onDestroy(() => {
		sub?.();
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
				<RelaysList relays={DEFAULT_RELAYS} {connectionStatus} mini={$isMobile} />
				<!-- <span class="w-10" /> -->
			</div>
		{/if}

		{#if headerItem}
			<Note note={headerItem} {context} {visible} zaps main />
		{/if}
	</svelte:fragment>
</Feed>
