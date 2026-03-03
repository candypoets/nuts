<script lang="ts">
	import {
		type ConnectionStatus,
		Contact,
		Kind10002Parsed,
		Kind3Parsed,
		MessageType,
		ParsedData,
		type ParsedEvent,
		type RequestObject,
		WorkerMessage
	} from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import _, { uniqBy } from 'lodash';
	import {
		follows,
		kind0,
		mutes,
		kind10000,
		mutedPubkeys,
		toggleMutePubkey,
		defaultPipeline
	} from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import { now } from 'src/lib/period';
	import { proxyAvatarUrl, proxyBannerUrl } from 'src/lib/proxy';
	import Feed from 'src/routes/explore/feed.svelte';

	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind0,
		asKind1,
		asKind10002,
		asKind3,
		asParsedEvent,
		fbArray,
		isConnectionStatus,
		isKind1
	} from '@candypoets/nipworker/utils';

	import RelaysList from 'src/components/RelaysList.svelte';
	import { onDestroy, onMount } from 'svelte';
	import Avatar from '../explore/avatar.svelte';
	import { go } from '../modals/modal';
	import { userQuery } from '../queries/user';
	import { parseContent, type ContentBlock } from 'src/lib';
	import About from 'src/components/About.svelte';
	import { normalizeURL } from 'nostr-tools/utils';

	// Default relays as fallback
	const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://relay.snort.social', 'wss://nos.lol'];

	// Get pubkey from URL parameter
	export let pubkey: string;
	export let visible: boolean;
	export let goBack: () => void;

	let headerItem: ParsedEvent | undefined;
	let parsedAbout: ContentBlock[] | undefined;
	let writeRelays: string[] = [];
	let readRelays: string[] = [];
	let contacts: Contact[] = [];
	let timeout: NodeJS.Timeout | undefined;
	let mode = 'profile';

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	// Optimistic follow state
	let followIntent: boolean | null = null;
	let followPublishUnsub: (() => void) | undefined;
	let followPublishStatus: { [url: string]: ConnectionStatus } = {};

	let sub: (() => void) | undefined;
	let contactSub: (() => void) | undefined;
	let feedSub: (() => void) | undefined;

	// Feed items managed by parent
	let profileFeedItems: ParsedEvent[] = [];
	let followsFeedItems: ParsedEvent[] = [];
	let loading = false;

	// Track seen event IDs for O(1) duplicate detection
	let profileSeenIds = new Set<string>();
	let followsSeenIds = new Set<string>();

	// Pagination state
	let until: number | undefined = undefined;
	let hasMore = true;
	let itemsBeforePagination = 0;
	let paginationTimeout: ReturnType<typeof setTimeout> | undefined;
	let paginationCheckTimeout: ReturnType<typeof setTimeout> | undefined;

	$: feedItems = mode === 'profile' ? profileFeedItems : followsFeedItems;
	$: seenIds = mode === 'profile' ? profileSeenIds : followsSeenIds;

	function handleProfileEvents(message: WorkerMessage) {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl()?.toString();
			if (relayUrl) {
				const normalizedUrl = normalizeURL(relayUrl);
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
			}
			return;
		}

		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent) return;

		switch (parsedEvent.parsedType()) {
			case ParsedData.Kind0Parsed:
				const k0 = asKind0(parsedEvent);
				headerItem = parsedEvent;
				parseContent(k0?.about()?.toString() || '').then((result) => (parsedAbout = result));
				break;
			case ParsedData.Kind10002Parsed:
				writeRelays = fbArray(asKind10002(parsedEvent) as Kind10002Parsed, 'relays')
					?.filter((r) => r.write())
					.map((r) => r.url()?.toString())
					.filter(Boolean) as string[];
				readRelays = fbArray(asKind10002(parsedEvent) as Kind10002Parsed, 'relays')
					?.filter((r) => r.read())
					.map((r) => r.url()?.toString())
					.filter(Boolean) as string[];
				if (!contacts.length && writeRelays.length > 0) {
					contactSub = useSubscription(
						'c_' + pubkey,
						[{ kinds: [3], authors: [pubkey], limit: 30, relays: writeRelays }],
						handleProfileEvents,
						{}
					);
				}
				break;
			case ParsedData.Kind3Parsed:
				contacts = fbArray(asKind3(parsedEvent) as Kind3Parsed, 'contacts');
				break;
		}
	}

	function handleFeedEvents(message: WorkerMessage) {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl()?.toString();
			if (relayUrl) {
				const normalizedUrl = normalizeURL(relayUrl);
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
			}
			return;
		}

		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent) return;
		const kind1 = asKind1(parsedEvent);
		if (kind1) {
			// Add kind 1 events to appropriate feed based on mode
			const eventId = parsedEvent.id()?.toString();
			if (!eventId) return;

			// Check Set first for O(1) duplicate detection
			if (mode === 'profile') {
				if (profileSeenIds.has(eventId)) return;
				const reply = kind1.reply()?.id();
				const root = kind1.root()?.id();

				if (reply && !root) {
					return;
				}
				// If this is a reply, check if it's a direct reply to root
				if (reply && root) {
					// If reply ID != root ID, it's a reply to a reply (nested) - skip it
					if (reply.fnv1aHash() !== root.fnv1aHash()) {
						return;
					}
				}
				profileSeenIds.add(eventId);
				profileFeedItems = [...profileFeedItems, parsedEvent].sort(
					(a, b) => b.createdAt() - a.createdAt()
				);
			} else {
				if (followsSeenIds.has(eventId)) return;
				const reply = kind1.reply()?.id();
				const root = kind1.root()?.id();
				if (reply && !root) {
					return;
				}
				// If this is a reply, check if it's a direct reply to root
				if (reply && root) {
					// If reply ID != root ID, it's a reply to a reply (nested) - skip it
					if (reply.fnv1aHash() !== root.fnv1aHash()) {
						return;
					}
				}
				followsSeenIds.add(eventId);
				followsFeedItems = [...followsFeedItems, parsedEvent].sort(
					(a, b) => b.createdAt() - a.createdAt()
				);
			}
			loading = false;
		}
	}

	function subscribe() {
		if (visible && !sub) {
			sub = useSubscription('u_' + pubkey, userQuery(pubkey), handleProfileEvents, {});
		}
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		sub?.();
		sub = undefined;
		contactSub?.();
		contactSub = undefined;
		feedSub?.();
		feedSub = undefined;
	}

	onDestroy(() => {
		unsubscribe();
		if (paginationTimeout) clearTimeout(paginationTimeout);
		if (paginationCheckTimeout) clearTimeout(paginationCheckTimeout);
		followPublishUnsub?.();
	});

	function updateFollowList() {
		if (!$kind0) return;

		const currentState = followIntent ?? $follows.some((f) => f.pubkey === pubkey);
		const newFollowingState = !currentState;

		// Optimistically update UI immediately
		followIntent = newFollowingState;

		// Clean up any previous publish subscription and reset relay tracking
		followPublishUnsub?.();
		followPublishStatus = {};

		const template = {
			kind: 3,
			created_at: now(),
			tags: uniqBy(
				[
					...$follows.map((c) => ['p', c.pubkey, c.relay || '']),
					['p', pubkey, writeRelays?.[0] || '']
				],
				(c) => c[1]
			).filter((c) => (isFollowing ? c[1] !== pubkey : true)),
			content: ''
		};

		followPublishUnsub = usePublish('follow_' + pubkey, template, (message: WorkerMessage) => {
			const status = isConnectionStatus(message);
			console.log('status', status?.relayUrl()?.toString(), status?.status()?.toString());
			if (status) {
				const relayUrl = status.relayUrl()?.toString();
				if (relayUrl) {
					// Trigger reactivity by creating new object
					followPublishStatus = { ...followPublishStatus, [relayUrl]: status };
				}
			}
		});
	}

	function toggleMute() {
		if (!$kind0) return;

		const template = toggleMutePubkey($kind10000, pubkey);
		usePublish('mute_' + pubkey, template);
	}

	onMount(() => {
		subscribe();
		// console.log('onMount kind0');
		// set a time out after which we set the feedRequests whatever happen
		setTimeout(() => {
			if (feedItems.length === 0 && !loading) {
				loading = true;
			}
		}, 1000);
	});

	// Subscribe when visible becomes true (issue #1)
	$: if (visible && !sub) {
		subscribe();
	}

	// Derived follow states
	$: hasOkFromRelay = Object.values(followPublishStatus).some(
		(s) => s.status()?.toString() === 'true'
	);

	$: isFollowing = followIntent ?? $follows.some((f) => f.pubkey === pubkey);
	$: isFollowPending = followIntent !== null && !hasOkFromRelay;

	$: console.log('followIntent', followIntent);

	// Reset intent when store confirms the change
	$: if (followIntent !== null && $follows.some((f) => f.pubkey === pubkey) === followIntent) {
		followIntent = null;
		followPublishStatus = {};
	}

	// Timeout for relay discovery - fallback to default relays if Kind10002 not received
	let relayDiscoveryTimeout: ReturnType<typeof setTimeout> | undefined;
	$: if (writeRelays.length === 0 && !relayDiscoveryTimeout) {
		relayDiscoveryTimeout = setTimeout(() => {
			if (writeRelays.length === 0) {
				// Fallback to default relays
				writeRelays = DEFAULT_RELAYS;
				readRelays = DEFAULT_RELAYS;
			}
		}, 500);
	}

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		// Only require at least 1 item to use as cursor, not full $limit
		if (loading || !hasMore || feedItems.length === 0) return;

		loading = true;
		itemsBeforePagination = feedItems.length;

		// Use the createdAt of the last item as until
		const lastItem = feedItems[feedItems.length - 1];
		if (lastItem) {
			until = lastItem.createdAt() - 1;
		}

		const requests = buildPaginationRequests();
		if (requests.length > 0 && feedRequest) {
			const pageSubId = feedRequest.subId + '_page_' + until;
			feedSub = useSubscription(pageSubId, requests, handleFeedEvents, {
				pipeline: $defaultPipeline.for(pageSubId)
			});
			// Fallback: clear loading after timeout
			paginationTimeout = setTimeout(() => {
				loading = false;
			}, 10000);
		} else {
			loading = false;
			hasMore = false;
		}
	}

	function buildPaginationRequests() {
		if (mode === 'profile' && writeRelays.length > 0) {
			return [
				{
					kinds: [1, 30023],
					authors: [pubkey],
					limit: $limit,
					until,
					noContext: true,
					relays: writeRelays
				}
			];
		}

		if (mode === 'follows' && readRelays.length > 0 && contacts.length > 0) {
			return [
				{
					kinds: [1, 30023],
					authors: contacts.map((c) => c.pubkey()?.toString()).filter(Boolean) as string[],
					limit: $limit,
					until,
					noContext: true,
					relays: readRelays
				}
			];
		}

		return [];
	}

	// Track when pagination completes with delayed check for late events
	$: if (!loading && itemsBeforePagination > 0) {
		const itemsAtCheck = itemsBeforePagination;

		// Clear the timeout if it hasn't fired yet
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
			// Clean up pagination subscription after a delay
			setTimeout(() => {
				feedSub?.();
			}, 5000);
		}, 500); // Wait 500ms for late events to arrive
	}

	// Reactively compute feed request based on mode and dependencies
	// Include relay hash in subId so relay changes trigger re-subscription
	$: feedRequest = (() => {
		if (mode === 'profile' && writeRelays.length > 0) {
			const relayHash = writeRelays
				.map((r) => r.replace(/[^a-zA-Z0-9]/g, ''))
				.join('')
				.slice(0, 20);
			return {
				subId: 'kind0P_' + pubkey + '_' + relayHash,
				requests: [
					{
						kinds: [1, 30023],
						authors: [pubkey],
						limit: $limit,
						noContext: true,
						relays: writeRelays
					}
				]
			};
		}

		if (mode === 'follows' && readRelays.length > 0 && contacts.length > 0) {
			const relayHash = readRelays
				.map((r) => r.replace(/[^a-zA-Z0-9]/g, ''))
				.join('')
				.slice(0, 20);
			return {
				subId: 'kind0F_' + pubkey + '_' + relayHash,
				requests: [
					{
						kinds: [1, 30023],
						authors: contacts.map((c) => c.pubkey()?.toString()).filter(Boolean) as string[],
						limit: $limit,
						noContext: true,
						relays: readRelays
					}
				]
			};
		}

		return null;
	})();

	// Track when feedRequest becomes null to reset hadFeedRequest flag
	$: if (!feedRequest) {
		hadFeedRequest = false;
	}

	// Track last subscribed subId to avoid unnecessary re-subscriptions
	let lastSubId: string | undefined;
	let hadFeedRequest = false;

	// Subscribe/unsubscribe when feedRequest changes (but only if subId changes)
	// Also reset lastSubId when feedRequest becomes valid after being null (issue #4)
	$: if (feedRequest && feedRequest.subId !== lastSubId) {
		// Reset lastSubId if we transitioned from null to valid feedRequest
		if (!hadFeedRequest) {
			lastSubId = undefined;
			hadFeedRequest = true;
		}
		// Cleanup previous subscription
		feedSub?.();
		feedSub = undefined;
		lastSubId = feedRequest.subId;
		// Only clear feed items if we have no items yet (initial load)
		// Don't clear on every mode switch to avoid flickering
		if (mode === 'profile') {
			if (profileFeedItems.length === 0) {
				profileSeenIds.clear();
			}
		} else {
			if (followsFeedItems.length === 0) {
				followsSeenIds.clear();
			}
		}
		// Start new subscription
		loading = feedItems.length === 0;
		feedSub = useSubscription(feedRequest.subId, feedRequest.requests, handleFeedEvents, {
			pipeline: $defaultPipeline.for(feedRequest.subId)
		});
	}
</script>

<Feed
	items={feedItems}
	getItemId={(item) => item?.id?.()?.fnv1aHash?.() ?? Math.random()}
	{visible}
	{loading}
	onNearBottom={handleNearBottom}
>
	<svelte:fragment slot="sticky-header">
		<div class="px-4 py-3 flex items-center justify-between pt-safe">
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<!-- <h1 class="text-lg font-semibold">Profile</h1> -->
			<Avatar {pubkey} size="lg" />
			<span class="w-8" />
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		<!-- {#if item.id != headerItem.id} -->
		{@const p = asKind0(headerItem)}
		{@const banner = p?.banner()?.toString()}
		{@const name = p?.name()?.toString()}
		{@const nip05 = p?.nip05()?.toString()}
		{@const picture = p?.picture()?.toString()}
		{@const about = p?.about()?.toString()}
		{@const lnaddress = p?.lud16()?.toString() || p?.lud06()?.toString()}
		<div
			class="transition-all duration-300 w-feed mx-auto will-change-transform bg-base-300 bg-opacity-85 rounded-lg"
			class:relative={visible}
			class:shadow-md={!visible}
			class:z-20={!visible}
			class:top-0={!visible}
			class:left-0={!visible}
			class:right-0={!visible}
		>
			<!-- Banner image (only shown when header is visible) -->
			{#if banner}
				<div class="w-full banner-container rounded-lg">
					<!-- Banner image -->

					<div
						class="absolute w-full h-52 bg-cover bg-center top-0 left-0 right-0"
						style="background-image: url('{banner ? proxyBannerUrl(banner) : ''}');"
					>
						<div class="w-feed h-16 flex items-center justify-between shadow-sm pt-safe">
							<button on:click={goBack} class="p-1 z-10 btn btn-sm btn-circle ml-4">
								<Icon icon="mdi:arrow-left" class="text-xl" />
							</button>
						</div>
					</div>

					<!-- Gradient overlay that fades out the banner towards the bottom -->
					<div class="absolute top-0 left-0 right-0 bottom-0 banner-fade-overlay"></div>

					<!-- Placeholder to maintain height -->
					<div class="h-52 w-full"></div>
				</div>
			{:else}
				<div
					class="w-feed border-b border-base-200 h-52 flex items-start justify-between shadow-sm pt-safe"
				>
					<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 ml-4 mt-4">
						<Icon icon="mdi:arrow-left" class="text-xl" />
					</button>
					<!-- <h1 class="text-lg font-semibold">Profile</h1> -->
					<span class="w-10" />
				</div>
			{/if}
			<!-- Content adjusts size/layout based on visible state -->
			<div class="px-4 my-6">
				<div class="flex items-center gap-3 mb-4">
					<div class="absolute right-4 top-20 flex gap-2">
						<div class="relative">
							<button
								class="z-10 btn btn-sm btn-circle border border-white bg-opacity-80 disabled:opacity-100"
								on:click={updateFollowList}
								title={isFollowing ? 'Unfollow' : 'Follow'}
								disabled={isFollowPending}
							>
								{#if isFollowing}
									<Icon icon="mdi:account-check" class="text-lg" />
								{:else}
									<Icon icon="mdi:account-plus" class="text-lg" />
								{/if}
							</button>
							{#if isFollowPending}
								<div
									class="absolute inset-0 -m-1 rounded-full border-2 border-primary border-t-transparent animate-spin pointer-events-none"
								></div>
							{/if}
						</div>

						<button
							class="z-10 btn btn-sm btn-circle border border-white bg-opacity-80"
							on:click={() => go('ecash:' + pubkey)}
							title="Zap"
						>
							<Icon icon="ion:flash" class="text-lg" />
						</button>

						<button
							class="z-10 btn btn-sm btn-circle border border-white bg-opacity-80"
							on:click={toggleMute}
							title={$mutedPubkeys.includes(pubkey) ? 'Unmute' : 'Mute'}
						>
							{#if $mutedPubkeys.includes(pubkey)}
								<Icon icon="mdi:volume-high" class="text-lg" />
							{:else}
								<Icon icon="mdi:volume-off" class="text-lg" />
							{/if}
						</button>
					</div>
					<img
						src={picture ? proxyAvatarUrl(picture) : '/miss-profile.png'}
						alt={name || 'Profile'}
						class="w-32 h-32 -mt-60 rounded-full border absolute object-cover"
					/>
					<div>
						<h2 class="text-xl font-bold">{name || 'Unnamed'}</h2>
						<!-- {#if visible} -->
						<p class="text-primary flex items-center gap-1">
							<Icon icon="mdi:link" />{nip05 || pubkey.substring(0, 8)}
						</p>
						<!-- {/if} -->
						{#if lnaddress}
							<p class="text-primary flex items-center gap-1">
								<Icon icon="ion:flash" />{lnaddress}
							</p>
						{/if}
					</div>
				</div>

				{#if about}
					<p class="mb-4 opacity-1"><About content={parsedAbout || []} /></p>
				{/if}
				<RelaysList
					relays={(mode == 'profile' ? writeRelays : readRelays).map(normalizeURL)}
					{connectionStatus}
				/>
			</div>

			<div class="tabs">
				<a
					class="tab"
					class:border-t={mode == 'profile'}
					class:border-primary-content={mode == 'profile'}
					on:click={(_) => (mode = 'profile')}>Posts</a
				>
				<a
					class="tab"
					class:tab-disabled={!contacts.length}
					class:border-t={mode == 'follows'}
					class:border-primary-content={mode == 'follows'}
					on:click={(_) => (mode = 'follows')}>Feed</a
				>
			</div>
			<!-- <h3 class="text-lg font-medium mb-4 px-4">Posts</h3> -->
		</div>
		<!-- {/if} -->
	</svelte:fragment>
</Feed>

<style>
	.banner-container {
		position: relative;
		overflow: hidden;
	}

	.banner-content {
		position: relative;
		/* z-index: 0; */
		margin-top: -20px; /* Pull content slightly up into the faded part of banner */
	}
</style>
