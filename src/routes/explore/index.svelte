<script lang="ts">
	import {
		CounterPipeConfigT,
		PipeConfig,
		PipeT,
		type ConnectionStatus,
		type Kind3Parsed,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind1,
		asKind3,
		asKind6,
		asKind20,
		asParsedEvent,
		asCountResponse,
		ConnectionTracker,
		fbArray
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { isEqual, uniq } from 'lodash';

	import { normalizeURL } from 'nostr-tools/utils';
	import KindSwitcher from 'src/components/KindSwitcher.svelte';
	import EventCard, { type CalendarEventCard } from 'src/components/EventCard.svelte';
	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { key } from 'src/controller';
	import {
		exploreAudienceMode,
		feedKinds,
		ALL_FEED_KINDS,
		type FeedKind
	} from 'src/controller/feed';
	import {
		defaultPipeline,
		kind3,
		kind3Ready,
		relayDirectoryUrls,
		readRelays
	} from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import { relaySub, setSubRelays } from 'src/controller/relay';
	import { CALENDAR_EVENT_KINDS, RSVP_KIND, parseCalendarEvent } from 'src/lib/calendarEvent';
	import { ago } from 'src/lib/period';
	import Feed from 'src/routes/explore/feed.svelte';
	import { go } from 'src/routes/modals/modal';
	import { onDestroy } from 'svelte';
	import Notifications from './notifications.svelte';
	import Avatar from './avatar.svelte';

	export let visible = true;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};
	let connectionTracker = new ConnectionTracker();

	// Feed items managed by parent
	let feedItems: ParsedEvent[] = [];
	let loading = false;
	let refreshing = false;

	// Track seen event IDs to prevent duplicates
	let seenEventIds = new Set<string>();

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

	// Track current feed kinds for subscription
	$: feedKindsValue = $feedKinds;
	$: effectiveKinds = feedKindsValue.length > 0 ? feedKindsValue : (ALL_FEED_KINDS as FeedKind[]);
	let tags: string[] = [];
	let kind3Resolved = false;

	kind3Ready.promise.then(() => {
		kind3Resolved = true;
	});

	$: follows = $kind3
		? fbArray(asKind3($kind3) as Kind3Parsed, 'contacts')
				.map((c) => c.pubkey()!)
				.filter((p): p is string => typeof p === 'string')
		: [];

	$: following = uniq(follows);
	$: useContactsFeed = $exploreAudienceMode === 'contacts';
	$: activeAudienceLabel = useContactsFeed ? 'Contacts' : 'All';
	$: followingKey = hashString(following.join(','));

	$: subId =
		'feed' +
		$exploreAudienceMode +
		(kind3Resolved ? 'kind3-ready' : 'kind3-pending') +
		followingKey +
		tags.join(',') +
		$feedKinds.join(',');

	function hashString(value: string): string {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) | 0;
		}
		return Math.abs(hash).toString(36);
	}

	let lastSubId: string | undefined;
	let hadFeedRequest = false;

	let relayOverride: string[] | undefined = undefined;
	$: accountRelays = $relayDirectoryUrls.length ? $relayDirectoryUrls : $readRelays;
	$: relays = relayOverride ?? accountRelays;

	// Filter out undefined values from relays
	$: normalizedRelays = (relays.filter((r) => typeof r === 'string') as string[]).map(normalizeURL);

	let relayCounter = 0;

	function handleSubRelays(subRelays: string[] | undefined) {
		if (subRelays && !isEqual(relays, subRelays)) {
			relayOverride = subRelays;
			resetFeed();
			lastSubId = undefined;
			hadFeedRequest = false;
			relayCounter += 1;
			connectionStatus = {};
			connectionTracker = new ConnectionTracker();
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
	$: feedRelays = $key?.pub && normalizedRelays.length ? normalizedRelays : DEFAULT_FEED_RELAYS;
	$: feedRelayKey = feedRelays.join('|');
	let lastConnectionRelayKey = '';
	$: if (feedRelayKey !== lastConnectionRelayKey) {
		lastConnectionRelayKey = feedRelayKey;
		connectionStatus = {};
		connectionTracker = new ConnectionTracker();
	}

	let eventSub: (() => void) | undefined;
	let rsvpSubs: (() => void)[] = [];
	let lastEventRelayKey = '';
	let lastRsvpKey = '';
	let upcomingEvents: CalendarEventCard[] = [];
	let rsvpCountsByAddress: Record<string, number> = {};
	$: eventAddressKey = upcomingEvents.map((event) => event.address).join('|');

	function subscribeExploreEvents() {
		if (!visible || !feedRelays.length || feedRelayKey === lastEventRelayKey) return;

		eventSub?.();
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		rsvpSubs = [];
		upcomingEvents = [];
		rsvpCountsByAddress = {};
		lastRsvpKey = '';
		lastEventRelayKey = feedRelayKey;

		const events = new Map<string, CalendarEventCard>();
		const eventSubId = `explore_events_${hashString(feedRelayKey)}`;
		setSubRelays(eventSubId, feedRelays);
		eventSub = useSubscription(
			eventSubId,
			[
				{
					kinds: CALENDAR_EVENT_KINDS,
					limit: 20,
					noCache: true,
					relays: feedRelays
				}
			],
			(message) => {
				const status = asConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl();
					if (relayUrl) {
						connectionStatus = { ...connectionStatus, [normalizeURL(relayUrl)]: status };
					}
					return;
				}

				const parsed = asParsedEvent(message);
				if (!parsed) return;
				const event = parseCalendarEvent(parsed, feedRelays);
				if (!event) return;
				events.set(event.id, event);
				upcomingEvents = Array.from(events.values()).sort(
					(left, right) => left.start - right.start
				);
			},
			{ bytesPerEvent: 8 * 1024, closeOnEose: true }
		);
	}

	function subscribeExploreRsvps() {
		if (!visible || !feedRelays.length || !eventAddressKey || eventAddressKey === lastRsvpKey)
			return;

		lastRsvpKey = eventAddressKey;
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		rsvpSubs = upcomingEvents.map((event) => {
			const rsvpSubId = `explore_rsvps_${hashString(feedRelayKey)}_${hashString(event.address)}`;
			setSubRelays(rsvpSubId, feedRelays);

			return useSubscription(
				rsvpSubId,
				[
					{
						kinds: [RSVP_KIND],
						noCache: true,
						relays: feedRelays,
						tags: { '#a': [event.address] }
					}
				],
				(message) => {
					const status = asConnectionStatus(message);
					if (status) {
						const relayUrl = status.relayUrl();
						if (relayUrl) {
							connectionStatus = { ...connectionStatus, [normalizeURL(relayUrl)]: status };
						}
						return;
					}

					const count = asCountResponse(message);
					if (!count || count.kind() !== RSVP_KIND) return;

					rsvpCountsByAddress = {
						...rsvpCountsByAddress,
						[event.address]: count.count()
					};
				},
				{
					bytesPerEvent: 256,
					closeOnEose: true,
					pipeline: [
						new PipeT(
							PipeConfig.CounterPipeConfig,
							new CounterPipeConfigT([RSVP_KIND], $key?.pub || '')
						)
					]
				}
			);
		});
	}

	// Build subscription requests based on current state
	function buildRequests(forPagination = false): RequestObject[] {
		// Determine which kinds to request
		// If feedKinds is empty, request all supported kinds
		const kindsToRequest = $feedKinds.length > 0 ? $feedKinds : (ALL_FEED_KINDS as FeedKind[]);

		const authors =
			useContactsFeed && kind3Resolved && following.length > 0 ? following : undefined;

		const baseRequest: RequestObject = {
			kinds: kindsToRequest,
			...(authors?.length ? { authors } : {}),
			limit: $limit,
			since: forPagination ? undefined : ago(31 * 24 * 60 * 60),
			until: forPagination ? until : undefined,
			noCache: true,
			tags: tags.length ? { '#t': tags } : undefined,
			relays: feedRelays
		};

		return [baseRequest];
	}

	// Check if kind should be included based on feedKinds filter
	function shouldIncludeKind(kind: number): boolean {
		// If no kinds are selected, include all
		if ($feedKinds.length === 0) return true;
		// Otherwise, only include selected kinds
		return $feedKinds.includes(kind as FeedKind);
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

		// Filter by kind based on feedKinds selection
		if (!shouldIncludeKind(kind)) return;

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
				if (!kind6?.repostedEvent()) return;
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
	let rootSubId: string | undefined = undefined;
	let initTimeout: ReturnType<typeof setTimeout> | undefined;

	$: relayKey = feedRelays
		.map((r) => r.replace(/[^a-zA-Z0-9]/g, ''))
		.join('')
		.slice(0, 20);
	$: feedRequest = (() => {
		const requests = buildRequests();
		if (!visible || requests.length === 0) return null;

		return {
			subId: `${subId}_${relayKey}_${relayCounter}`,
			requests
		};
	})();

	$: if (!feedRequest) {
		hadFeedRequest = false;
		loading = false;
	}

	$: if (feedRequest && feedRequest.subId !== lastSubId) {
		if (!hadFeedRequest) {
			lastSubId = undefined;
			hadFeedRequest = true;
		}

		unsubscribe?.();
		unsubscribe = undefined;
		rootSubId = feedRequest.subId;
		lastSubId = feedRequest.subId;
		connectionTracker = new ConnectionTracker();
		loading = feedItems.length === 0;
		unsubscribe = useSubscription(feedRequest.subId, feedRequest.requests, handleEvents, {
			bytesPerEvent: 10 * 1024,
			pipeline: $defaultPipeline.for(feedRequest.subId)
		});
		setSubRelays(feedRequest.subId, feedRelays);

		if (initTimeout) clearTimeout(initTimeout);
		initTimeout = setTimeout(() => {
			loading = false;
		}, 1500);
	}

	$: if (visible && feedRelays.length && feedRelayKey !== lastEventRelayKey) {
		subscribeExploreEvents();
	}

	$: if (visible && feedRelays.length && eventAddressKey && eventAddressKey !== lastRsvpKey) {
		subscribeExploreRsvps();
	}

	// Stop active subscriptions when becoming invisible
	$: if (!visible) {
		unsubscribe?.();
		unsubscribe = undefined;
		unsubscribePagination?.();
		unsubscribePagination = undefined;
		eventSub?.();
		eventSub = undefined;
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		rsvpSubs = [];
		lastSubId = undefined;
		lastEventRelayKey = '';
		lastRsvpKey = '';
		hadFeedRequest = false;
	}

	// Cleanup on component destroy
	onDestroy(() => {
		relaySubUnsubscribe?.();
		unsubscribe?.();
		unsubscribePagination?.();
		eventSub?.();
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		if (paginationTimeout) clearTimeout(paginationTimeout);
		if (paginationCheckTimeout) clearTimeout(paginationCheckTimeout);
		if (refreshTimeout) clearTimeout(refreshTimeout);
		if (initTimeout) clearTimeout(initTimeout);
	});

	// Handle pull-to-refresh - keep existing feed items, just show loader and fetch new
	function handleRefresh() {
		if (refreshing) return;
		refreshing = true;
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
		lastSeenTopItem = feedItems[0]?.createdAt();
	}

	function toggleAudienceMode() {
		$exploreAudienceMode = useContactsFeed ? 'all' : 'contacts';
		resetFeed();
		lastSubId = undefined;
		hadFeedRequest = false;
		connectionStatus = {};
		connectionTracker = new ConnectionTracker();
	}

	function selectExploreKindTab(event: CustomEvent<{ kinds: FeedKind[] }>) {
		$feedKinds = event.detail.kinds;
		resetFeed();
		connectionStatus = {};
		connectionTracker = new ConnectionTracker();
		lastSubId = undefined;
		hadFeedRequest = false;
		relayCounter++;
	}

	function audienceButtonClass() {
		return 'flex items-center gap-1 text-2xl font-semibold tracking-tight transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md active:translate-y-px';
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
			<div class="relative bg-base-300 bg-opacity-80 md:border-b border-base-200 pt-safe">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<div class="flex gap-1 items-center min-w-0 flex-1">
						<button
							type="button"
							class={audienceButtonClass()}
							on:click|stopPropagation={toggleAudienceMode}
							title="Toggle Explore feed audience"
						>
							{activeAudienceLabel}
							<Icon icon="mdi:chevron-down" class="text-2xl" />
						</button>
					</div>

					<div class="flex gap-2 items-center w-1/3 justify-end">
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<span class="cursor-pointer" on:click|stopPropagation={() => go('notifications')}>
							<Icon icon="mdi:bell-outline" class="text-2xl mr-2" />
						</span>
						<a class="cursor-pointer" on:click|stopPropagation={() => go('profile')}>
							<Avatar pubkey={$key?.pub || ''} size="md" customClass="border rounded-full" />
						</a>
					</div>
				</div>
				<div
					class="absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 cursor-pointer rounded-full bg-info px-4 py-1.5 text-sm font-medium text-info-content shadow-lg backdrop-blur-sm transition-all duration-300 ease-out {newPostsCount >
					0
						? 'translate-y-0 opacity-100'
						: '-translate-y-2 opacity-0 pointer-events-none'}"
					on:click={mergePendingItems}
				>
					{newPostsCount} new posts
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
				class="w-feed relative pt-safe rounded-lg border border-base-200/70 bg-base-300/85 px-3 pb-3 shadow-widget-down backdrop-blur-gpu md:px-4"
			>
				<div class="lg:m-auto flex justify-between items-center h-16">
					<div class="flex min-w-0 items-center">
						<button
							type="button"
							class={audienceButtonClass()}
							on:click|stopPropagation={toggleAudienceMode}
							title="Toggle Explore feed audience"
						>
							{activeAudienceLabel}
							<Icon icon="mdi:chevron-down" class="text-2xl" />
						</button>
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
							<Avatar pubkey={$key?.pub || ''} size="md" customClass="border rounded-full" />
						</div>
					</div>
				</div>
				<div class="min-h-10">
					<RelaysList class="!justify-start" {subId} relays={feedRelays} {connectionStatus} />
				</div>
				{#if upcomingEvents.length}
					<div class="mt-3 border-t border-base-200/70 pt-3">
						<div class="mb-3 flex items-center justify-between">
							<h2 class="text-base font-bold">Upcoming events</h2>
						</div>
						<div class="flex items-start gap-3 overflow-x-auto pb-1 scrollbar-hide">
							{#each upcomingEvents.slice(0, 3) as event (event.id)}
								<EventCard
									{event}
									{feedRelays}
									rsvpCount={rsvpCountsByAddress[event.address] || 0}
								/>
							{/each}
						</div>
					</div>
				{/if}
				<div class="mt-2 hidden border-t border-base-200/70 pt-2 md:block">
					<KindSwitcher
						selectedKinds={$feedKinds}
						ariaLabel="Explore content filters"
						on:select={selectExploreKindTab}
					/>
				</div>
			</div>
			{#if tags.length}
				<div class="bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-lg pb-1 px-1 mt-1">
					<div class="flex gap-1 items-center">
						{#each tags as tag (tag)}
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
