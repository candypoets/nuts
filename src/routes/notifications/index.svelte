<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from 'src/lib/paths';
	import {
		extractTagValue,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import {
		createPaginatedSubscription,
		type PaginatedSubscription,
		useSubscription
	} from '@candypoets/nipworker/hooks';
	import { asParsedEvent, asConnectionStatus, isParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import {
		defaultPipeline,
		key,
		lastNotificationView,
		readRelays,
		relayDirectoryUrls
	} from 'src/controller';
	import { FEED_PAGE_WINDOW_SECONDS } from 'src/controller/pagination';
	import {
		fetchCommunityAccess,
		fetchCommunityTrust,
		type CommunityTrust
	} from 'src/lib/adminAccess';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import Feed from 'src/routes/explore/feed.svelte';
	import { onMount, onDestroy } from 'svelte';
	import {
		BADGE_STATUS_KIND,
		isBadgeStatus,
		processBadgeNotifications,
		processNotifications,
		type NotificationItem
	} from './notifications';
	import Reactions from './reactions.svelte';
	import Replies from './replies.svelte';
	import Mentions from './mentions.svelte';
	import Reposts from './reposts.svelte';
	import Badges from './badges.svelte';

	export let visible = true;
	export let goBack: () => void;

	let loading = true;

	// Raw events from subscription
	let rawEvents: ParsedEvent[] = [];
	// Processed notifications (grouped by type)
	let notificationItems: NotificationItem[] = [];
	let badgeAwards: ParsedEvent[] = [];
	let rawBadgeStatuses: ParsedEvent[] = [];
	let badgeStatuses: ParsedEvent[] = [];

	// Track seen event IDs to prevent duplicates
	let seenEventIds = new Set<string>();

	// Subscription cleanup function
	let feedSubscription: PaginatedSubscription | undefined;
	let badgeUnsubscribe: (() => void) | undefined;
	let badgeInitialized = false;
	let lastBadgeRelayKey = '';
	let badgeGeneration = 0;
	let trustPromises = new Map<string, Promise<CommunityTrust>>();
	let authorizationPromises = new Map<string, Promise<boolean>>();
	let awardAcceptanceInFlight = new Set<string>();
	let statusAuthorizationInFlight = new Set<string>();
	let badgeAwardRelays = new Map<string, string[]>();

	// Pagination state
	let hasMore = true;
	let lastRelayKey = '';
	// Auto-backfill state: grouped pages can be too short to scroll, which would
	// otherwise prevent onNearBottom from ever firing
	let shortBackfillCount = 0;

	const SHORT_PAGE_BACKFILL_ROWS = 25;
	const MAX_SHORT_PAGE_BACKFILLS = 6;
	const PAGINATION_TIMEOUT_MS = 10000;
	const EOSE_FALLBACK_TIMEOUT_MS = 1000;

	$: notificationRelays = Array.from(
		new Set(($readRelays || []).length ? $readRelays || [] : DEFAULT_RELAYS)
	).filter((relay): relay is string => Boolean(relay));
	$: notificationRelayKey = notificationRelays.join('|');
	$: badgeRelays = Array.from(
		new Set(($relayDirectoryUrls || []).map(normalizedRelay).filter(Boolean))
	);
	$: badgeRelayKey = badgeRelays.join('|');

	// Build subscription requests
	function buildRequests(): RequestObject[] {
		if (!$key?.pub) {
			return [];
		}

		const req: RequestObject = {
			// Mentions of user, reactions to user's posts, reposts of user's content
			kinds: [1, 7, 6],
			tags: { '#p': [$key.pub] },
			limit: 50,
			relays: notificationRelays,
			noCache: true
		};
		return [req];
	}

	function goSettings() {
		void goto(resolve('/settings' as any));
	}

	function addEvent(parsedEvent: ParsedEvent): number | undefined {
		// Filter out events authored by the logged-in user
		const author = parsedEvent.pubkey();
		if (author === $key?.pub) return undefined;

		const kind = parsedEvent.kind();
		if (![1, 6, 7].includes(kind)) return undefined;

		const eventId = parsedEvent.id();
		if (!eventId) return undefined;

		// Check Set first (O(1)) for duplicate detection
		if (seenEventIds.has(eventId)) return undefined;
		seenEventIds.add(eventId);

		rawEvents = [...rawEvents, parsedEvent];
		return parsedEvent.createdAt();
	}

	// Handle incoming events from the main subscription
	function handleEvents(message: WorkerMessage): number | undefined {
		const status = asConnectionStatus(message);
		if (status) {
			return undefined;
		}

		const parsedEvent = asParsedEvent(message);
		return parsedEvent ? addEvent(parsedEvent) : undefined;
	}

	// Process raw events into grouped notifications
	$: notificationItems = [
		...processNotifications(rawEvents),
		...processBadgeNotifications(badgeAwards, badgeStatuses, badgeRelays)
	].sort((left, right) => right.createdAt() - left.createdAt());

	function normalizedRelay(relay: string) {
		try {
			return normalizeURL(relay);
		} catch {
			return '';
		}
	}

	function badgeAddress(event: ParsedEvent) {
		return extractTagValue(event, 'a') || '';
	}

	function trustForRelay(relay: string) {
		let trust = trustPromises.get(relay);
		if (!trust) {
			trust = fetchCommunityTrust(relay);
			trustPromises.set(relay, trust);
		}
		return trust;
	}

	function signerAuthorization(relay: string, signer: string, permission: 'store' | 'events') {
		const cacheKey = `${relay}:${signer}:${permission}`;
		let authorization = authorizationPromises.get(cacheKey);
		if (!authorization) {
			authorization = trustForRelay(relay).then(async (trust) => {
				if (trust.authorityPubkeys.has(signer)) return true;
				const access = await fetchCommunityAccess(relay, signer, false);
				return access.permissions.has(permission);
			});
			authorizationPromises.set(cacheKey, authorization);
		}
		return authorization;
	}

	async function acceptBadgeAward(event: ParsedEvent, generation: number) {
		const id = event.id();
		const recipient = extractTagValue(event, 'p');
		const address = badgeAddress(event);
		const issuer = event.pubkey();
		if (
			event.kind() !== 8 ||
			!id ||
			recipient !== $key?.pub ||
			!address.startsWith('30009:') ||
			!issuer
		) {
			return;
		}
		if (badgeAwards.some((candidate) => candidate.id() === id) || awardAcceptanceInFlight.has(id)) {
			return;
		}
		awardAcceptanceInFlight.add(id);
		try {
			const trustedRelays = (
				await Promise.all(
					badgeRelays.map(async (relay) => {
						const trust = await trustForRelay(relay);
						return trust.authorityPubkeys.has(issuer) || trust.badgeIssuer === issuer ? relay : '';
					})
				)
			).filter(Boolean);
			if (generation !== badgeGeneration || !trustedRelays.length) return;
			badgeAwardRelays.set(id, trustedRelays);
			badgeAwards = [...badgeAwards, event];
			reconcileBadgeStatuses();
		} finally {
			awardAcceptanceInFlight.delete(id);
		}
	}

	function reconcileBadgeStatuses() {
		for (const event of rawBadgeStatuses) {
			const id = event.id();
			const awardId = extractTagValue(event, 'e');
			const address = extractTagValue(event, 'a');
			const recipient = extractTagValue(event, 'p');
			const signer = event.pubkey();
			if (
				!id ||
				!awardId ||
				!address ||
				recipient !== $key?.pub ||
				!signer ||
				!isBadgeStatus(extractTagValue(event, 'status')) ||
				badgeStatuses.some((status) => status.id() === id)
			) {
				continue;
			}
			const award = badgeAwards.find(
				(item) => item.id() === awardId && badgeAddress(item) === address
			);
			if (!award) continue;
			const candidateRelays = badgeAwardRelays.get(awardId) || [];
			if (!candidateRelays.length) continue;
			const authorizationKey = `${badgeGeneration}:${id}`;
			if (statusAuthorizationInFlight.has(authorizationKey)) continue;
			statusAuthorizationInFlight.add(authorizationKey);
			const generation = badgeGeneration;
			void Promise.all(
				candidateRelays.map(async (relay) => {
					if (await signerAuthorization(relay, signer, 'store')) return true;
					return signerAuthorization(relay, signer, 'events');
				})
			).then((results) => {
				statusAuthorizationInFlight.delete(authorizationKey);
				if (
					generation !== badgeGeneration ||
					!results.some(Boolean) ||
					badgeStatuses.some((status) => status.id() === id)
				) {
					return;
				}
				badgeStatuses = [...badgeStatuses, event];
			});
		}
	}

	function handleBadgeEvents(message: WorkerMessage, generation: number) {
		const event = isParsedEvent(message);
		if (!event || generation !== badgeGeneration) return;
		if (event.kind() === 8) {
			void acceptBadgeAward(event, generation);
			return;
		}
		if (event.kind() !== BADGE_STATUS_KIND || extractTagValue(event, 'p') !== $key?.pub) return;
		const id = event.id();
		if (
			!id ||
			!isBadgeStatus(extractTagValue(event, 'status')) ||
			Boolean(extractTagValue(event, 'order')) === Boolean(extractTagValue(event, 'event')) ||
			rawBadgeStatuses.some((candidate) => candidate.id() === id)
		) {
			return;
		}
		rawBadgeStatuses = [...rawBadgeStatuses, event];
		reconcileBadgeStatuses();
	}

	function resetBadgeSubscription() {
		badgeGeneration += 1;
		badgeUnsubscribe?.();
		badgeUnsubscribe = undefined;
		badgeInitialized = false;
		badgeAwards = [];
		rawBadgeStatuses = [];
		badgeStatuses = [];
		trustPromises = new Map();
		authorizationPromises = new Map();
		badgeAwardRelays = new Map();
		awardAcceptanceInFlight.clear();
		statusAuthorizationInFlight.clear();
	}

	function initBadgeSubscription() {
		if (!visible || badgeInitialized || !$key?.pub || !badgeRelays.length) return;
		badgeInitialized = true;
		lastBadgeRelayKey = badgeRelayKey;
		const generation = ++badgeGeneration;
		badgeUnsubscribe = useSubscription(
			`notifications_badges_${$key.pub}_${badgeRelayKey}`,
			[
				{
					kinds: [8],
					tags: { '#p': [$key.pub] },
					limit: 200,
					relays: badgeRelays,
					cacheFirst: true
				},
				{
					kinds: [BADGE_STATUS_KIND],
					tags: { '#p': [$key.pub] },
					limit: 200,
					relays: badgeRelays,
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => handleBadgeEvents(message, generation),
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	// Initialize subscription
	let hasInitialized = false;

	function initSubscription() {
		if (!visible || !$key?.pub || !notificationRelays.length) return;
		if (hasInitialized) return;

		rawEvents = [];
		seenEventIds.clear();
		hasInitialized = true;
		lastRelayKey = notificationRelayKey;
		hasMore = true;
		shortBackfillCount = 0;
		feedSubscription?.close();
		const subId = 'notifications_' + $key.pub + '_' + notificationRelayKey;
		feedSubscription = createPaginatedSubscription({
			subId,
			requests: buildRequests(),
			windowSeconds: FEED_PAGE_WINDOW_SECONDS,
			maxEmptyPages: 3,
			rootTimeoutMs: EOSE_FALLBACK_TIMEOUT_MS,
			pageTimeoutMs: PAGINATION_TIMEOUT_MS,
			onMessage: handleEvents,
			onStateChange: (state) => {
				loading = state.loading;
				hasMore = state.hasMore;
			},
			options: (subscriptionId) => ({
				bytesPerEvent: 10 * 1024,
				pipeline: $defaultPipeline.for(subscriptionId)
			})
		});
		feedSubscription.start();
	}

	$: if (visible && $key?.pub && notificationRelays.length && !hasInitialized) {
		initSubscription();
	}

	$: if (visible && $key?.pub && badgeRelays.length && !badgeInitialized) {
		initBadgeSubscription();
	}

	$: if (visible && $key?.pub && hasInitialized && notificationRelayKey !== lastRelayKey) {
		feedSubscription?.close();
		feedSubscription = undefined;
		hasInitialized = false;
		rawEvents = [];
		seenEventIds.clear();
		initSubscription();
	}

	$: if (visible && $key?.pub && badgeInitialized && badgeRelayKey !== lastBadgeRelayKey) {
		resetBadgeSubscription();
		initBadgeSubscription();
	}

	// Cleanup subscription when not visible
	$: if (!visible) {
		feedSubscription?.close();
		feedSubscription = undefined;
		hasInitialized = false;
		resetBadgeSubscription();
	}

	onMount(() => {
		$lastNotificationView = Date.now();
		window.scrollTo(0, 0);
		return () => {
			feedSubscription?.close();
			badgeUnsubscribe?.();
		};
	});

	onDestroy(() => {
		feedSubscription?.close();
		badgeUnsubscribe?.();
	});

	// Load the next page of notifications.
	// isAutoBackfill: triggered by the short-page backfill below, not by scrolling.
	function loadNextPage(isAutoBackfill = false) {
		if (loading || !hasMore || rawEvents.length === 0) return;

		if (isAutoBackfill) shortBackfillCount += 1;
		feedSubscription?.loadMore();
	}

	// Handle near-bottom pagination
	function handleNearBottom() {
		loadNextPage(false);
	}

	// Auto-backfill when a page groups down to too few rows to fill the viewport.
	// The feed only fires onNearBottom after the user scrolls, so short pages
	// would otherwise deadlock with no way to trigger pagination.
	$: if (
		visible &&
		!loading &&
		hasMore &&
		rawEvents.length > 0 &&
		notificationItems.length < SHORT_PAGE_BACKFILL_ROWS &&
		shortBackfillCount < MAX_SHORT_PAGE_BACKFILLS
	) {
		loadNextPage(true);
	}
</script>

<!-- Header for the page -->
<Feed
	items={notificationItems}
	{loading}
	{visible}
	getItemId={(item) => {
		// Use a stable primitive key. Returning object/random causes row churn.
		const idObj = item?.id?.();
		const hash = idObj?.fnv1aHash?.();
		return hash || `${item?.type || 'notification'}-${item?.createdAt?.() || 'unknown'}`;
	}}
	onNearBottom={handleNearBottom}
>
	<svelte:fragment slot="sticky-header">
		<div
			class="w-feed pt-safe bg-base-300 bg-opacity-85 mt-1 rounded-lg h-20 pb-2 flex items-center justify-between shadow-sm"
		>
			<button on:click={() => goBack()} class="p-1 rounded-full hover:bg-base-200 mx-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<h1 class="text-lg font-semibold">Notifications</h1>
			<span class="w-10"></span>
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
			<span class="w-10"></span>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="empty-content">
		{#if !loading && $key}
			<div class="w-feed mx-auto py-16 text-center text-base-content/60">
				<Icon icon="mdi:bell-outline" class="mx-auto mb-3 text-4xl" />
				<p>No notifications yet.</p>
			</div>
		{/if}
	</svelte:fragment>

	<svelte:fragment slot="item-content" let:post let:visible>
		<div class="notification-card mb-2 overflow-hidden rounded-xl backdrop-blur-gpu">
			<!-- {#if visible} -->
			{#if post.type === 'reply'}
				<Replies {post} {visible} />
			{:else if post.type === 'reaction'}
				<Reactions {post} {visible} />
			{:else if post.type === 'mention'}
				<Mentions {post} {visible} />
			{:else if post.type === 'repost'}
				<Reposts {post} {visible} />
			{:else if post.type === 'badge'}
				<Badges {post} />
			{/if}
		</div>
	</svelte:fragment>
</Feed>

{#if !$key}
	<div class="flex flex-col items-center justify-center h-screen">
		<Icon icon="mdi:bell-off" class="text-6xl text-gray-300 mb-4" />
		<p class="text-gray-500">Sign in to view your notifications</p>
		<button class="mt-4 bg-primary text-white px-4 py-2 rounded-lg" on:click={goSettings}>
			Sign In
		</button>
	</div>
{/if}
