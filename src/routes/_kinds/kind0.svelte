<script lang="ts">
	import {
		type ConnectionStatus,
		Contact,
		Kind10002Parsed,
		Kind3Parsed,
		ParsedData,
		type ParsedEvent,
		WorkerMessage
	} from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import Loader from 'src/components/Loader.svelte';
	import { ALL_FEED_KINDS, type FeedKind } from 'src/controller/feed';
	import {
		defaultPipeline,
		follows,
		kind3,
		kind0,
		kind10000,
		mutedPubkeys,
		writeRelays as userWriteRelays
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
		asKind6,
		asKind20,
		asParsedEvent,
		createTimeWindowPager,
		fbArray,
		isConnectionStatus,
		isKind0,
		type TimeWindowPager
	} from '@candypoets/nipworker/utils';

	import { isEqual } from 'lodash';
	import { normalizeURL } from 'nostr-tools/utils';
	import About from 'src/components/About.svelte';
	import KindSwitcher from 'src/components/KindSwitcher.svelte';
	import {
		parsedEventTags,
		relayRoleFromSet,
		relaySetAddressesFromRelayFeedEvent,
		relayUrlsFromRelaySet
	} from 'src/lib/adminRelays';
	import { INDEXER_RELAYS } from 'src/lib/env';
	import { fetchRelayInfo, relayInfos, relaySub, setSubRelays } from 'src/controller/relay';
	import { type ContentBlock, parseContent } from 'src/lib';
	import { onDestroy, onMount } from 'svelte';
	import Avatar from '../explore/avatar.svelte';
	import { go, usePagerNavigation } from '../modals/modal';
	import { userQuery } from '../queries/user';
	import { communityDirectoryQuery, communityRoleSetsQuery } from '../queries/communities';

	// Default relays as fallback
	const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://relay.snort.social', 'wss://nos.lol'];
	const FEED_PAGE_WINDOW_SECONDS = 30 * 24 * 60 * 60;

	// Get pubkey from URL parameter
	export let pubkey: string;
	export let visible: boolean;
	export let goBack: () => void;
	const nav = usePagerNavigation();

	function openPath(eventPath: string) {
		nav ? nav.push(eventPath) : go(eventPath);
	}

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

	// Optimistic mute state
	let muteIntent: boolean | null = null;
	let mutePublishUnsub: (() => void) | undefined;
	let mutePublishStatus: { [url: string]: ConnectionStatus } = {};

	let sub: (() => void) | undefined;
	let contactSub: (() => void) | undefined;
	let feedSub: (() => void) | undefined;
	let paginationSub: (() => void) | undefined;

	// Relay swapping
	let relaySubUnsubscribe: (() => void) | undefined;
	let currentRelaySubId: string | undefined;
	let relayCounter = 0;

	// Feed items managed by parent
	let profileFeedItems: ParsedEvent[] = [];
	let followsFeedItems: ParsedEvent[] = [];
	let loading = false;
	let communityMode: ProfileCommunity['relationship'] = 'belong';
	let selectedKinds: FeedKind[] = [];
	let communityInfoFetchKey = '';
	let communityPreviewKey = '';
	let communityPreviewUnsubs: (() => void)[] = [];
	let communityPreviews: Record<string, CommunityPreviewProfile[]> = {};
	let communityDirectory: ParsedEvent | undefined;
	let communityRoleSets: ParsedEvent[] = [];
	let communityDirectorySub: (() => void) | undefined;
	let communityRoleSetsSub: (() => void) | undefined;
	let expectedCommunityRoleSetAddresses = new Set<string>();

	// Track seen event IDs for O(1) duplicate detection
	let profileSeenIds = new Set<string>();
	let followsSeenIds = new Set<string>();

	// Pagination state
	let feedPager: TimeWindowPager | undefined;
	let paginationStarted = false;
	let hasMore = true;
	let pageInFlight = false;
	let pageOldestCreatedAt: number | undefined;
	let pageExpectedRelays = new Set<string>();
	let pageEoseRelays = new Set<string>();
	let paginationTimeout: ReturnType<typeof setTimeout> | undefined;
	let paginationDrainTimeout: ReturnType<typeof setTimeout> | undefined;
	let feedLoadingTimeout: ReturnType<typeof setTimeout> | undefined;

	$: feedItems = mode === 'profile' ? profileFeedItems : followsFeedItems;
	$: requestKinds = selectedKinds.length ? selectedKinds : (ALL_FEED_KINDS as FeedKind[]);
	$: selectedKindKey = requestKinds.join('-');

	type ProfileCommunity = {
		key: string;
		name: string;
		relationship: 'belong' | 'follow';
		url: string;
	};

	type CommunityPreviewProfile = {
		pubkey: string;
		name: string;
		picture: string | null;
	};

	const communityNames: Record<string, string> = {
		'wss://relay.nuts.cash': 'Nuts',
		'wss://relay.damus.io': 'Damus',
		'wss://nos.lol': 'Nos',
		'wss://relay.thibautduchene.fr': 'Thibaut',
		'wss://purplepag.es': 'Purple Pages',
		'wss://user.kindpag.es': 'Kind Pages'
	};

	const communityColorClasses = [
		'bg-primary',
		'bg-secondary',
		'bg-accent',
		'bg-info',
		'bg-warning',
		'bg-success'
	];

	function relayHash(relays: string[]) {
		return relays
			.map((r) => r.replace(/[^a-zA-Z0-9]/g, ''))
			.join('')
			.slice(0, 20);
	}

	function relayLabel(relay: string) {
		try {
			return new URL(relay.replace(/^wss?:\/\//, 'https://')).host.replace(/^relay\./, '');
		} catch {
			return relay.replace(/^wss?:\/\//, '').replace(/\/$/, '') || 'Community';
		}
	}

	function initials(name: string): string {
		const words = name
			.replace(/[^a-zA-Z0-9\s]/g, ' ')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!words.length) return '?';
		if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
		return `${words[0][0]}${words[1][0]}`.toUpperCase();
	}

	function communityColorClass(key: string): string {
		let hash = 0;
		for (let index = 0; index < key.length; index += 1) {
			hash = (hash * 31 + key.charCodeAt(index)) % communityColorClasses.length;
		}
		return communityColorClasses[hash];
	}

	function communityList(roleSets: ParsedEvent[]): ProfileCommunity[] {
		const communities = new Map<string, ProfileCommunity>();

		for (const roleSet of roleSets) {
			const role = relayRoleFromSet(roleSet);
			if (!role || role === 'purchase') continue;
			const relationship = role === 'following' ? 'follow' : 'belong';

			for (const relay of relayUrlsFromRelaySet(roleSet)) {
				const key = normalizeURL(relay);
				const existing = communities.get(key);
				if (existing?.relationship === 'belong' && relationship === 'follow') continue;
				communities.set(key, {
					key,
					name: communityNames[key] || relayLabel(key),
					relationship,
					url: key
				});
			}
		}

		return Array.from(communities.values());
	}

	function communityRoleSetAddress(event: ParsedEvent): string | undefined {
		const d = parsedEventTags(event).find((tag) => tag[0] === 'd')?.[1];
		return d ? `30002:${event.pubkey()}:${d}` : undefined;
	}

	function subscribeCommunityRoleSets(addresses: string[]) {
		communityRoleSetsSub?.();
		communityRoleSetsSub = undefined;
		communityRoleSets = [];
		expectedCommunityRoleSetAddresses = new Set(addresses);
		if (!addresses.length) return;

		communityRoleSetsSub = useSubscription(
			'community_role_sets_' + pubkey,
			communityRoleSetsQuery(addresses, INDEXER_RELAYS),
			handleCommunityRoleSet,
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	function handleCommunityDirectory(message: WorkerMessage) {
		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent || parsedEvent.kind() !== 10012 || parsedEvent.pubkey() !== pubkey) return;
		if (communityDirectory && parsedEvent.createdAt() <= communityDirectory.createdAt()) return;

		communityDirectory = parsedEvent;
		subscribeCommunityRoleSets(relaySetAddressesFromRelayFeedEvent(parsedEvent));
	}

	function handleCommunityRoleSet(message: WorkerMessage) {
		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent || parsedEvent.kind() !== 30002) return;
		const address = communityRoleSetAddress(parsedEvent);
		if (!address || !expectedCommunityRoleSetAddresses.has(address)) return;

		const existing = communityRoleSets.find(
			(candidate) => communityRoleSetAddress(candidate) === address
		);
		if (existing && parsedEvent.createdAt() <= existing.createdAt()) return;
		communityRoleSets = [
			...communityRoleSets.filter((candidate) => communityRoleSetAddress(candidate) !== address),
			parsedEvent
		];
	}

	function selectProfileKindTab(event: CustomEvent<{ kinds: FeedKind[] }>) {
		selectedKinds = event.detail.kinds;
		profileFeedItems = [];
		followsFeedItems = [];
		profileSeenIds.clear();
		followsSeenIds.clear();
		hasMore = true;
		feedPager = undefined;
		paginationStarted = false;
		lastSubId = undefined;
		hadFeedRequest = false;
	}

	function contributionsLast24h(events: ParsedEvent[]) {
		const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
		return events.filter((event) => event.createdAt() >= since).length;
	}

	function eventRelayUrls(event: ParsedEvent) {
		if (typeof event.relaysLength !== 'function') return [];
		return Array.from({ length: event.relaysLength() }, (_, index) => event.relays(index))
			.filter((relay): relay is string => Boolean(relay))
			.map(normalizeURL);
	}

	function cleanupCommunityPreviews() {
		communityPreviewUnsubs.forEach((unsubscribe) => unsubscribe());
		communityPreviewUnsubs = [];
	}

	function subscribeCommunityPreviews(communitiesToPreview: ProfileCommunity[]) {
		cleanupCommunityPreviews();
		communityPreviews = {};

		communityPreviewUnsubs = communitiesToPreview.map((community) => {
			const seen = new Set<string>();
			const profiles: CommunityPreviewProfile[] = [];

			return useSubscription(
				'community_kind0_' + relayHash([community.key]),
				[{ kinds: [0], limit: 5, relays: [community.url] }],
				(message) => {
					const kind0 = isKind0(message);
					const parsedEvent = asParsedEvent(message);
					const profilePubkey = kind0?.pubkey();
					if (!kind0 || !profilePubkey || seen.has(profilePubkey)) return;
					const eventRelays = parsedEvent ? eventRelayUrls(parsedEvent) : [];
					if (eventRelays.length && !eventRelays.includes(community.key)) return;

					seen.add(profilePubkey);
					profiles.push({
						pubkey: profilePubkey,
						name: kind0.name()?.trim() || kind0.displayName()?.trim() || profilePubkey.slice(0, 8),
						picture: kind0.picture() || null
					});
					communityPreviews = { ...communityPreviews, [community.key]: [...profiles] };
				},
				{ closeOnEose: true }
			);
		});
	}

	function openCommunitySwitcher() {
		const relays = communities.map((community) => community.url);
		if (!relays.length) return;
		setSubRelays(baseSubId, relays);
		openPath(`relayinfos:${baseSubId}`);
	}

	function openCommunity(community: ProfileCommunity) {
		openPath(`community:${encodeURIComponent(community.url)}`);
	}

	function handleProfileEvents(message: WorkerMessage) {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
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
				parseContent(k0?.about() || '').then((result) => (parsedAbout = result));
				break;
			case ParsedData.Kind10002Parsed:
				writeRelays = fbArray(asKind10002(parsedEvent) as Kind10002Parsed, 'relays')
					?.filter((r) => r.write())
					.map((r) => r.url())
					.filter(Boolean) as string[];
				readRelays = fbArray(asKind10002(parsedEvent) as Kind10002Parsed, 'relays')
					?.filter((r) => r.read())
					.map((r) => r.url())
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

	function processFeedMessage(message: WorkerMessage): ParsedEvent | undefined {
		// Handle connection status
		const status = asConnectionStatus(message);
		if (status) {
			const relayUrl = status.relayUrl();
			if (relayUrl) {
				const normalizedUrl = normalizeURL(relayUrl);
				connectionStatus = { ...connectionStatus, [normalizedUrl]: status };
			}
			return undefined;
		}

		const parsedEvent = asParsedEvent(message);
		if (!parsedEvent) return undefined;

		if (!shouldIncludeFeedEvent(parsedEvent)) return undefined;

		const eventId = parsedEvent.id();
		if (!eventId) return undefined;

		if (mode === 'profile') {
			if (profileSeenIds.has(eventId)) return undefined;
			profileSeenIds.add(eventId);
			profileFeedItems = [...profileFeedItems, parsedEvent].sort(
				(a, b) => b.createdAt() - a.createdAt()
			);
		} else {
			if (followsSeenIds.has(eventId)) return undefined;
			followsSeenIds.add(eventId);
			followsFeedItems = [...followsFeedItems, parsedEvent].sort(
				(a, b) => b.createdAt() - a.createdAt()
			);
		}
		if (feedLoadingTimeout) {
			clearTimeout(feedLoadingTimeout);
			feedLoadingTimeout = undefined;
		}
		return parsedEvent;
	}

	function handleFeedEvents(message: WorkerMessage) {
		if (processFeedMessage(message) && !paginationSub) loading = false;
	}

	function handlePaginationEvents(message: WorkerMessage) {
		const status = asConnectionStatus(message);
		const parsedEvent = processFeedMessage(message);
		if (parsedEvent) {
			pageOldestCreatedAt = Math.min(
				pageOldestCreatedAt ?? parsedEvent.createdAt(),
				parsedEvent.createdAt()
			);
		}

		const relayUrl = status?.relayUrl();
		if (status?.status() === 'EOSE' && relayUrl) {
			pageEoseRelays.add(normalizeURL(relayUrl));
			if (Array.from(pageExpectedRelays).every((relay) => pageEoseRelays.has(relay))) {
				if (!paginationDrainTimeout) {
					paginationDrainTimeout = setTimeout(() => {
						paginationDrainTimeout = undefined;
						settlePagination();
					}, 500);
				}
			}
		}
	}

	function shouldIncludeFeedEvent(parsedEvent: ParsedEvent): boolean {
		const kind = parsedEvent.kind();

		if (!requestKinds.includes(kind as FeedKind)) return false;

		if (kind === 1 || kind === 6) {
			const kind1 = asKind1(parsedEvent);
			if (kind1) {
				const reply = kind1.reply()?.id();
				const root = kind1.root()?.id();

				if (reply && !root) return false;
				if (reply && root && reply !== root) return false;
			}

			if (kind === 6) {
				const kind6 = asKind6(parsedEvent);
				if (!kind6?.repostedEvent()) return false;
			}
		} else if (kind === 20) {
			const kind20 = asKind20(parsedEvent);
			if (kind20 && fbArray(kind20, 'images').some((img) => !img.dim())) return false;
		}

		return true;
	}

	function subscribe() {
		if (visible && !sub) {
			sub = useSubscription('u_' + pubkey, userQuery(pubkey), handleProfileEvents, {});
			communityDirectorySub = useSubscription(
				'community_directory_' + pubkey,
				communityDirectoryQuery(pubkey, INDEXER_RELAYS),
				handleCommunityDirectory,
				{ bytesPerEvent: 10 * 1024 }
			);
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
		paginationSub?.();
		paginationSub = undefined;
		communityDirectorySub?.();
		communityDirectorySub = undefined;
		communityRoleSetsSub?.();
		communityRoleSetsSub = undefined;
		communityDirectory = undefined;
		communityRoleSets = [];
		expectedCommunityRoleSetAddresses = new Set();
	}

	function contactTagForProfile() {
		const relayHint = writeRelays?.[0];
		return relayHint ? ['p', pubkey, relayHint] : ['p', pubkey];
	}

	function buildFollowTemplate(shouldFollow: boolean) {
		const existingTags = $kind3 ? parsedEventTags($kind3) : [];
		const withoutTarget = existingTags.filter((tag) => tag[0] !== 'p' || tag[1] !== pubkey);
		const tags = shouldFollow ? [...withoutTarget, contactTagForProfile()] : withoutTarget;

		return {
			kind: 3,
			created_at: now(),
			tags,
			content: ''
		};
	}

	function buildMuteTemplate(shouldMute: boolean) {
		const existingTags = $kind10000 ? parsedEventTags($kind10000) : [];
		const withoutTarget = existingTags.filter((tag) => tag[0] !== 'p' || tag[1] !== pubkey);
		const tags = shouldMute ? [...withoutTarget, ['p', pubkey]] : withoutTarget;
		const muted = new Set($mutedPubkeys.filter((mutedPubkey) => mutedPubkey !== pubkey));
		if (shouldMute) muted.add(pubkey);

		return {
			kind: 10000,
			created_at: now(),
			tags,
			content: JSON.stringify(Array.from(muted))
		};
	}

	function publishTargets() {
		const relays = $userWriteRelays.length ? $userWriteRelays : DEFAULT_RELAYS;
		return Array.from(new Set([...relays, ...INDEXER_RELAYS]));
	}

	onDestroy(() => {
		unsubscribe();
		if (paginationTimeout) clearTimeout(paginationTimeout);
		if (paginationDrainTimeout) clearTimeout(paginationDrainTimeout);
		if (feedLoadingTimeout) clearTimeout(feedLoadingTimeout);
		followPublishUnsub?.();
		relaySubUnsubscribe?.();
		mutePublishUnsub?.();
		mutePublishUnsub?.();
		cleanupCommunityPreviews();
	});

	function updateFollowList() {
		if (!$kind0) return;
		if (!$kind3 && !$follows.length) return;

		const currentState = followIntent ?? $follows.some((f) => f.pubkey === pubkey);
		const newFollowingState = !currentState;

		// Optimistically update UI immediately
		followIntent = newFollowingState;

		// Clean up any previous publish subscription and reset relay tracking
		followPublishUnsub?.();
		followPublishStatus = {};

		const template = buildFollowTemplate(newFollowingState);

		followPublishUnsub = usePublish(
			'follow_' + pubkey,
			template,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				console.log('status', status?.relayUrl(), status?.status());
				if (status) {
					const relayUrl = status.relayUrl();
					if (relayUrl) {
						// Trigger reactivity by creating new object
						followPublishStatus = { ...followPublishStatus, [relayUrl]: status };
					}
				}
			},
			{ defaultRelays: publishTargets(), trackStatus: true }
		);
	}

	function toggleMute() {
		if (!$kind0) return;

		const currentState = muteIntent ?? $mutedPubkeys.includes(pubkey);
		const newMuteState = !currentState;

		// Optimistically update UI immediately
		muteIntent = newMuteState;

		// Clean up any previous publish subscription and reset relay tracking
		mutePublishUnsub?.();
		mutePublishStatus = {};

		const template = buildMuteTemplate(newMuteState);
		mutePublishUnsub = usePublish(
			'mute_' + pubkey,
			template,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl();
					if (relayUrl) {
						mutePublishStatus = { ...mutePublishStatus, [relayUrl]: status };
					}
				}
			},
			{ defaultRelays: publishTargets(), trackStatus: true }
		);
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
	$: hasOkFromRelay = Object.values(followPublishStatus).some((s) => s.status() === 'true');

	$: isFollowing = followIntent ?? $follows.some((f) => f.pubkey === pubkey);
	$: isFollowPending = followIntent !== null && !hasOkFromRelay;

	$: isMuted = muteIntent ?? $mutedPubkeys.includes(pubkey);
	$: isMutePending = muteIntent !== null && !hasMuteOkFromRelay;
	$: hasMuteOkFromRelay = Object.values(mutePublishStatus).some((s) => s.status() === 'true');
	$: communities = communityList(communityRoleSets);
	$: belongCommunities = communities.filter((community) => community.relationship === 'belong');
	$: followCommunities = communities.filter((community) => community.relationship === 'follow');
	$: visibleCommunities = communities.filter(
		(community) => community.relationship === communityMode
	);
	$: contributionCount = contributionsLast24h(profileFeedItems);

	$: if (communityMode === 'belong' && !belongCommunities.length && followCommunities.length) {
		communityMode = 'follow';
	}
	$: if (communityMode === 'follow' && !followCommunities.length && belongCommunities.length) {
		communityMode = 'belong';
	}
	$: if (communities.length) {
		const key = communities.map((community) => community.key).join('\n');
		if (communityInfoFetchKey !== key) {
			communityInfoFetchKey = key;
			communities.forEach((community) => void fetchRelayInfo(community.url));
		}
	}
	$: if (communities.length) {
		const key = communities
			.map((community) => `${community.relationship}:${community.key}`)
			.join('\n');
		if (communityPreviewKey !== key) {
			communityPreviewKey = key;
			subscribeCommunityPreviews(communities);
		}
	} else if (communityPreviewKey) {
		communityPreviewKey = '';
		cleanupCommunityPreviews();
		communityPreviews = {};
	}

	// Reset intent when store confirms the change
	$: if (followIntent !== null && $follows.some((f) => f.pubkey === pubkey) === followIntent) {
		followIntent = null;
		followPublishStatus = {};
	}

	$: if (muteIntent !== null && $mutedPubkeys.includes(pubkey) === muteIntent) {
		muteIntent = null;
		mutePublishStatus = {};
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
	function handleNearBottom(_event: { distance: number }) {
		const pager = feedPager;
		if (loading || !hasMore || feedItems.length === 0 || !pager) return;

		loading = true;

		if (!paginationStarted) {
			const windowFloor = pager.anchor - pager.windowSeconds;
			for (let index = feedItems.length - 1; index >= 0; index--) {
				const createdAt = feedItems[index]?.createdAt();
				if (createdAt !== undefined && createdAt >= windowFloor && createdAt < pager.anchor) {
					pager.reset(createdAt);
					break;
				}
			}
			paginationStarted = true;
		}
		startNextPage();
	}

	function startNextPage() {
		const pager = feedPager;
		if (!pager) {
			loading = false;
			hasMore = false;
			return;
		}
		const page = pager.next();
		if (!page) {
			loading = false;
			hasMore = false;
			return;
		}

		paginationSub?.();
		paginationSub = undefined;
		pageInFlight = true;
		pageOldestCreatedAt = undefined;
		pageEoseRelays = new Set<string>();
		pageExpectedRelays = new Set(
			page.requests.flatMap((request) => request.relays.map(normalizeURL))
		);
		paginationSub = useSubscription(page.subId, page.requests, handlePaginationEvents, {
			pipeline: $defaultPipeline.for(page.subId),
			...page.options
		});
		paginationTimeout = setTimeout(settlePagination, 10000);
	}

	function settlePagination() {
		if (!pageInFlight) return;
		pageInFlight = false;
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}
		if (paginationDrainTimeout) {
			clearTimeout(paginationDrainTimeout);
			paginationDrainTimeout = undefined;
		}
		paginationSub?.();
		paginationSub = undefined;

		const completion = feedPager?.complete(pageOldestCreatedAt);
		pageOldestCreatedAt = undefined;
		pageExpectedRelays = new Set<string>();
		pageEoseRelays = new Set<string>();
		hasMore = completion?.hasMore ?? false;
		if (completion?.shouldRetry) {
			startNextPage();
			return;
		}
		loading = false;
	}

	// Base subId for relay swapping (without relay hash)
	$: baseSubId = mode === 'profile' ? 'kind0P_' + pubkey : 'kind0F_' + pubkey;

	// Handle relay changes from relay swapping modal
	function handleSubRelays(subRelays: string[] | undefined) {
		if (!subRelays || subRelays.length === 0) return;

		const currentRelays = mode === 'profile' ? writeRelays : readRelays;
		if (!isEqual(currentRelays, subRelays)) {
			if (mode === 'profile') {
				writeRelays = subRelays;
			} else {
				readRelays = subRelays;
			}
			// Trigger re-subscription by incrementing counter and clearing lastSubId
			relayCounter++;
			lastSubId = undefined;
			// Clear feed items to show fresh data
			if (mode === 'profile') {
				profileFeedItems = [];
				profileSeenIds.clear();
			} else {
				followsFeedItems = [];
				followsSeenIds.clear();
			}
			connectionStatus = {};
		}
	}

	// Subscribe to relay changes for this feed
	$: if (baseSubId && baseSubId !== currentRelaySubId) {
		relaySubUnsubscribe?.();
		currentRelaySubId = baseSubId;
		relaySubUnsubscribe = relaySub(baseSubId).subscribe((subRelays) => {
			handleSubRelays(subRelays);
		});
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
				subId: 'kind0P_' + pubkey + '_' + relayHash + '_' + selectedKindKey,
				requests: [
					{
						kinds: requestKinds,
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
				subId: 'kind0F_' + pubkey + '_' + relayHash + '_' + selectedKindKey,
				requests: [
					{
						kinds: requestKinds,
						authors: contacts.map((c) => c.pubkey()).filter(Boolean) as string[],
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
		feedPager = undefined;
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
		paginationSub?.();
		paginationSub = undefined;
		pageInFlight = false;
		pageOldestCreatedAt = undefined;
		pageExpectedRelays = new Set<string>();
		pageEoseRelays = new Set<string>();
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}
		if (paginationDrainTimeout) {
			clearTimeout(paginationDrainTimeout);
			paginationDrainTimeout = undefined;
		}
		if (feedLoadingTimeout) {
			clearTimeout(feedLoadingTimeout);
			feedLoadingTimeout = undefined;
		}
		lastSubId = feedRequest.subId;
		feedPager = createTimeWindowPager({
			subId: feedRequest.subId,
			requests: feedRequest.requests,
			windowSeconds: FEED_PAGE_WINDOW_SECONDS,
			maxEmptyPages: 3,
			emptyWindowGrowthFactor: 2
		});
		paginationStarted = false;
		hasMore = true;
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
		feedLoadingTimeout = setTimeout(() => {
			if (loading && feedItems.length === 0) {
				loading = false;
			}
			feedLoadingTimeout = undefined;
		}, 3000);
		// Set relays for this subId so relay swapping modal can access them
		const currentRelays = mode === 'profile' ? writeRelays : readRelays;
		if (currentRelays.length > 0) {
			setSubRelays(baseSubId, currentRelays);
		}
	}
</script>

<Feed
	items={feedItems}
	getItemId={(item) => item?.id?.() ?? Math.random()}
	{visible}
	{loading}
	onNearBottom={handleNearBottom}
>
	<svelte:fragment slot="sticky-header">
		<div class="px-4 py-3 flex items-center justify-between pt-safe bg-base-100 bg-opacity-90">
			<button on:click={goBack} class="p-1 rounded-full hover:bg-base-200 mr-4">
				<Icon icon="mdi:arrow-left" class="text-xl" />
			</button>
			<!-- <h1 class="text-lg font-semibold">Profile</h1> -->
			<Avatar {pubkey} size="lg" />
			<span class="w-8"></span>
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header">
		<!-- {#if item.id != headerItem.id} -->
		{@const p = headerItem ? asKind0(headerItem) : undefined}
		{@const banner = p?.banner()}
		{@const name = p?.name()}
		{@const nip05 = p?.nip05()}
		{@const picture = p?.picture()}
		{@const about = p?.about()}
		{@const lnaddress = p?.lud16() || p?.lud06()}
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
					<span class="w-10"></span>
				</div>
			{/if}
			<!-- Content adjusts size/layout based on visible state -->
			<div class="px-4 my-6">
				<div class="flex items-center gap-3 mb-4">
					<div class="absolute left-36 top-48 flex gap-2 items-end">
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
								<div class="absolute inset-0 -m-1 pointer-events-none">
									<Loader size="sm" />
								</div>
							{/if}
						</div>

						<button
							class="z-10 btn btn-sm btn-circle border border-white bg-opacity-80"
							on:click={() => openPath('ecash:' + pubkey)}
							title="Zap"
						>
							<Icon icon="ion:flash" class="text-lg" />
						</button>

						<div class="relative">
							<button
								class="z-10 btn btn-sm btn-circle border border-white bg-opacity-80 disabled:opacity-100"
								on:click={toggleMute}
								title={isMuted ? 'Unmute' : 'Mute'}
								disabled={isMutePending}
							>
								{#if isMuted}
									<Icon icon="mdi:volume-high" class="text-lg" />
								{:else}
									<Icon icon="mdi:volume-off" class="text-lg" />
								{/if}
							</button>
							{#if isMutePending}
								<div class="absolute inset-0 -m-1 pointer-events-none">
									<Loader size="sm" />
								</div>
							{/if}
						</div>
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

				{#if communities.length}
					<section class="mt-5">
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0">
								<h3 class="text-xl font-bold">Communities</h3>
								<p class="mt-1 text-sm text-base-content/70">Your spaces. Your people.</p>
							</div>
							<button
								type="button"
								class="btn btn-ghost btn-sm shrink-0 gap-1 text-primary"
								on:click|stopPropagation={openCommunitySwitcher}
							>
								<span>See all ({communities.length})</span>
								<Icon icon="mingcute:right-line" class="text-lg" />
							</button>
						</div>

						<div
							class="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-base-200 bg-base-300"
						>
							<div class="border-r border-base-200 px-3 py-3">
								<Icon icon="mdi:account-group" class="text-lg text-base-content/60" />
								<p class="text-lg font-bold">{communities.length}</p>
								<p class="text-[11px] font-semibold uppercase text-base-content/60">Communities</p>
							</div>
							<div class="border-r border-base-200 px-3 py-3">
								<Icon icon="mdi:shield-check" class="text-lg text-base-content/60" />
								<p class="text-lg font-bold">{belongCommunities.length}</p>
								<p class="text-[11px] font-semibold uppercase text-base-content/60">Roles</p>
							</div>
							<div class="px-3 py-3">
								<Icon icon="mdi:message-text" class="text-lg text-base-content/60" />
								<p class="text-lg font-bold">{contributionCount}</p>
								<p class="text-[11px] font-semibold uppercase text-base-content/60">24h posts</p>
							</div>
						</div>

						<div class="tabs tabs-boxed mt-4 bg-base-200">
							<button
								type="button"
								class="tab flex-1 {!belongCommunities.length ? '!text-base-content/50' : ''}"
								class:tab-active={communityMode === 'belong'}
								class:tab-disabled={!belongCommunities.length}
								on:click={() => (communityMode = 'belong')}
							>
								Belongs to ({belongCommunities.length})
							</button>
							<button
								type="button"
								class="tab flex-1 {!followCommunities.length ? '!text-base-content/50' : ''}"
								class:tab-active={communityMode === 'follow'}
								class:tab-disabled={!followCommunities.length}
								on:click={() => (communityMode = 'follow')}
							>
								Following ({followCommunities.length})
							</button>
						</div>

						<div class="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
							{#each visibleCommunities as community (`${community.relationship}-${community.key}`)}
								{@const info = $relayInfos.get(community.key)}
								{@const communityName = info?.name?.trim() || community.name}
								{@const profiles = communityPreviews[community.key] || []}
								{@const belongs = community.relationship === 'belong'}
								<button
									type="button"
									class="w-56 shrink-0 rounded-lg border bg-base-300 p-3 text-left transition-colors hover:bg-base-200"
									class:border-primary={belongs}
									class:border-base-200={!belongs}
									on:click|stopPropagation={() => openCommunity(community)}
									aria-label={`${communityName} community`}
								>
									<div class="flex items-start gap-3">
										<span
											class={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg ${communityColorClass(
												community.key
											)}`}
										>
											{#if info?.icon}
												<img
													src={proxyAvatarUrl(info.icon)}
													alt=""
													class="h-full w-full object-cover"
												/>
											{:else}
												<span class="text-sm font-bold text-base-100"
													>{initials(communityName)}</span
												>
											{/if}
										</span>
										<span class="min-w-0 flex-1">
											<span class="flex items-center gap-1">
												<span class="min-w-0 flex-1 truncate text-[15px] font-bold">
													{communityName}
												</span>
												{#if belongs}
													<Icon icon="mdi:shield-check" class="shrink-0 text-primary" />
												{/if}
											</span>
											<span class="mt-1 block text-xs font-semibold uppercase text-primary">
												{belongs ? 'Member' : 'Following'}
											</span>
										</span>
									</div>
									<p class="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-base-content/70">
										{info?.description || 'Public community'}
									</p>
									<div class="mt-3 flex h-6 items-center">
										{#each profiles.slice(0, 5) as profile, index (profile.pubkey)}
											<span
												class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-base-300 bg-base-200"
												style={`margin-left: ${index ? -7 : 0}px`}
											>
												{#if profile.picture}
													<img
														src={proxyAvatarUrl(profile.picture)}
														alt=""
														class="h-full w-full object-cover"
													/>
												{:else}
													<span class="text-[9px] font-bold text-base-content">
														{initials(profile.name)}
													</span>
												{/if}
											</span>
										{/each}
										{#if profiles.length > 5}
											<span class="ml-2 text-xs font-semibold text-base-content/70">
												+{profiles.length - 5}
											</span>
										{/if}
									</div>
									<div
										class="mt-3 flex items-center gap-1 text-xs font-medium text-base-content/70"
									>
										<Icon icon="mdi:account-group" class="text-sm" />
										<span>Public</span>
									</div>
								</button>
							{/each}
						</div>
					</section>
				{/if}
			</div>

			<div class="border-t border-base-200/70 px-4 pt-2 pb-3">
				<KindSwitcher
					{selectedKinds}
					ariaLabel="Profile content filters"
					on:select={selectProfileKindTab}
				/>
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
