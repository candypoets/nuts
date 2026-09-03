<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import {
		CounterPipeConfigT,
		MessageType,
		MuteFilterPipeConfigT,
		PipeConfig,
		PipeT,
		SaveToDbPipeConfigT,
		SerializeEventsPipeConfigT,
		type ConnectionStatus,
		type Kind3Parsed,
		type NostrEvent as RawNostrEvent,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage,
		getManager
	} from '@candypoets/nipworker';
	import {
		createPaginatedSubscription,
		type PaginatedSubscription,
		useSubscription
	} from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind1,
		asKind3,
		asKind20,
		asNostrEvent,
		asParsedEvent,
		asCountResponse,
		fbArray
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { isEqual, uniq } from 'lodash';

	import { normalizeURL } from 'nostr-tools/utils';
	import KindSwitcher, { type KindSwitcherTab } from 'src/components/KindSwitcher.svelte';
	import EventCard, { type CalendarEventCard } from 'src/components/EventCard.svelte';
	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { key } from 'src/controller';
	import {
		exploreAudienceMode,
		exploreRelaySelections,
		feedKinds,
		ALL_EXPLORE_FEED_KINDS,
		type FeedKind
	} from 'src/controller/feed';
	import {
		defaultPipeline,
		kind3,
		kind3Ready,
		mutePipeConfig,
		relayDirectoryUrls,
		readRelays
	} from 'src/controller/nostr';
	import { FEED_PAGE_WINDOW_SECONDS, limit } from 'src/controller/pagination';
	import { relaySub, relaySubs, setSubRelays } from 'src/controller/relay';
	import { CALENDAR_EVENT_KINDS, RSVP_KIND, parseCalendarEvent } from 'src/lib/calendarEvent';
	import { HIGHLIGHT_KIND } from 'src/lib/highlights';
	import {
		exploreFeedHref,
		exploreFeedKinds,
		exploreFeedPath,
		exploreFeedTabFromPath,
		withExploreRelayParams
	} from 'src/lib/exploreFeedRoute';
	import { ago } from 'src/lib/period';
	import { resolve } from 'src/lib/paths';
	import { kind6RepostReference } from 'src/lib/repost';
	import Feed from 'src/routes/explore/feed.svelte';
	import { navigateStackPath, stackPath } from 'src/routes/modals/modal';
	import { onDestroy, onMount } from 'svelte';
	import Notifications from './notifications.svelte';
	import Avatar from './avatar.svelte';

	export let visible = true;
	type ExploreFeedItem = ParsedEvent | RawNostrEvent;

	function openRoot(eventPath: string) {
		const feedPath = exploreFeedPath(exploreFeedTabFromPath($stackPath));
		navigateStackPath(resolve(`${feedPath}/${eventPath}`));
	}

	function sameFeedKinds(left: FeedKind[], right: FeedKind[]) {
		return left.length === right.length && left.every((kind, index) => kind === right[index]);
	}

	function applyExploreFeedKinds(kinds: FeedKind[]) {
		if (sameFeedKinds($feedKinds, kinds)) return;
		$feedKinds = kinds;
		resetFeed();
		connectionStatus = {};
		hadFeedRequest = false;
	}

	function normalizeRelayParams(values: Array<string | null | undefined>): string[] {
		const normalized: string[] = [];
		for (const value of values) {
			if (!value) continue;
			try {
				const url = new URL(value);
				if (url.protocol !== 'wss:' && url.protocol !== 'ws:') continue;
				const relay = normalizeURL(value);
				if (typeof relay === 'string' && !normalized.includes(relay)) normalized.push(relay);
			} catch {
				// Ignore malformed relay parameters and fall back to the configured feed relays.
			}
		}
		return normalized;
	}

	function replaceExploreRelays(nextRelays: string[]) {
		if (!browser || !onExploreRoute) return;
		const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
		const next = withExploreRelayParams(current, nextRelays);
		if (next !== current) window.history.replaceState(window.history.state, '', next);
	}

	function syncExploreRelayUrl(
		pageHref: string,
		nextRelays: string[],
		isMounted: boolean,
		isExploreRoute: boolean
	) {
		// pageHref makes this rerun after SvelteKit navigation. The visible URL is
		// read from window because relay-selector updates intentionally avoid a
		// second navigation while the current feed stays mounted.
		if (!pageHref || !isMounted || !browser || !isExploreRoute || !nextRelays.length) return;
		replaceExploreRelays(nextRelays);
	}

	let mounted = false;
	onMount(() => {
		mounted = true;
	});

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	// Feed items managed by parent
	let feedItems: ParsedEvent[] = [];
	let highlightItems: RawNostrEvent[] = [];
	const highlightEvents = new Map<string, RawNostrEvent>();
	let loading = false;
	let refreshing = false;
	let highlightLoading = false;

	function itemCreatedAt(item: ExploreFeedItem): number {
		return item.createdAt?.() || 0;
	}

	$: displayItems = [...feedItems, ...highlightItems].sort(
		(left, right) => itemCreatedAt(right) - itemCreatedAt(left)
	);

	// Track seen event IDs to prevent duplicates
	let seenEventIds = new Set<string>();

	let refreshCounter = 0;
	let refreshTimeout: ReturnType<typeof setTimeout> | undefined;

	// Viewport state from Feed
	let start = 0;
	let end = 0;

	// New posts tracking for batchNewItems behavior
	let newPostsCount = 0;
	let lastSeenTopItem: number | undefined;

	// Track current feed kinds for subscription
	$: feedKindsValue = $feedKinds;
	$: effectiveKinds =
		feedKindsValue.length > 0 ? feedKindsValue : (ALL_EXPLORE_FEED_KINDS as FeedKind[]);
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
	$: contactListResolved = kind3Resolved || Boolean($kind3);
	$: contactCountLabel = contactListResolved
		? `${following.length} ${following.length === 1 ? 'contact' : 'contacts'}`
		: 'Loading contacts';
	$: if (!$key?.pub && $exploreAudienceMode !== 'all') {
		$exploreAudienceMode = 'all';
	}
	$: useContactsFeed = Boolean($key?.pub) && $exploreAudienceMode === 'contacts';
	$: activeAudienceLabel = useContactsFeed ? 'Contacts' : 'All';
	$: relaySelectionSubId = 'feed' + $exploreAudienceMode;
	$: followingKey = hashString(following.join(','));
	$: contactFeedKey = useContactsFeed
		? (contactListResolved ? 'kind3-ready' : 'kind3-pending') + followingKey
		: '';

	$: subId = 'feed' + $exploreAudienceMode + contactFeedKey + tags.join(',') + $feedKinds.join(',');

	function hashString(value: string): string {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) | 0;
		}
		return Math.abs(hash).toString(36);
	}

	let lastSubId: string | undefined;
	let hadFeedRequest = false;

	const exploreRootPath = resolve('/explore');
	let relayOverride: string[] | undefined = undefined;
	let relays: string[] = [];
	$: onExploreRoute =
		$stackPath === exploreRootPath || $stackPath.startsWith(`${exploreRootPath}/`);
	$: relayQueryValues = onExploreRoute ? $page.url.searchParams.getAll('relay') : [];
	$: urlRelays = normalizeRelayParams(relayQueryValues);
	$: accountRelays = normalizeRelayParams(
		$relayDirectoryUrls.length ? $relayDirectoryUrls : $readRelays
	);
	$: selectedSubRelays = $relaySubs.get(relaySelectionSubId);
	$: persistedRelays = $exploreRelaySelections[$exploreAudienceMode];
	$: relays =
		relayOverride ??
		(urlRelays.length ? urlRelays : undefined) ??
		selectedSubRelays ??
		(persistedRelays.length ? persistedRelays : accountRelays) ??
		[];

	// Filter out undefined values from relays
	$: normalizedRelays = normalizeRelayParams(relays);

	function handleSubRelays(subRelays: string[] | undefined) {
		const nextRelays = subRelays ? normalizeRelayParams(subRelays) : undefined;
		const currentRelays = normalizeRelayParams(relays ?? []);

		if (nextRelays && !isEqual(currentRelays, nextRelays)) {
			relayOverride = nextRelays;
			$exploreRelaySelections = {
				...$exploreRelaySelections,
				[$exploreAudienceMode]: nextRelays
			};
			replaceExploreRelays(nextRelays);
			resetFeed();
			hadFeedRequest = false;
			connectionStatus = {};
		}
	}

	// Track current subId for cleanup
	let currentRelaySourceKey: string | undefined = undefined;
	let relaySubUnsubscribe: (() => void) | undefined;

	$: relaySourceKey = `${relaySelectionSubId}:${urlRelays.join('|')}`;
	$: if (relaySelectionSubId && relaySourceKey !== currentRelaySourceKey) {
		// Clean up previous subscription before creating new one
		relaySubUnsubscribe?.();
		relayOverride = urlRelays.length ? urlRelays : undefined;
		if (urlRelays.length) setSubRelays(relaySelectionSubId, urlRelays);
		currentRelaySourceKey = relaySourceKey;
		relaySubUnsubscribe = relaySub(relaySelectionSubId).subscribe((subRelays) => {
			handleSubRelays(subRelays);
		});
	}

	// Default relay for anonymous users
	const DEFAULT_FEED_RELAYS = ['wss://nostr.wine'];
	$: hasSelectedRelays = Boolean(
		urlRelays.length || relayOverride?.length || selectedSubRelays?.length || persistedRelays.length
	);
	$: feedRelays = $key?.pub || hasSelectedRelays ? normalizedRelays : DEFAULT_FEED_RELAYS;
	$: feedRelayKey = feedRelays.join('|');
	$: exploreKindHrefs = {
		notes: exploreFeedHref('notes', feedRelays),
		media: exploreFeedHref('media', feedRelays),
		events: exploreFeedHref('events', feedRelays),
		highlights: exploreFeedHref('highlights', feedRelays),
		polls: exploreFeedHref('polls', feedRelays),
		articles: exploreFeedHref('articles', feedRelays)
	};
	$: currentExploreHref = `${$stackPath}${$page.url.search}${$page.url.hash}`;
	$: syncExploreRelayUrl(currentExploreHref, feedRelays, mounted, onExploreRoute);
	let lastConnectionRelayKey = '';
	$: if (feedRelayKey !== lastConnectionRelayKey) {
		lastConnectionRelayKey = feedRelayKey;
		connectionStatus = {};
	}

	let eventSub: (() => void) | undefined;
	let highlightSubscription: (() => void) | undefined;
	let lastHighlightSubId: string | undefined;
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
		const kindsToRequest = (
			$feedKinds.length > 0 ? $feedKinds : (ALL_EXPLORE_FEED_KINDS as FeedKind[])
		).filter((kind) => kind !== HIGHLIGHT_KIND);

		// Highlights use a raw-event pipeline below because the current parsed
		// worker view intentionally does not carry generic event content.
		if (kindsToRequest.length === 0) return [];

		if (useContactsFeed && (!contactListResolved || following.length === 0)) {
			return [];
		}

		const authors = useContactsFeed ? following : undefined;

		const baseRequest: RequestObject = {
			kinds: kindsToRequest,
			...(authors?.length ? { authors } : {}),
			limit: $limit,
			since: forPagination ? undefined : ago(31 * 24 * 60 * 60),
			noCache: true,
			tags: tags.length ? { '#t': tags } : undefined,
			relays: feedRelays
		};

		return [baseRequest];
	}

	function createHighlightPipeline(subId: string, muteConfig: MuteFilterPipeConfigT): PipeT[] {
		return [
			new PipeT(PipeConfig.MuteFilterPipeConfig, muteConfig),
			new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
			new PipeT(
				PipeConfig.SerializeEventsPipeConfig,
				new SerializeEventsPipeConfigT(new TextEncoder().encode(subId))
			)
		];
	}

	function buildHighlightRequest(): RequestObject[] {
		if (useContactsFeed && (!contactListResolved || following.length === 0)) return [];

		const authors = useContactsFeed ? following : undefined;
		return [
			{
				kinds: [HIGHLIGHT_KIND],
				...(authors?.length ? { authors } : {}),
				limit: $limit,
				since: ago(31 * 24 * 60 * 60),
				cacheFirst: true,
				relays: feedRelays
			}
		];
	}

	function handleHighlightEvents(message: WorkerMessage) {
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				connectionStatus = { ...connectionStatus, [normalizeURL(relayUrl)]: status };
			}
			if (status.status() === 'EOSE') highlightLoading = false;
			return;
		}

		if (message.type() === MessageType.Eoce) {
			highlightLoading = false;
			return;
		}

		const highlight = asNostrEvent(message);
		if (!highlight || highlight.kind() !== HIGHLIGHT_KIND) return;

		const eventId = highlight.id();
		if (!eventId) return;
		highlightEvents.set(eventId, highlight);
		highlightItems = Array.from(highlightEvents.values()).sort(
			(left, right) => right.createdAt() - left.createdAt()
		);
	}

	// Check if kind should be included based on feedKinds filter
	function shouldIncludeKind(kind: number): boolean {
		// If no kinds are selected, include all
		if ($feedKinds.length === 0) return true;
		// Otherwise, only include selected kinds
		return $feedKinds.includes(kind as FeedKind);
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
		if (!parsedEvent) {
			return undefined;
		}
		const kind = parsedEvent.kind();
		if (kind === HIGHLIGHT_KIND) return undefined;

		// Filter by kind based on feedKinds selection
		if (!shouldIncludeKind(kind)) {
			return undefined;
		}

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
					return undefined;
				}

				// CASE 2: Has both reply and root
				if (reply && root) {
					// If reply ID != root ID, it's a reply to a reply (nested) - skip it
					if (reply !== root) {
						return undefined;
					}
				}
				// CASE 3: No reply tag = root post (allow it)
			}

			if (kind == 6) {
				if (!kind6RepostReference(parsedEvent)) {
					return undefined;
				}
			}
		} else if (kind === 20) {
			// kind20 is always a root post (image posts), always allow them
			// But skip if images have no dimensions declared (prevents scroll jumps)
			const kind20 = asKind20(parsedEvent);
			if (kind20) {
				const images = fbArray(kind20, 'images');
				// If any image has no dim, skip this note
				if (images.some((img) => !img.dim())) {
					return undefined;
				}
			}
		}

		const eventId = parsedEvent.id();
		if (!eventId) {
			return undefined;
		}

		// Check Set first (O(1)) for duplicate detection
		if (seenEventIds.has(eventId)) {
			return undefined;
		}
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
			return parsedEvent.createdAt();
		}
		return undefined;
	}

	// Reset feed state
	function resetFeed() {
		feedItems = [];
		seenEventIds.clear();
		loading = false;
		refreshing = false;
		newPostsCount = 0;
		if (refreshTimeout) {
			clearTimeout(refreshTimeout);
			refreshTimeout = undefined;
		}
		feedSubscription?.close();
		feedSubscription = undefined;
		highlightSubscription?.();
		highlightSubscription = undefined;
		lastHighlightSubId = undefined;
		highlightEvents.clear();
		highlightItems = [];
	}

	// Initialize or update subscription when dependencies change
	let feedSubscription: PaginatedSubscription | undefined;
	let subscribedRelayKey: string | undefined;

	$: relayKey = `${feedRelays.length}_${hashString(feedRelayKey)}`;
	$: feedRequest = (() => {
		const requests = buildRequests();
		if (!visible || requests.length === 0 || feedRelays.length === 0) {
			return null;
		}

		return {
			subId: `${subId}_${relayKey}_${refreshCounter}`,
			requests,
			pageRequests: buildRequests(true)
		};
	})();

	$: if (!feedRequest) {
		if (feedSubscription) {
			feedSubscription.close();
			if (subscribedRelayKey !== relayKey) {
				getManager().cleanup();
			}
			feedSubscription = undefined;
		}
		lastSubId = undefined;
		hadFeedRequest = false;
		loading = false;
	}

	$: if (feedRequest && feedRequest.subId !== lastSubId) {
		if (!hadFeedRequest) {
			lastSubId = undefined;
			hadFeedRequest = true;
		}

		const relaySetChanged = subscribedRelayKey !== undefined && subscribedRelayKey !== relayKey;
		if (feedSubscription) {
			feedSubscription.close();
			if (relaySetChanged) {
				getManager().cleanup();
			}
		}
		feedSubscription = undefined;
		lastSubId = feedRequest.subId;
		feedSubscription = createPaginatedSubscription({
			subId: feedRequest.subId,
			requests: feedRequest.requests,
			pageRequests: feedRequest.pageRequests,
			windowSeconds: FEED_PAGE_WINDOW_SECONDS,
			maxEmptyPages: 3,
			rootTimeoutMs: 1500,
			initialLoading: feedItems.length === 0,
			onMessage: handleEvents,
			onStateChange: (state) => {
				loading = state.loading;
				if (!state.loading) {
					refreshing = false;
					if (refreshTimeout) {
						clearTimeout(refreshTimeout);
						refreshTimeout = undefined;
					}
				}
			},
			options: (subId) => ({
				bytesPerEvent: 10 * 1024,
				pipeline: $defaultPipeline.for(subId)
			})
		});
		feedSubscription.start();
		subscribedRelayKey = relayKey;
		setSubRelays(relaySelectionSubId, feedRelays);
	}

	$: highlightRequest = (() => {
		const selected = $feedKinds.length === 0 || $feedKinds.includes(HIGHLIGHT_KIND);
		if (!visible || !selected || !feedRelays.length) return null;

		const requests = buildHighlightRequest();
		if (!requests.length) return null;

		return {
			subId: `highlights_${subId}_${relayKey}_${refreshCounter}`,
			requests
		};
	})();

	$: if (!highlightRequest) {
		highlightSubscription?.();
		highlightSubscription = undefined;
		lastHighlightSubId = undefined;
		highlightLoading = false;
		highlightEvents.clear();
		highlightItems = [];
	}

	$: if (highlightRequest && highlightRequest.subId !== lastHighlightSubId) {
		highlightSubscription?.();
		highlightSubscription = undefined;
		lastHighlightSubId = highlightRequest.subId;
		highlightLoading = true;
		highlightEvents.clear();
		highlightItems = [];
		setSubRelays(highlightRequest.subId, feedRelays);
		highlightSubscription = useSubscription(
			highlightRequest.subId,
			highlightRequest.requests,
			handleHighlightEvents,
			{
				bytesPerEvent: 32 * 1024,
				closeOnEose: true,
				pipeline: createHighlightPipeline(highlightRequest.subId, $mutePipeConfig)
			}
		);
	}

	$: if (visible && feedRelays.length && feedRelayKey !== lastEventRelayKey) {
		subscribeExploreEvents();
	}

	$: if (visible && feedRelays.length && eventAddressKey && eventAddressKey !== lastRsvpKey) {
		subscribeExploreRsvps();
	}

	// Stop active subscriptions when becoming invisible
	$: if (!visible) {
		feedSubscription?.close();
		feedSubscription = undefined;
		highlightSubscription?.();
		highlightSubscription = undefined;
		eventSub?.();
		eventSub = undefined;
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		rsvpSubs = [];
		lastSubId = undefined;
		lastEventRelayKey = '';
		lastRsvpKey = '';
		hadFeedRequest = false;
		lastHighlightSubId = undefined;
		highlightLoading = false;
	}

	// Cleanup on component destroy
	onDestroy(() => {
		relaySubUnsubscribe?.();
		feedSubscription?.close();
		highlightSubscription?.();
		eventSub?.();
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		if (refreshTimeout) clearTimeout(refreshTimeout);
	});

	// Handle pull-to-refresh - keep existing feed items, just show loader and fetch new
	function handleRefresh() {
		if (refreshing) return;
		refreshing = true;
		// Don't clear feedItems or seenEventIds - keep existing content visible
		// Force a fresh subscription while keeping automatic relay switches stable.
		refreshCounter++;
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

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		if (loading || feedItems.length === 0) return;
		feedSubscription?.loadMore();
	}

	// Merge pending new items when user clicks the new posts indicator
	function mergePendingItems() {
		newPostsCount = 0;
		lastSeenTopItem = feedItems[0]?.createdAt();
	}

	function toggleAudienceMode() {
		if (!$key?.pub) {
			$exploreAudienceMode = 'all';
			return;
		}
		$exploreAudienceMode = useContactsFeed ? 'all' : 'contacts';
		resetFeed();
		hadFeedRequest = false;
		connectionStatus = {};
	}

	function selectExploreKindTab(event: CustomEvent<{ kinds: FeedKind[]; tab: KindSwitcherTab }>) {
		navigateStackPath(resolve(exploreFeedHref(event.detail.tab.id, feedRelays)));
		applyExploreFeedKinds(event.detail.kinds);
	}

	$: routeFeedKinds = exploreFeedKinds(exploreFeedTabFromPath($stackPath));
	$: if (!sameFeedKinds($feedKinds, routeFeedKinds)) {
		$feedKinds = routeFeedKinds;
		resetFeed();
		connectionStatus = {};
		hadFeedRequest = false;
	}

	function audienceButtonClass() {
		return 'flex items-center gap-1 text-2xl font-semibold tracking-tight transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md active:translate-y-px';
	}
</script>

<Pager rootPath="/explore">
	<Feed
		items={displayItems}
		loading={loading || refreshing || highlightLoading}
		pullToRefresh
		onRefresh={handleRefresh}
		onNearBottom={handleNearBottom}
		bind:start
		bind:end
	>
		<svelte:fragment slot="empty-content">
			{#if useContactsFeed && contactListResolved && following.length === 0}
				<div
					class="mx-auto mt-6 w-[calc(100%_-_1rem)] max-w-lg rounded-2xl border border-warning/35 bg-warning/10 px-5 py-6 text-center shadow-widget"
					role="status"
					aria-live="polite"
				>
					<Icon icon="mdi:account-group-outline" class="mx-auto h-9 w-9 text-warning" />
					<h2 class="mt-2 text-lg font-bold">No contacts yet</h2>
					<p class="mt-1 text-sm text-base-content/70">
						Follow people from the All feed and their posts will appear here.
					</p>
					<button type="button" class="btn btn-sm btn-outline mt-4" on:click={toggleAudienceMode}>
						Browse all posts
					</button>
				</div>
			{:else if useContactsFeed && contactListResolved && following.length > 0 && !loading && !refreshing && !highlightLoading}
				<div
					class="mx-auto mt-6 w-[calc(100%_-_1rem)] max-w-lg rounded-2xl border border-base-content/15 bg-base-300/85 px-5 py-6 text-center"
				>
					<Icon icon="mdi:account-clock-outline" class="mx-auto h-8 w-8 text-base-content/60" />
					<h2 class="mt-2 font-bold">No recent contact posts</h2>
					<p class="mt-1 text-sm text-base-content/65">
						Your list has {contactCountLabel}, but none have posted in this feed yet.
					</p>
				</div>
			{/if}
		</svelte:fragment>
		<svelte:fragment slot="sticky-header">
			<div
				class="explore-sticky-header relative bg-base-300 bg-opacity-80 md:border-b border-base-200 pt-safe"
			>
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center px-3 md:px-4">
					<div class="flex gap-1 items-center min-w-0 flex-1">
						<button
							type="button"
							class={audienceButtonClass()}
							on:click|stopPropagation={toggleAudienceMode}
							title="Toggle Explore feed audience"
						>
							{activeAudienceLabel}
							{#if useContactsFeed}
								<span
									class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-base-200 px-1.5 text-xs font-bold text-base-content/75"
									aria-label={contactCountLabel}
								>
									{contactListResolved ? following.length : '…'}
								</span>
							{/if}
							<Icon icon="mdi:chevron-down" class="text-2xl" />
						</button>
					</div>

					<div class="flex gap-2 items-center w-1/3 justify-end">
						<!-- <span class="text font-semibold">{$balance} Sats</span> -->
						<span class="cursor-pointer" on:click|stopPropagation={() => openRoot('notifications')}>
							<Icon icon="mdi:bell-outline" class="text-2xl mr-2" />
						</span>
						<a class="cursor-pointer" on:click|stopPropagation={() => openRoot('profile')}>
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
				<button
					type="button"
					on:click|stopPropagation={() => openRoot('post')}
					class="nuts-composer w-full px-4 py-2 text-left rounded-full border border-accent backdrop-blur-md"
				>
					<span>What's happening in your community?</span>
					<span class="composer-action" aria-hidden="true">Post</span>
				</button>
			</div>
		</svelte.fragment>
		<svelte.fragment slot="header">
			<div
				class="explore-header w-feed relative pt-safe rounded-lg border border-base-200/70 bg-base-300/85 px-3 pb-3 shadow-widget-down backdrop-blur-gpu md:px-4"
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
							{#if useContactsFeed}
								<span
									class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-base-200 px-1.5 text-xs font-bold text-base-content/75"
									aria-label={contactCountLabel}
								>
									{contactListResolved ? following.length : '…'}
								</span>
							{/if}
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
						<div class="cursor-pointer" on:click|stopPropagation={() => openRoot('profile')}>
							<Avatar pubkey={$key?.pub || ''} size="md" customClass="border rounded-full" />
						</div>
					</div>
				</div>
				<div class="min-h-10">
					<RelaysList
						class="!justify-start"
						subId={relaySelectionSubId}
						relays={feedRelays}
						{connectionStatus}
					/>
				</div>
				{#if upcomingEvents.length}
					<div class="events-section mt-3 border-t border-base-200/70 pt-3">
						<div class="mb-3 flex items-center justify-between">
							<h2 class="section-heading text-base font-bold">Upcoming events</h2>
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
						includeHighlights
						hrefByTab={exploreKindHrefs}
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

<style>
	:global(html[data-theme='nuts']) .explore-header,
	:global(html[data-theme='nuts']) .explore-sticky-header {
		border-color: rgba(242, 235, 221, 0.11);
		background: rgba(27, 48, 39, 0.96);
		box-shadow:
			0 18px 38px rgba(3, 12, 8, 0.22),
			inset 0 1px 0 rgba(242, 235, 221, 0.055);
		backdrop-filter: blur(18px);
	}

	:global(html[data-theme='nuts']) .explore-header {
		border-radius: 0 0 1rem 1rem;
	}

	:global(html[data-theme='nuts']) .events-section {
		border-color: rgba(242, 235, 221, 0.1);
	}

	:global(html[data-theme='nuts']) .section-heading {
		color: #f2ebdd;
		letter-spacing: -0.015em;
	}

	.nuts-composer {
		display: flex;
		min-height: 3.25rem;
		align-items: center;
		justify-content: space-between;
		border-color: color-mix(in srgb, var(--primary) 75%, transparent);
		background: color-mix(in srgb, var(--base-300) 94%, transparent);
		color: var(--text-muted);
		box-shadow:
			0 12px 30px color-mix(in srgb, var(--shadow-outer-color) 72%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--text-strong) 8%, transparent);
	}

	.nuts-composer:hover,
	.nuts-composer:focus-visible {
		border-color: var(--primary);
		background: color-mix(in srgb, var(--base-300) 88%, var(--text-strong) 12%);
		box-shadow:
			4px 5px 0 color-mix(in srgb, var(--accent) 42%, transparent),
			0 14px 30px color-mix(in srgb, var(--shadow-outer-color) 68%, transparent);
	}

	.composer-action {
		border-radius: 999px;
		background: oklch(var(--a));
		padding: 0.35rem 0.8rem;
		color: oklch(var(--ac));
		font-size: 0.75rem;
		font-weight: 800;
	}
</style>
