<script lang="ts">
	import type {
		ConnectionStatus,
		Kind3Parsed,
		ListParsed,
		ParsedEvent,
		RequestObject,
		WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind0,
		asKind1,
		asKind3,
		asNip51,
		asParsedEvent,
		ConnectionTracker,
		fbArray
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { isEqual, uniq } from 'lodash';

	import { normalizeURL } from 'nostr-tools/utils';
	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { key } from 'src/controller';
	import { followPacks } from 'src/controller/feed';
	import { kind0, kind3, readRelays } from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import { relaySub, setSubRelays } from 'src/controller/relay';
	import { ago } from 'src/lib/period';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import Feed from 'src/routes/explore/feed.svelte';
	import { go } from 'src/routes/modals/modal';
	import { onMount } from 'svelte';
	import Notifications from './notifications.svelte';

	export let visible = true;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};
	let connectionTracker = new ConnectionTracker();

	// Feed items managed by parent
	let feedItems: ParsedEvent[] = [];
	let loading = false;
	let refreshing = false;

	// Track seen event IDs to prevent duplicates
	let seenEventIds = new Set<number>();

	// Pagination state
	let until: number | undefined = undefined;
	let hasMore = true;
	let paginationCounter = 0;
	let itemsBeforePagination = 0;
	let paginationTimeout: ReturnType<typeof setTimeout> | undefined;

	// Viewport state from Feed
	let start = 0;
	let end = 0;

	// New posts tracking for batchNewItems behavior
	let newPostsCount = 0;
	let lastSeenTopItem: number | undefined;

	// Observable array of tags derived from the current URL.
	let tags: string[] = [];

	$: follows = $kind3
		? fbArray(asKind3($kind3) as Kind3Parsed, 'contacts')
				.map((c) => c.pubkey()?.toString())
				.filter((p): p is string => typeof p === 'string')
		: [];

	$: following = uniq(
		[
			...$followPacks.flatMap(
				(pack) => fbArray(asNip51(pack) as ListParsed, 'people').map((p) => p.toString()) || []
			),
			...(($followPacks.some((fp) => asNip51(fp)?.title()?.toString() == 'followlist') &&
				follows) ||
				[])
		].filter((p): p is string => typeof p === 'string')
	);

	$: subId =
		$followPacks.reduce((acc, cur) => acc + cur.id()?.fnv1aHash(), 'feed') + tags.join(',');

	// Track last subId to detect followlist changes and reset feed
	let lastSubId: string | undefined;
	$: if (subId !== lastSubId) {
		lastSubId = subId;
		// Followlist changed, reset feed to trigger new subscription
		if (hasInitialized) {
			resetFeed();
			hasInitialized = false;
			relayCounter++;
		}
	}

	$: relays = $readRelays;

	// Filter out undefined values from relays
	$: normalizedRelays = (relays.filter((r) => typeof r === 'string') as string[]).map(normalizeURL);

	let relayCounter = 0;

	function handleSubRelays(subRelays: string[] | undefined) {
		if (subRelays && !isEqual(relays, subRelays)) {
			relays = subRelays;
			resetFeed();
			hasInitialized = false;
			relayCounter += 1;
			connectionStatus = {};
			connectionTracker = new ConnectionTracker();
		}
	}

	$: subId &&
		relaySub(subId).subscribe((subRelays) => {
			console.log(subRelays, subId);
			handleSubRelays(subRelays);
		});

	let feedInitialized = false;

	onMount(() => {
		const timeout = setTimeout(() => {
			if (!feedInitialized && following.length === 0) {
				console.warn('Feed data not loaded');
				feedInitialized = true;
			}
		}, 2000);
		return () => clearTimeout(timeout);
	});

	// Build subscription requests based on current state
	function buildRequests(forPagination = false): RequestObject[] {
		if (!$key?.pub && following.length === 0) {
			return [];
		}

		const authors = following.length > 0 ? following : follows || [];
		if (authors.length === 0) {
			return [];
		}

		const baseRequest: RequestObject = {
			kinds: [1, 6],
			authors,
			limit: $limit,
			since: forPagination ? undefined : ago(31 * 24 * 60 * 60),
			until: forPagination ? until : undefined,
			noCache: !!relayCounter,
			tags: tags.length ? { '#t': tags } : undefined,
			relays: $key?.pub ? relays : ['wss://nostr.wine']
		};

		return [baseRequest];
	}

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		// Handle connection status (including EOSE detection via resolutionRate)
		const status = asConnectionStatus(message);
		if (status && connectionTracker) {
			const relayUrl = status.relayUrl()?.toString();
			if (relayUrl) {
				// Normalize URL to match normalizedRelays keys
				const normalizedUrl = normalizeURL(relayUrl);
				// Create new object for reactivity
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
				connectionTracker.handleMessage(message);
				// When >50% of relays have reached EOSE, mark loading as done
				if (connectionTracker.resolutionRate > 0.5) {
					loading = false;
					refreshing = false;
				}
			}
			return;
		}

		// Handle parsed events
		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent) return;
		const kind = parsedEvent.kind();
		// if (kind !== 1 && kind !== 6) return;

		// Filter: only show root posts or direct replies to root posts
		// Skip nested replies (replies to replies)
		if (kind === 1 || kind === 6) {
			const kind1 = asKind1(parsedEvent);
			if (kind1) {
				const reply = kind1.reply()?.id();
				const root = kind1.root()?.id();
				// If this is a reply, check if it's a direct reply to root
				if (reply && root) {
					// If reply ID != root ID, it's a reply to a reply (nested) - skip it
					if (reply.fnv1aHash() !== root.fnv1aHash()) {
						return;
					}
				}
			}
		}

		const eventId = parsedEvent.id()?.fnv1aHash();
		if (!eventId) return;

		// Check Set first (O(1)) for duplicate detection
		if (seenEventIds.has(eventId)) return;
		seenEventIds.add(eventId);

		const existingIndex = feedItems.findIndex((item) => item.id()?.fnv1aHash() === eventId);

		if (existingIndex === -1) {
			// Check if this is a "new" post (user is scrolled down)
			if (start > 0 && lastSeenTopItem && parsedEvent.createdAt() > feedItems[0]?.createdAt()) {
				newPostsCount++;
			}
			feedItems = [...feedItems, parsedEvent];
			// Sort by createdAt descending
			feedItems = feedItems.sort((a, b) => b.createdAt() - a.createdAt());
			// Update last seen top item if at top
			if (start === 0) {
				lastSeenTopItem = feedItems[0]?.createdAt();
				newPostsCount = 0;
			}
		}
	}

	// Reset feed state
	function resetFeed() {
		feedItems = [];
		seenEventIds.clear();
		until = undefined;
		hasMore = true;
		paginationCounter = 0;
		loading = false;
		newPostsCount = 0;
		itemsBeforePagination = 0;
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}
		unsubscribePagination?.();
		unsubscribePagination = undefined;
	}

	// Initialize or update subscription when dependencies change
	let unsubscribe: (() => void) | undefined;
	let unsubscribePagination: (() => void) | undefined;
	let hasInitialized = false;

	function initFeed() {
		if (!visible || !($key?.pub || following.length > 0)) return;
		if (hasInitialized) return;
		if (loading) return;

		feedInitialized = true;
		loading = true;

		const requests = buildRequests();
		if (requests.length > 0) {
			hasInitialized = true; // Only set after we actually create subscription
			unsubscribe?.();
			connectionTracker = new ConnectionTracker();
			unsubscribe = useSubscription(subId + relayCounter, requests, handleEvents, {
				bytesPerEvent: 10 * 1024
			});
			setSubRelays(subId + relayCounter, relays);
		} else {
			// Requests empty, reset loading so we can retry when deps change
			loading = false;
		}
	}

	$: if (visible && ($key?.pub || following.length > 0) && !hasInitialized) {
		initFeed();
	}

	// Reset hasInitialized when becoming invisible
	$: if (!visible) {
		hasInitialized = false;
		unsubscribe?.();
		unsubscribe = undefined;
		unsubscribePagination?.();
		unsubscribePagination = undefined;
	}

	// Handle pull-to-refresh
	function handleRefresh() {
		refreshing = true;
		// Reset initialization to allow re-subscription
		hasInitialized = false;
		resetFeed();
		// Force noCache by incrementing relayCounter
		relayCounter++;
		initFeed();
	}

	// Handle near-bottom pagination with quantile-based window calculation
	function handleNearBottom(event: { distance: number }) {
		if (loading || !hasMore || feedItems.length < $limit) return;

		loading = true;
		itemsBeforePagination = feedItems.length;
		paginationCounter++;

		// Quantile-based pagination: use the createdAt of the last item as until
		const lastItem = feedItems[feedItems.length - 1];
		if (lastItem) {
			until = lastItem.createdAt() - 1;
		}

		const requests = buildRequests(true);
		if (requests.length > 0) {
			// Clean up previous pagination subscription if any
			unsubscribePagination?.();
			const pageSubId = subId + '_page_' + paginationCounter + '_' + until;
			unsubscribePagination = useSubscription(pageSubId, requests, handleEvents, {
				bytesPerEvent: 10 * 1024
			});
			// Fallback: clear loading after timeout if EOSE isn't received
			paginationTimeout = setTimeout(() => {
				loading = false;
			}, 10000);
		} else {
			loading = false;
			hasMore = false;
		}
	}

	// Track when pagination completes and check if new items were added
	$: if (!loading && itemsBeforePagination > 0) {
		const newItemsAdded = feedItems.length - itemsBeforePagination;
		if (newItemsAdded === 0) {
			hasMore = false;
		}
		itemsBeforePagination = 0;
		// Clear the timeout if it hasn't fired yet
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}
		// Clean up pagination subscription after a delay to allow late events
		setTimeout(() => {
			unsubscribePagination?.();
			unsubscribePagination = undefined;
		}, 5000);
	}

	// Merge pending new items when user clicks the new posts indicator
	function mergePendingItems() {
		newPostsCount = 0;
		lastSeenTopItem = feedItems[0]?.id()?.fnv1aHash();
	}
</script>

<Pager rootPath="/explore">
	<Feed
		items={feedItems}
		{loading}
		pullToRefresh
		onRefresh={handleRefresh}
		onNearBottom={handleNearBottom}
		bind:start
		bind:end
	>
		<svelte:fragment slot="sticky-header">
			<div class="backdrop-blur-sm bg-base-300 bg-opacity-80 md:border-b border-base-200 pt-safe">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<div class="flex gap-1 items-center w-1/3">
						{#each $followPacks as pack}
							{@const kind39039 = asNip51(pack)}
							<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
								<img
									src={proxyAvatarUrl(kind39039?.image()?.toString() || '') || '/followlist.png'}
									class="w-8 h-8 border rounded-full"
									alt={kind39039?.title()?.toString() || 'Follow pack'}
									title={kind39039?.title()?.toString() || 'Follow pack'}
								/>
							</div>
						{:else}
							<div
								class="cursor-pointer"
								on:click|stopPropagation={() => go('followlists')}
								title="Follow lists"
							>
								<div class="w-8 h-8 border rounded-full flex items-center justify-center">
									<Icon icon="mdi:infinity" class="text-2xl" />
								</div>
							</div>
						{/each}
					</div>
					<div
						class="text-primary cursor-pointer flex-grow text-center"
						on:click={mergePendingItems}
					>
						{#if newPostsCount > 0}
							{newPostsCount} new posts
						{/if}
					</div>
					<div class="flex gap-2 items-center w-1/3 justify-end">
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<span class="cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
							<Icon icon="mdi:bell-outline" class="text-2xl mr-2" />
						</span>
						<a class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={proxyAvatarUrl(asKind0($kind0)?.picture()?.toString() || '') ||
									'/miss-profile.png'}
								class="w-8 h-8 border rounded-full"
								alt="Profile"
							/>
						</a>
					</div>
				</div>
			</div>
		</svelte:fragment>
		<svelte.fragment slot="sticky-footer">
			<div class="md:pb-4 pb-safe md:px-6 px-2">
				<div
					on:click|stopPropagation={(_) => go('post')}
					class="px-4 py-2 rounded-full backdrop-blur-2xl border border-accent"
				>
					What's up?
				</div>
			</div>
		</svelte.fragment>
		<svelte.fragment slot="header">
			<div
				class="w-feed relative pt-safe bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg pb-1 px-1 shadow-widget-down"
			>
				<div class="lg:m-auto flex justify-between items-center h-16">
					<div class="flex gap-1 items-center">
						{#each $followPacks as pack}
							{@const kind39039 = asNip51(pack)}
							<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
								<img
									src={proxyAvatarUrl(kind39039?.image()?.toString() || '') || '/followlist.png'}
									class="w-8 h-8 border rounded-full"
									alt={kind39039?.title()?.toString() || 'Follow pack'}
								/>
							</div>
						{:else}
							<div
								class="cursor-pointer"
								on:click|stopPropagation={() => go('followlists')}
								title="Follow lists"
							>
								<div class="w-8 h-8 border rounded-full flex items-center justify-center">
									<Icon icon="mdi:infinity" class="text-2xl" />
								</div>
							</div>
						{/each}
					</div>
					<div class="flex gap-2 items-center">
						<!-- Desktop refresh button (mobile has pull-to-refresh) -->
						<span
							class="hidden md:block cursor-pointer"
							on:click|stopPropagation={handleRefresh}
							title="Refresh feed"
						>
							<Icon icon="mdi:refresh" class="text-2xl mr-2" />
						</span>
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<Notifications />
						<div class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={proxyAvatarUrl(asKind0($kind0)?.picture()?.toString() || '') ||
									'/miss-profile.png'}
								class="w-8 h-8 border rounded-full"
								alt="Profile"
							/>
						</div>
					</div>
				</div>
				<RelaysList {subId} relays={normalizedRelays} {connectionStatus} />
			</div>
			{#if tags.length}
				<div class="bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg pb-1 px-1 mt-1">
					<div class="flex gap-1 items-center">
						{#each tags as tag}
							<span
								class=" px-2 py-1 bg-base-200 rounded-full relative overflow-hidden text-primary"
							>
								#{tag}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</svelte.fragment>
	</Feed>
</Pager>
