<script lang="ts">
	import {
		type ConnectionStatus,
		type Kind3Parsed,
		type ListParsed,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind0,
		asKind1,
		asKind3,
		asKind6,
		asKind20,
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
	import { defaultPipeline, kind0, kind3, readRelays } from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import { relaySub, setSubRelays } from 'src/controller/relay';
	import { ago } from 'src/lib/period';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import Feed from 'src/routes/explore/feed.svelte';
	import { go } from 'src/routes/modals/modal';
	import { onDestroy } from 'svelte';
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
	let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
	let prevPaginationSubId: string | undefined = undefined;

	// When root sub changes, set it as the pagination parent for first page
	$: if (rootSubId) {
		prevPaginationSubId = rootSubId;
	}

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
				.map((c) => c.pubkey()!)
				.filter((p): p is string => typeof p === 'string')
		: [];

	$: following = uniq(
		[
			...$followPacks.flatMap((pack) => fbArray(asNip51(pack) as ListParsed, 'people') || []),
			...(($followPacks.some((fp) => asNip51(fp)?.title() == 'followlist') && follows) || [])
		].filter((p): p is string => typeof p === 'string')
	);

	$: subId = $followPacks.reduce((acc, cur) => acc + cur.id(), 'feed') + tags.join(',');

	// Track last subId to detect followlist changes and reset feed
	let lastSubId: string | undefined;
	$: if (subId !== lastSubId) {
		const prevSubId = lastSubId;
		lastSubId = subId;
		// Followlist changed, reset feed to trigger new subscription
		// Also reset when transitioning from initial load (prevSubId was undefined) to populated state
		if (hasInitialized || (prevSubId === undefined && $followPacks.length > 1)) {
			resetFeed();
			seenEventIds.clear();
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
			// Don't reset if we're in the middle of initial setup (isInitializing is true)
			// or if the feed hasn't been initialized yet
			if (!isInitializing && hasInitialized) {
				resetFeed();
				hasInitialized = false;
				relayCounter += 1;
				connectionStatus = {};
				connectionTracker = new ConnectionTracker();
			}
		}
	}

	// Track current subId for cleanup
	let currentRelaySubId: string | undefined = undefined;
	let relaySubUnsubscribe: (() => void) | undefined;

	$: if (subId && subId !== currentRelaySubId) {
		// Clean up previous subscription before creating new one
		relaySubUnsubscribe?.();
		currentRelaySubId = subId;
		relaySubUnsubscribe = relaySub(subId).subscribe((subRelays) => {
			handleSubRelays(subRelays);
		});
	}

	// Default relay for anonymous users
	const DEFAULT_FEED_RELAYS = ['wss://nostr.wine'];

	// Track what type of feed we should be showing
	// Use global feed only if no followlist is selected (works for both logged in and anonymous users)
	$: useGlobalFeed = following.length === 0;

	// Build subscription requests based on current state
	function buildRequests(forPagination = false): RequestObject[] {
		if (useGlobalFeed) {
			return [
				{
					kinds: [1, 6, 20],
					// kinds: [30023],
					limit: $limit,
					since: forPagination ? undefined : ago(31 * 24 * 60 * 60),
					until: forPagination ? until : undefined,
					noCache: !!relayCounter,
					tags: tags.length ? { '#t': tags } : undefined,
					relays: DEFAULT_FEED_RELAYS
				}
			];
		}

		// User has followlist selected - use personalized feed
		const authors = following;

		// Use user's relays if logged in, otherwise use default relays
		const feedRelays = $key?.pub ? relays : DEFAULT_FEED_RELAYS;

		const baseRequest: RequestObject = {
			kinds: [1, 6, 20],
			// kinds: [30023],
			authors,
			limit: $limit,
			since: forPagination ? undefined : ago(31 * 24 * 60 * 60),
			until: forPagination ? until : undefined,
			noCache: !!relayCounter,
			tags: tags.length ? { '#t': tags } : undefined,
			relays: feedRelays
		};

		return [baseRequest];
	}

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		// Handle connection status (including EOSE detection via resolutionRate)
		const status = asConnectionStatus(message);
		if (status && connectionTracker) {
			const relayUrl = status.relayUrl();
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
					if (refreshTimeout) {
						clearTimeout(refreshTimeout);
						refreshTimeout = undefined;
					}
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
				// CASE 1: Has reply but no root = reply to something (could be nested)
				// Filter it out since we can't verify it's a direct reply to root
				if (reply && !root) {
					return;
				}

				// CASE 2: Has both reply and root
				if (reply && root) {
					// If reply ID != root ID, it's a reply to a reply (nested) - skip it
					if (reply !== root) {
						return;
					}
				}
				// CASE 3: No reply tag = root post (allow it)
			}

			if (kind == 6) {
				const kind6 = asKind6(parsedEvent);
				if (!kind6.repostedEvent()) return;
			}
		} else if (kind === 20) {
			// kind20 is always a root post (image posts), always allow them
			// But skip if images have no dimensions declared (prevents scroll jumps)
			const kind20 = asKind20(parsedEvent);
			if (kind20) {
				const images = fbArray(kind20, 'images');
				// If any image has no dim, skip this note
				if (images.some((img) => !img.dim())) {
					return;
				}
			}
		} else {
			// Skip other kinds
			return;
		}

		const eventId = parsedEvent.id();
		if (!eventId) return;

		// Check Set first (O(1)) for duplicate detection
		if (seenEventIds.has(eventId)) return;
		seenEventIds.add(eventId);

		const existingIndex = feedItems.findIndex((item) => item.id() === eventId);

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
		refreshing = false;
		newPostsCount = 0;
		itemsBeforePagination = 0;
		rootSubId = undefined;
		prevPaginationSubId = undefined;
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}
		if (paginationCheckTimeout) {
			clearTimeout(paginationCheckTimeout);
			paginationCheckTimeout = undefined;
		}
		if (refreshTimeout) {
			clearTimeout(refreshTimeout);
			refreshTimeout = undefined;
		}
		if (initTimeout) {
			clearTimeout(initTimeout);
			initTimeout = undefined;
		}
		unsubscribePagination?.();
		unsubscribePagination = undefined;
	}

	// Initialize or update subscription when dependencies change
	let unsubscribe: (() => void) | undefined;
	let unsubscribePagination: (() => void) | undefined;
	let hasInitialized = false;
	let rootSubId: string | undefined = undefined;
	let initTimeout: ReturnType<typeof setTimeout> | undefined;

	// Track if we're currently initializing to prevent reactive loops
	let isInitializing = false;

	function initFeed() {
		if (!visible) return;
		if (hasInitialized) return;
		if (loading) return;
		if (isInitializing) return; // Prevent re-entry during initialization

		loading = true;
		isInitializing = true;

		const requests = buildRequests();
		if (requests.length > 0) {
			unsubscribe?.();
			connectionTracker = new ConnectionTracker();
			rootSubId = subId + relayCounter;
			unsubscribe = useSubscription(rootSubId, requests, handleEvents, {
				bytesPerEvent: 10 * 1024,
				pipeline: $defaultPipeline.for(rootSubId)
			});
			// Use default relays for anonymous users, otherwise use user's relays
			setSubRelays(rootSubId, $key?.pub ? relays : DEFAULT_FEED_RELAYS);
			// Mark as initialized AFTER setting up subscription and relays
			// This prevents handleSubRelays from resetting during initial setup
			hasInitialized = true;
			isInitializing = false;
			// Safety timeout: clear loading after 15s even if EOSE never arrives
			if (initTimeout) clearTimeout(initTimeout);
			initTimeout = setTimeout(() => {
				if (loading) {
					loading = false;
					// If no items loaded, allow retry by resetting hasInitialized
					if (feedItems.length === 0) {
						hasInitialized = false;
					}
				}
			}, 1500);
		} else {
			// Requests empty, reset loading so we can retry when deps change
			loading = false;
			isInitializing = false;
		}
	}

	// Track previous feed type to detect switches
	let wasGlobalFeed: boolean | undefined = undefined;
	let isSwitchingFeedType = false;
	$: {
		// Guard: prevent re-entry during feed type switch (infinite loop protection)
		if (isSwitchingFeedType) {
		} else if (wasGlobalFeed !== undefined && hasInitialized && wasGlobalFeed !== useGlobalFeed) {
			// Switching feed type - reinitialize and clear feed
			// Set lock FIRST before any reactive state changes
			isSwitchingFeedType = true;
			// Update wasGlobalFeed to match useGlobalFeed so condition becomes false
			wasGlobalFeed = useGlobalFeed;
			// Now perform the state changes that might trigger other reactions
			hasInitialized = false;
			resetFeed();
			seenEventIds.clear();
			relayCounter++;
			// Release lock after a tick to allow reactive updates to settle
			setTimeout(() => {
				isSwitchingFeedType = false;
			}, 0);
		} else {
			wasGlobalFeed = useGlobalFeed;
		}
	}

	$: if (visible && !hasInitialized) {
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

	// Cleanup on component destroy
	onDestroy(() => {
		relaySubUnsubscribe?.();
		unsubscribe?.();
		unsubscribePagination?.();
		if (paginationTimeout) clearTimeout(paginationTimeout);
		if (paginationCheckTimeout) clearTimeout(paginationCheckTimeout);
		if (refreshTimeout) clearTimeout(refreshTimeout);
		if (initTimeout) clearTimeout(initTimeout);
	});

	// Handle pull-to-refresh - keep existing feed items, just show loader and fetch new
	function handleRefresh() {
		if (refreshing) return;
		refreshing = true;
		// Reset initialization to allow re-subscription
		hasInitialized = false;
		// Reset connection tracker for fresh EOSE detection
		connectionTracker = new ConnectionTracker();
		// Don't clear feedItems or seenEventIds - keep existing content visible
		// Reset until to fetch latest posts
		until = undefined;
		// Force noCache by incrementing relayCounter
		relayCounter++;
		// Clear any existing refresh timeout
		if (refreshTimeout) {
			clearTimeout(refreshTimeout);
		}
		// Fallback: clear refreshing after timeout if EOSE isn't received
		refreshTimeout = setTimeout(() => {
			refreshing = false;
			loading = false;
			refreshTimeout = undefined;
		}, 10000);
		// initFeed will set loading = true
		initFeed();
	}

	// Handle near-bottom pagination with quantile-based window calculation
	function handleNearBottom(event: { distance: number }) {
		// Only require at least 1 item to use as cursor, not full $limit
		if (loading || !hasMore || feedItems.length === 0) return;

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
				bytesPerEvent: 10 * 1024,
				pipeline: $defaultPipeline.for(pageSubId),
				pagination: prevPaginationSubId
			});
			// Track this subId for next pagination
			prevPaginationSubId = pageSubId;
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
	let paginationCheckTimeout: ReturnType<typeof setTimeout> | undefined;
	$: if (!loading && itemsBeforePagination > 0) {
		const itemsAtCheck = itemsBeforePagination;

		// Clear the EOSE timeout if it hasn't fired yet
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}

		// Delay the check to allow late events to arrive via subscription
		paginationCheckTimeout = setTimeout(() => {
			const newItemsAdded = feedItems.length - itemsAtCheck;
			if (newItemsAdded === 0) {
				hasMore = false;
			}
			itemsBeforePagination = 0;
			// Clean up pagination subscription after a delay to allow late events
			setTimeout(() => {
				unsubscribePagination?.();
				unsubscribePagination = undefined;
			}, 5000);
		}, 500); // Wait 500ms for late events to arrive
	}

	// Merge pending new items when user clicks the new posts indicator
	function mergePendingItems() {
		newPostsCount = 0;
		lastSeenTopItem = feedItems[0]?.id();
	}
</script>

<Pager rootPath="/explore">
	<Feed
		items={feedItems}
		loading={loading || refreshing}
		pullToRefresh
		onRefresh={handleRefresh}
		onNearBottom={handleNearBottom}
		bind:start
		bind:end
	>
		<svelte:fragment slot="sticky-header">
			<div class="bg-base-300 bg-opacity-80 md:border-b border-base-200 pt-safe">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<div class="flex gap-1 items-center w-1/3">
						{#if following.length > 0}
							{#each $followPacks as pack}
								{@const kind39039 = asNip51(pack)}
								<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
									<img
										src={proxyAvatarUrl(kind39039?.image() || '') || '/followlist.png'}
										class="w-8 h-8 border rounded-full"
										alt={kind39039?.title() || 'Follow pack'}
										title={kind39039?.title() || 'Follow pack'}
									/>
								</div>
							{/each}
						{:else}
							<!-- Global feed (no followlist) - show infinity icon -->
							<div
								class="cursor-pointer"
								on:click|stopPropagation={() => go('followlists')}
								title="Global feed - select a followlist for personalized feed"
							>
								<div class="w-8 h-8 border rounded-full flex items-center justify-center">
									<Icon icon="mdi:infinity" class="text-2xl" />
								</div>
							</div>
						{/if}
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
								src={proxyAvatarUrl(asKind0($kind0)?.picture() || '') || '/miss-profile.png'}
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
					class="px-4 py-2 rounded-full border border-accent backdrop-blur-md"
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
						{#if following.length > 0}
							{#each $followPacks as pack}
								{@const kind39039 = asNip51(pack)}
								<div class="cursor-pointer" on:click|stopPropagation={() => go('followlists')}>
									<img
										src={proxyAvatarUrl(kind39039?.image() || '') || '/followlist.png'}
										class="w-8 h-8 border rounded-full"
										alt={kind39039?.title() || 'Follow pack'}
									/>
								</div>
							{/each}
						{:else}
							<!-- Global feed (no followlist) - show infinity icon -->
							<div
								class="cursor-pointer"
								on:click|stopPropagation={() => go('followlists')}
								title="Global feed - select a followlist for personalized feed"
							>
								<div class="w-8 h-8 border rounded-full flex items-center justify-center">
									<Icon icon="mdi:infinity" class="text-2xl" />
								</div>
							</div>
						{/if}
					</div>
					<div class="flex gap-2 items-center">
						<!-- Desktop refresh button (mobile has pull-to-refresh) -->
						<span
							class="hidden md:block cursor-pointer"
							on:click|stopPropagation={handleRefresh}
							title="Refresh feed"
						>
							<Icon
								icon="mdi:refresh"
								class="text-2xl mr-2 {refreshing ? 'animate-spin' : ''}"
								style="transform-origin: center;"
							/>
						</span>
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<Notifications />
						<div class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<img
								src={proxyAvatarUrl(asKind0($kind0)?.picture() || '') || '/miss-profile.png'}
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
