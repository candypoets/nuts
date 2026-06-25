<script lang="ts">
	import {
		CounterPipeConfigT,
		PipeConfig,
		PipeT,
		type ConnectionStatus,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind1,
		asKind6,
		asKind20,
		asParsedEvent,
		asCountResponse,
		fbArray
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import EventCard, { type CalendarEventCard } from 'src/components/EventCard.svelte';
	import KindSwitcher from 'src/components/KindSwitcher.svelte';
	import { ALL_FEED_KINDS, type FeedKind } from 'src/controller/feed';
	import { fetchRelayInfo, relayInfos, setSubRelays } from 'src/controller/relay';
	import { CALENDAR_EVENT_KINDS, RSVP_KIND, parseCalendarEvent } from 'src/lib/calendarEvent';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import Feed from 'src/routes/explore/feed.svelte';
	import { onDestroy, onMount } from 'svelte';

	export let relay: string;
	export let visible = true;
	export let goBack: (() => void) | undefined;

	let selectedKinds: FeedKind[] = [];
	let items: ParsedEvent[] = [];
	let seenIds = new Set<string>();
	let loading = false;
	let emptyTimedOut = false;
	let connectionStatus: Record<string, ConnectionStatus> = {};
	let sub: (() => void) | undefined;
	let paginationSub: (() => void) | undefined;
	let eventSub: (() => void) | undefined;
	let rsvpSubs: (() => void)[] = [];
	let emptyTimeout: ReturnType<typeof setTimeout> | undefined;
	let paginationTimeout: ReturnType<typeof setTimeout> | undefined;
	let paginationCheckTimeout: ReturnType<typeof setTimeout> | undefined;
	let lastSubId = '';
	let lastEventSubId = '';
	let lastRsvpKey = '';
	let upcomingEvents: CalendarEventCard[] = [];
	let rsvpCountsByAddress: Record<string, number> = {};
	let until: number | undefined;
	let hasMore = true;
	let itemsBeforePagination = 0;

	$: normalizedRelay = normalizeURL(relay);
	$: relayInfo = $relayInfos.get(normalizedRelay);
	$: name = relayInfo?.name?.trim() || relayLabel(normalizedRelay);
	$: description = relayInfo?.description?.trim() || 'Public relay community.';
	$: icon = relayInfo?.icon;
	$: requestKinds = selectedKinds.length ? selectedKinds : (ALL_FEED_KINDS as FeedKind[]);
	$: subId = `community_${relayHash(normalizedRelay)}_${requestKinds.join('-')}`;
	$: eventAddressKey = upcomingEvents.map((event) => event.address).join('|');

	function relayLabel(url: string) {
		return url
			.replace(/^wss?:\/\//, '')
			.replace(/^relay\./, '')
			.replace(/\/$/, '');
	}

	function relayHash(url: string) {
		return url.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
	}

	function initials(value: string) {
		const words = value
			.replace(/[^a-zA-Z0-9\s]/g, ' ')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!words.length) return '?';
		if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
		return `${words[0][0]}${words[1][0]}`.toUpperCase();
	}

	function communityColor(url: string) {
		let hash = 0;
		for (let index = 0; index < url.length; index += 1) {
			hash = (hash * 31 + url.charCodeAt(index)) % 360;
		}
		return `hsl(${hash}, 74%, 42%)`;
	}

	function shouldShowCommunityPost(event: ParsedEvent) {
		const kind = event.kind();
		if (!requestKinds.includes(kind as FeedKind)) return false;

		if (kind === 1 || kind === 6) {
			const kind1 = asKind1(event);
			if (kind1) {
				const reply = kind1.reply()?.id();
				const root = kind1.root()?.id();
				if (reply && !root) return false;
				if (reply && root && reply !== root) return false;
			}
			if (kind === 6) {
				const kind6 = asKind6(event);
				if (!kind6?.repostedEvent()) return false;
			}
		} else if (kind === 20) {
			const kind20 = asKind20(event);
			if (kind20 && fbArray(kind20, 'images').some((image) => !image.dim())) return false;
		}

		return true;
	}

	function resetFeed() {
		items = [];
		seenIds.clear();
		emptyTimedOut = false;
		hasMore = true;
		until = undefined;
		itemsBeforePagination = 0;
		paginationSub?.();
		paginationSub = undefined;
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}
		if (paginationCheckTimeout) {
			clearTimeout(paginationCheckTimeout);
			paginationCheckTimeout = undefined;
		}
	}

	function selectKinds(event: CustomEvent<{ kinds: FeedKind[] }>) {
		selectedKinds = event.detail.kinds;
		resetFeed();
		lastSubId = '';
	}

	function handleMessage(message: WorkerMessage) {
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				connectionStatus = { ...connectionStatus, [normalizeURL(relayUrl)]: status };
			}
			if (status.status()?.toString() === 'EOSE') {
				loading = false;
				if (!items.length) emptyTimedOut = true;
			}
			return;
		}

		const event = asParsedEvent(message);
		if (!event || !shouldShowCommunityPost(event)) return;

		const id = event.id();
		if (!id || seenIds.has(id)) return;
		seenIds.add(id);
		items = [...items, event].sort((left, right) => right.createdAt() - left.createdAt());
		loading = false;
	}

	function handleEventMessage(events: Map<string, CalendarEventCard>, message: WorkerMessage) {
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

		const event = parseCalendarEvent(parsed, [normalizedRelay]);
		if (!event) return;

		events.set(event.id, event);
		upcomingEvents = Array.from(events.values()).sort((left, right) => left.start - right.start);
	}

	function subscribeEvents() {
		if (!visible || !normalizedRelay) return;

		const eventSubId = `community_events_${relayHash(normalizedRelay)}`;
		if (eventSubId === lastEventSubId) return;

		eventSub?.();
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		rsvpSubs = [];
		rsvpCountsByAddress = {};
		upcomingEvents = [];
		lastRsvpKey = '';
		lastEventSubId = eventSubId;

		const events = new Map<string, CalendarEventCard>();
		setSubRelays(eventSubId, [normalizedRelay]);
		eventSub = useSubscription(
			eventSubId,
			[
				{
					kinds: CALENDAR_EVENT_KINDS,
					limit: 20,
					noCache: true,
					relays: [normalizedRelay]
				}
			],
			(message) => handleEventMessage(events, message),
			{ bytesPerEvent: 8 * 1024, closeOnEose: true }
		);
	}

	function subscribeRsvps() {
		if (!visible || !normalizedRelay || !eventAddressKey || eventAddressKey === lastRsvpKey) return;

		lastRsvpKey = eventAddressKey;
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		rsvpSubs = upcomingEvents.map((event) => {
			const rsvpSubId = `community_rsvps_${relayHash(normalizedRelay)}_${relayHash(event.address)}`;
			setSubRelays(rsvpSubId, [normalizedRelay]);

			return useSubscription(
				rsvpSubId,
				[
					{
						kinds: [RSVP_KIND],
						noCache: true,
						relays: [normalizedRelay],
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
						new PipeT(PipeConfig.CounterPipeConfig, new CounterPipeConfigT([RSVP_KIND], ''))
					]
				}
			);
		});
	}

	function subscribe() {
		if (!visible || !normalizedRelay || subId === lastSubId) return;

		sub?.();
		lastSubId = subId;
		loading = true;
		emptyTimedOut = false;
		setSubRelays(subId, [normalizedRelay]);
		void fetchRelayInfo(normalizedRelay);

		if (emptyTimeout) clearTimeout(emptyTimeout);
		emptyTimeout = setTimeout(() => {
			if (!items.length) {
				loading = false;
				emptyTimedOut = true;
			}
		}, 2400);

		sub = useSubscription(
			subId,
			[
				{
					kinds: requestKinds,
					limit: 50,
					noCache: true,
					relays: [normalizedRelay]
				}
			],
			handleMessage,
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	function handleNearBottom() {
		if (loading || !hasMore || !items.length) return;

		const lastItem = items[items.length - 1];
		if (!lastItem) return;

		until = lastItem.createdAt() - 1;
		itemsBeforePagination = items.length;
		loading = true;

		const pageSubId = `${subId}_page_${until}`;
		paginationSub?.();
		paginationSub = useSubscription(
			pageSubId,
			[
				{
					kinds: requestKinds,
					limit: 50,
					until,
					noCache: true,
					relays: [normalizedRelay]
				}
			],
			handleMessage,
			{ bytesPerEvent: 10 * 1024 }
		);

		if (paginationTimeout) clearTimeout(paginationTimeout);
		paginationTimeout = setTimeout(() => {
			loading = false;
		}, 10000);
	}

	$: if (!loading && itemsBeforePagination > 0) {
		const itemsAtCheck = itemsBeforePagination;
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}

		if (paginationCheckTimeout) clearTimeout(paginationCheckTimeout);
		paginationCheckTimeout = setTimeout(() => {
			if (items.length - itemsAtCheck === 0) {
				hasMore = false;
			}
			itemsBeforePagination = 0;
			setTimeout(() => {
				paginationSub?.();
				paginationSub = undefined;
			}, 5000);
		}, 500);
	}

	onMount(() => {
		subscribe();
		subscribeEvents();
	});

	$: if (visible && normalizedRelay && subId !== lastSubId) {
		subscribe();
	}
	$: if (
		visible &&
		normalizedRelay &&
		`community_events_${relayHash(normalizedRelay)}` !== lastEventSubId
	) {
		subscribeEvents();
	}
	$: if (visible && normalizedRelay && eventAddressKey && eventAddressKey !== lastRsvpKey) {
		subscribeRsvps();
	}

	onDestroy(() => {
		sub?.();
		paginationSub?.();
		eventSub?.();
		rsvpSubs.forEach((unsubscribe) => unsubscribe());
		if (emptyTimeout) clearTimeout(emptyTimeout);
		if (paginationTimeout) clearTimeout(paginationTimeout);
		if (paginationCheckTimeout) clearTimeout(paginationCheckTimeout);
	});
</script>

<Feed
	{items}
	getItemId={(item) => item.id() || item.createdAt()}
	{visible}
	{loading}
	onNearBottom={handleNearBottom}
>
	<svelte:fragment slot="sticky-header">
		<div class="px-4 py-3 flex items-center justify-between pt-safe bg-base-100 bg-opacity-90">
			<button type="button" on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<div class="min-w-0 flex-1 text-center text-base font-semibold truncate">{name}</div>
			<span class="w-8"></span>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="header">
		<div class="w-feed mx-auto overflow-hidden rounded-lg bg-base-300 bg-opacity-85">
			<div class="h-44 px-4 pt-safe" style={`background: ${communityColor(normalizedRelay)};`}>
				<div class="flex items-center justify-between pt-4">
					<button type="button" on:click={goBack} class="btn btn-sm btn-circle bg-base-300/80">
						<Icon icon="mdi:arrow-left" class="text-xl" />
					</button>
					<div class="btn btn-sm btn-circle bg-base-300/80">
						<Icon icon="mdi:dots-horizontal" class="text-xl" />
					</div>
				</div>
			</div>

			<div class="-mt-12 px-4 pb-4">
				<div class="flex items-end justify-between gap-3">
					<div
						class="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-white bg-base-200"
					>
						{#if icon}
							<img src={proxyAvatarUrl(icon)} alt="" class="h-full w-full object-cover" />
						{:else}
							<span class="text-2xl font-black text-primary-content">{initials(name)}</span>
						{/if}
					</div>
					<div class="rounded-full border border-primary px-4 py-2 text-sm font-bold text-primary">
						Public
					</div>
				</div>

				<h1 class="mt-4 text-3xl font-bold leading-tight">{name}</h1>
				<p class="mt-1 truncate text-base font-medium text-primary-content">
					Public community · {relayLabel(normalizedRelay)}
				</p>
				<p class="mt-5 text-base leading-6 text-primary-content">{description}</p>

				<div class="mt-6 grid grid-cols-2 gap-3">
					<button type="button" class="btn h-14 rounded-lg bg-base-200">
						<Icon icon="mdi:share-outline" class="text-xl text-primary" />
						Share
					</button>
					<button type="button" class="btn h-14 rounded-lg bg-base-200">
						<Icon icon="mdi:account-plus-outline" class="text-xl text-primary" />
						Invite
					</button>
				</div>

				<div class="mt-6 border-t border-base-200 pt-4">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-base font-bold">Upcoming events</h2>
						{#if upcomingEvents.length}
							<span class="text-sm font-bold text-primary">See all</span>
						{/if}
					</div>
					{#if upcomingEvents.length}
						<div class="flex items-start gap-3 overflow-x-auto pb-1 scrollbar-hide">
							{#each upcomingEvents.slice(0, 3) as event (event.id)}
								<EventCard {event} rsvpCount={rsvpCountsByAddress[event.address] || 0} />
							{/each}
						</div>
					{:else}
						<p class="text-sm font-medium text-primary-content">No upcoming events</p>
					{/if}
				</div>

				<div class="mt-6 border-t border-base-200 pt-4">
					<h2 class="text-xl font-bold">Recent activity</h2>
					<div class="mt-3">
						<KindSwitcher
							{selectedKinds}
							ariaLabel="Community content filters"
							on:select={selectKinds}
						/>
					</div>
				</div>
			</div>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="empty-content">
		<div class="px-6 py-16 text-center text-base font-semibold text-primary-content">
			{emptyTimedOut ? 'No community posts yet.' : 'Loading community posts...'}
		</div>
	</svelte:fragment>
</Feed>
