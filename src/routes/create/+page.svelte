<script lang="ts">
	import { resolve } from 'src/lib/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { type ParsedEvent, type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind0,
		asKind10002,
		asNip51,
		fbArray,
		isConnectionStatus,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import {
		ArrowLeft,
		ArrowRight,
		CalendarDays,
		CheckCircle2,
		ImagePlus,
		Loader2,
		UserRound,
		UsersRound
	} from 'lucide-svelte';
	import { nip19, type EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import { QRCode } from 'svelte-qrcode-image/util';

	import { key, kind0, kind10002, rememberAdminServiceBaseUrl } from 'src/controller';
	import CommunityBenefitsPanel from 'src/components/CommunityBenefitsPanel.svelte';
	import CommunityCreatedScreen from 'src/components/CommunityCreatedScreen.svelte';
	import {
		ADMIN_RELAY_SET_D,
		buildAdminRelaySetTags,
		buildRelayListTagsWithReadRelay,
		createRelayEoseTracker,
		mergeRelayFeedIndexTags,
		nextReplaceableCreatedAt,
		relaySetAddress,
		relaySetAddressesFromRelayFeedEvent,
		relayUrlsFromRelaySet
	} from 'src/lib/adminRelays';
	import { buildCommunityProfileTags, COMMUNITY_PROFILE_KIND } from 'src/lib/communityProfile';
	import { archetypeFor, COMMUNITY_ARCHETYPES, type CommunityType } from 'src/lib/communityTypes';
	import { DEFAULT_RELAYS, INDEXER_RELAYS } from 'src/lib/env';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { setSignerAndWait } from 'src/lib/managerAuth';
	import { now } from 'src/lib/period';
	import { buildProfileReplicationEvent } from 'src/lib/profileReplication';
	import { waitForRelayReady } from 'src/lib/relayReadiness';
	import { DEFAULT_SERVER, uploadFile } from 'src/lib/upload';
	import { onDestroy, onMount } from 'svelte';

	type CreateState =
		| 'idle'
		| 'finding-profile'
		| 'creating-account'
		| 'creating-relay'
		| 'done'
		| 'error';

	type RelayRecord = {
		id: string;
		name?: string;
		status: string;
		domain: string;
		relay_url: string;
		base_url: string;
		required_badge: string;
		badge_issuer_pubkey: string;
		admin_pubkeys: string[];
	};

	type DirectoryLookup = {
		ready: Promise<void>;
		settled: Promise<void>;
		stop: () => void;
	};

	const coordinatorUrl = import.meta.env.VITE_COORDINATOR_URL || 'https://coordinator.nuts.cash';
	const RELAY_LIST_PUBLISH_RELAYS = ['wss://relay.nuts.cash', 'wss://relay.damus.io'];
	const DIRECTORY_READY_EOSE_COUNT = 2;
	const DIRECTORY_READY_TIMEOUT_MS = 2500;
	const DIRECTORY_SETTLE_TIMEOUT_MS = 5000;
	const DIRECTORY_VERIFY_TIMEOUT_MS = 5000;

	let communityName = '';
	let communityDescription = '';
	let communityImage = '';
	let communityImageName = '';
	let communityImageFile: File | undefined;
	let communityType: CommunityType = 'sports';
	let creatorName = '';
	let picture = '';
	let pictureName = '';
	let pictureFile: File | undefined;
	let state: CreateState = 'idle';
	let error = '';
	let relay: RelayRecord | undefined;
	let recoveryNsec = '';
	let qrDataUrl = '';
	let qrRequest = 0;
	let adminRelaySet: ParsedEvent | undefined;
	let relayFeed: ParsedEvent | undefined;
	let adminRelaySetLookup: DirectoryLookup | undefined;
	let relayFeedLookup: DirectoryLookup | undefined;
	let checkAdminRelaySetVerification: (() => void) | undefined;
	let cancelAdminRelaySetVerification: (() => void) | undefined;
	let unsubscribeCreatorProfile: (() => void) | undefined;
	let publishUnsubscribers: Array<() => void> = [];
	let fetchedCreatorProfile: ParsedEvent | undefined;
	let creatorProfileLookupDone = false;
	let creatorProfileLookupPubkey = '';

	$: communitySlug = slugFromName(communityName);
	$: selectedArchetype = archetypeFor(communityType);
	$: inviteUrl = relay ? `${relay.base_url}/redeem` : `https://nuts.cash/join/${communitySlug}`;
	$: forceSuccess = $page.url.searchParams.has('success');
	$: successInviteUrl = forceSuccess ? `https://nuts.cash/join/${communitySlug}` : inviteUrl;
	$: displayCommunityName = forceSuccess && !communityName ? 'The Office' : communityName;
	$: displayCommunityDescription =
		forceSuccess && !communityDescription ? 'Coolest coworking in town' : communityDescription;
	$: accountReady = Boolean($key?.pub);
	$: creatorProfile =
		$key?.pub && $kind0?.pubkey() === $key.pub && $kind0.kind() === 0
			? $kind0
			: $key?.pub &&
				  fetchedCreatorProfile?.pubkey() === $key.pub &&
				  fetchedCreatorProfile.kind() === 0
				? fetchedCreatorProfile
				: undefined;
	$: needsCreatorProfile = !accountReady;
	$: canCreate =
		communityName.trim().length > 1 &&
		Boolean(accountReady ? creatorProfile : creatorName.trim().length > 1);
	$: generateQr(successInviteUrl);

	function slugFromName(value: string) {
		return (
			value
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 63)
				.replace(/-$/g, '') || 'community'
		);
	}

	function previewImageFile(file: File, onLoad: (value: string, name: string) => void) {
		const reader = new FileReader();
		reader.onload = () => {
			const value = typeof reader.result === 'string' ? reader.result : '';
			onLoad(value, file.name);
		};
		reader.readAsDataURL(file);
	}

	function handleCommunityImageUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		selectCommunityImage(input.files?.[0]);
	}

	function selectCommunityImage(file: File | undefined) {
		if (!file?.type.startsWith('image/')) return;
		communityImageFile = file;
		previewImageFile(file, (value, name) => {
			communityImage = value;
			communityImageName = name;
		});
	}

	function handlePictureUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		selectPicture(input.files?.[0]);
	}

	function selectPicture(file: File | undefined) {
		if (!file?.type.startsWith('image/')) return;
		pictureFile = file;
		previewImageFile(file, (value, name) => {
			picture = value;
			pictureName = name;
		});
	}

	function handleImageDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function handleCommunityImageDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		selectCommunityImage(event.dataTransfer?.files[0]);
	}

	function handlePictureDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		selectPicture(event.dataTransfer?.files[0]);
	}

	async function connectWithExtension() {
		const nostr = (window as Window & { nostr?: { getPublicKey: () => Promise<string> } }).nostr;
		if (!nostr) return;
		state = 'creating-account';
		error = '';
		try {
			const pubkey = await nostr.getPublicKey();
			await setSignerAndWait('nip07', undefined, pubkey);
			await loadCreatorProfile(pubkey);
			state = 'idle';
		} catch (err) {
			state = 'error';
			error = err instanceof Error ? err.message : 'Could not connect signer.';
		}
	}

	async function createLocalAccount() {
		const secret = schnorr.utils.randomSecretKey();
		const privkey = bytesToHex(secret);
		const pubkey = bytesToHex(schnorr.getPublicKey(secret));
		recoveryNsec = nip19.nsecEncode(secret);

		await setSignerAndWait('privkey', privkey, pubkey);
		creatorProfileLookupPubkey = pubkey;
		creatorProfileLookupDone = true;
		fetchedCreatorProfile = undefined;

		return pubkey;
	}

	function publishRelayList(pubkey: string, communityRelay: string) {
		const relayList: EventTemplate = {
			kind: 10002,
			tags: buildRelayListTagsWithReadRelay(
				$kind10002?.pubkey() === pubkey ? $kind10002 : undefined,
				communityRelay,
				INDEXER_RELAYS
			),
			content: '',
			created_at: now()
		};

		usePublish('community_relay_list_' + pubkey, relayList, () => undefined, {
			trackStatus: true,
			defaultRelays: Array.from(new Set([communityRelay, ...INDEXER_RELAYS]))
		});
	}

	function cleanupPublishes() {
		for (const unsubscribe of publishUnsubscribers) {
			unsubscribe();
		}
		publishUnsubscribers = [];
	}

	function publishRequiredEvent(
		pubId: string,
		event: EventTemplate,
		onSuccess: () => void,
		onError: (error: Error) => void,
		relays: string[] = RELAY_LIST_PUBLISH_RELAYS,
		errorMessage = `Could not publish kind ${event.kind} to the relay list relays.`
	) {
		let settled = false;
		let unsubscribePublish: () => void = () => {};
		const timeout = window.setTimeout(() => {
			if (settled) return;
			settled = true;
			unsubscribePublish();
			publishUnsubscribers = publishUnsubscribers.filter(
				(unsubscribe) => unsubscribe !== unsubscribePublish
			);
			onError(new Error(errorMessage));
		}, 8000);

		unsubscribePublish = usePublish(
			pubId,
			event,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status?.status() !== 'true') return;
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				window.setTimeout(() => {
					unsubscribePublish();
					publishUnsubscribers = publishUnsubscribers.filter(
						(unsubscribe) => unsubscribe !== unsubscribePublish
					);
					onSuccess();
				}, 0);
			},
			{
				trackStatus: true,
				defaultRelays: relays
			}
		);

		publishUnsubscribers.push(unsubscribePublish);
	}

	function publishCreatorProfile(
		pubkey: string,
		communityRelay: string,
		profileEvent: EventTemplate,
		onSuccess: () => void,
		onError: (error: Error) => void
	) {
		const targetRelay = normalizeURL(communityRelay);
		let settled = false;
		let unsubscribePublish: () => void = () => {};
		const timeout = window.setTimeout(() => {
			if (settled) return;
			settled = true;
			unsubscribePublish();
			publishUnsubscribers = publishUnsubscribers.filter(
				(unsubscribe) => unsubscribe !== unsubscribePublish
			);
			onError(new Error('The community relay did not confirm the creator profile.'));
		}, 12000);

		unsubscribePublish = usePublish(
			'community_creator_profile_' + pubkey,
			profileEvent,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				const statusRelay = status?.relayUrl();
				if (
					status?.status() !== 'true' ||
					!statusRelay ||
					normalizeURL(statusRelay) !== targetRelay ||
					settled
				) {
					return;
				}
				settled = true;
				window.clearTimeout(timeout);
				window.setTimeout(() => {
					unsubscribePublish();
					publishUnsubscribers = publishUnsubscribers.filter(
						(unsubscribe) => unsubscribe !== unsubscribePublish
					);
					onSuccess();
				}, 0);
			},
			{
				trackStatus: true,
				defaultRelays: [communityRelay]
			}
		);
		publishUnsubscribers.push(unsubscribePublish);
	}

	function fetchCreatorProfile(pubkey: string) {
		if ($kind0?.pubkey() === pubkey && $kind0.kind() === 0) {
			return Promise.resolve($kind0);
		}

		unsubscribeCreatorProfile?.();
		const relayList =
			$kind10002?.pubkey() === pubkey && $kind10002.kind() === 10002
				? asKind10002($kind10002)
				: undefined;
		const advertisedRelays = relayList
			? fbArray(relayList, 'relays')
					.map((relayInfo) => relayInfo.url())
					.filter((relayUrl): relayUrl is string => Boolean(relayUrl))
			: [];
		const relays = Array.from(new Set([...advertisedRelays, ...INDEXER_RELAYS, ...DEFAULT_RELAYS]));
		const completedRelays: string[] = [];

		return new Promise<ParsedEvent | undefined>((resolveCreatorProfile) => {
			let latest: ParsedEvent | undefined;
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				unsubscribeCreatorProfile?.();
				unsubscribeCreatorProfile = undefined;
				resolveCreatorProfile(latest);
			};
			const timeout = window.setTimeout(finish, 5000);

			unsubscribeCreatorProfile = useSubscription(
				`community_creator_profile_fetch_${pubkey}_${[...relays].sort().join(',')}`,
				[
					{
						kinds: [0],
						authors: [pubkey],
						limit: 10,
						relays,
						cacheFirst: true
					}
				],
				(message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					const statusRelay = status?.relayUrl();
					if (status?.status() === 'EOSE' && statusRelay) {
						const completedRelay = normalizeURL(statusRelay);
						if (!completedRelays.includes(completedRelay)) completedRelays.push(completedRelay);
						if (relays.every((relayUrl) => completedRelays.includes(normalizeURL(relayUrl)))) {
							finish();
						}
						return;
					}

					const parsedEvent = isParsedEvent(message);
					if (!parsedEvent || parsedEvent.kind() !== 0 || parsedEvent.pubkey() !== pubkey) {
						return;
					}
					if (!latest || parsedEvent.createdAt() > latest.createdAt()) latest = parsedEvent;
				},
				{ bytesPerEvent: 10 * 1024 }
			);
		});
	}

	async function loadCreatorProfile(pubkey: string) {
		creatorProfileLookupPubkey = pubkey;
		creatorProfileLookupDone = false;
		fetchedCreatorProfile = undefined;
		const foundProfile = await fetchCreatorProfile(pubkey);
		if ($key?.pub !== pubkey || creatorProfileLookupPubkey !== pubkey) return;
		fetchedCreatorProfile = foundProfile;
		creatorProfileLookupDone = true;
	}

	function publishCommunityRelaySet(
		pubkey: string,
		communityRelay: string,
		onSuccess: () => void,
		onError: (error: Error) => void
	) {
		const relayFeedSnapshot = relayFeed;
		const relayFeeds: EventTemplate = {
			kind: 10012,
			tags: mergeRelayFeedIndexTags(relayFeedSnapshot, pubkey, ['admin', 'member', 'following']),
			content: '',
			created_at: nextReplaceableCreatedAt(relayFeedSnapshot, now())
		};

		publishRequiredEvent(
			'community_relay_feeds_' + pubkey,
			relayFeeds,
			() => {
				const adminRelaySetSnapshot = adminRelaySet;
				const relaySetCreatedAt = nextReplaceableCreatedAt(adminRelaySetSnapshot, now());
				const relaySet: EventTemplate = {
					kind: 30002,
					tags: buildAdminRelaySetTags(adminRelaySetSnapshot, communityRelay),
					content: '',
					created_at: relaySetCreatedAt
				};
				const expectedRelays = new Set([
					...relayUrlsFromRelaySet(adminRelaySetSnapshot),
					normalizeURL(communityRelay)
				]);

				publishRequiredEvent(
					'community_admin_relay_set_' + pubkey,
					relaySet,
					() =>
						verifyAdminRelaySetPublication(expectedRelays, relaySetCreatedAt, onSuccess, onError),
					onError
				);
			},
			onError
		);
	}

	function createDirectoryLookupProgress(relays: string[]) {
		const trackEose = createRelayEoseTracker(relays);
		let readyDone = false;
		let settledDone = false;
		let resolveReady: () => void = () => {};
		let resolveSettled: () => void = () => {};
		const ready = new Promise<void>((resolve) => {
			resolveReady = resolve;
		});
		const settled = new Promise<void>((resolve) => {
			resolveSettled = resolve;
		});
		const finishReady = () => {
			if (readyDone) return;
			readyDone = true;
			window.clearTimeout(readyTimeout);
			resolveReady();
		};
		const finishSettled = () => {
			if (settledDone) return;
			settledDone = true;
			window.clearTimeout(settleTimeout);
			finishReady();
			resolveSettled();
		};
		const readyTimeout = window.setTimeout(finishReady, DIRECTORY_READY_TIMEOUT_MS);
		const settleTimeout = window.setTimeout(finishSettled, DIRECTORY_SETTLE_TIMEOUT_MS);

		return {
			ready,
			settled,
			found: finishReady,
			status(status: string | null | undefined, relayUrl: string | null | undefined) {
				const progress = trackEose(status, relayUrl);
				if (progress.completed >= Math.min(DIRECTORY_READY_EOSE_COUNT, relays.length)) {
					finishReady();
				}
				if (progress.settled) finishSettled();
			},
			stop: finishSettled
		};
	}

	function verifyAdminRelaySetPublication(
		expectedRelays: Set<string>,
		minimumCreatedAt: number,
		onSuccess: () => void,
		onError: (error: Error) => void
	) {
		cancelAdminRelaySetVerification?.();
		let finished = false;
		const finish = (verified: boolean) => {
			if (finished) return;
			finished = true;
			window.clearTimeout(timeout);
			checkAdminRelaySetVerification = undefined;
			cancelAdminRelaySetVerification = undefined;
			if (verified) {
				onSuccess();
			} else {
				onError(new Error('The updated community list was published but could not be verified.'));
			}
		};
		const check = () => {
			if (!adminRelaySet || adminRelaySet.createdAt() < minimumCreatedAt) return;
			const observedRelays = new Set(relayUrlsFromRelaySet(adminRelaySet));
			if ([...expectedRelays].every((relayUrl) => observedRelays.has(relayUrl))) {
				finish(true);
			}
		};
		const timeout = window.setTimeout(() => finish(false), DIRECTORY_VERIFY_TIMEOUT_MS);
		checkAdminRelaySetVerification = check;
		cancelAdminRelaySetVerification = () => {
			if (finished) return;
			finished = true;
			window.clearTimeout(timeout);
			checkAdminRelaySetVerification = undefined;
			cancelAdminRelaySetVerification = undefined;
		};
		check();
	}

	function fetchAdminRelaySet(pubkey: string) {
		adminRelaySetLookup?.stop();
		if (adminRelaySet?.pubkey() !== pubkey) adminRelaySet = undefined;

		const relays = Array.from(
			new Set([...INDEXER_RELAYS, ...DEFAULT_RELAYS, 'wss://relay.nuts.cash'])
		);
		const progress = createDirectoryLookupProgress(relays);
		const requests: RequestObject[] = [
			{
				kinds: [30002],
				authors: [pubkey],
				tags: { '#d': [ADMIN_RELAY_SET_D] },
				limit: 10,
				relays,
				cacheFirst: true,
				closeOnEOSE: false
			}
		];
		const unsubscribe = useSubscription(
			'community_admin_relay_set_fetch_' + pubkey,
			requests,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				progress.status(status?.status(), status?.relayUrl());

				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent || parsedEvent.kind() !== 30002 || parsedEvent.pubkey() !== pubkey) {
					return;
				}
				const list = asNip51(parsedEvent);
				if (list?.d() !== ADMIN_RELAY_SET_D) return;
				if (!adminRelaySet || parsedEvent.createdAt() > adminRelaySet.createdAt()) {
					adminRelaySet = parsedEvent;
					checkAdminRelaySetVerification?.();
				}
				progress.found();
			},
			{ bytesPerEvent: 10 * 1024 }
		);
		adminRelaySetLookup = {
			ready: progress.ready,
			settled: progress.settled,
			stop: () => {
				unsubscribe();
				progress.stop();
			}
		};
		return adminRelaySetLookup;
	}

	function fetchRelayFeed(pubkey: string) {
		relayFeedLookup?.stop();
		if (relayFeed?.pubkey() !== pubkey) relayFeed = undefined;

		const relays = Array.from(
			new Set([...INDEXER_RELAYS, ...DEFAULT_RELAYS, 'wss://relay.nuts.cash'])
		);
		const progress = createDirectoryLookupProgress(relays);
		const requests: RequestObject[] = [
			{
				kinds: [10012],
				authors: [pubkey],
				limit: 10,
				relays,
				cacheFirst: true,
				closeOnEOSE: false
			}
		];
		const unsubscribe = useSubscription(
			'community_relay_feed_fetch_' + pubkey,
			requests,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				progress.status(status?.status(), status?.relayUrl());

				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent || parsedEvent.kind() !== 10012 || parsedEvent.pubkey() !== pubkey) {
					return;
				}
				if (!relayFeed || parsedEvent.createdAt() > relayFeed.createdAt()) {
					relayFeed = parsedEvent;
				}
				progress.found();
			},
			{ bytesPerEvent: 10 * 1024 }
		);
		relayFeedLookup = {
			ready: progress.ready,
			settled: progress.settled,
			stop: () => {
				unsubscribe();
				progress.stop();
			}
		};
		return relayFeedLookup;
	}

	async function createRelay(adminPubkey: string) {
		const url = `${coordinatorUrl.replace(/\/$/, '')}/relays`;
		const body = JSON.stringify({
			name: communityName.trim(),
			description: communityDescription.trim() || undefined,
			domain_label: communitySlug,
			admin_pubkeys: [adminPubkey],
			badge_d: 'members'
		});

		let response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body
		});
		if (response.status === 401) {
			// Newer coordinators require NIP-98 admin auth — retry signed.
			const authorization = await makeInviteAuthorization(url, body, adminPubkey);
			response = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization },
				body
			});
		}

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(errorText || `Coordinator returned ${response.status}`);
		}

		return (await response.json()) as RelayRecord;
	}

	async function uploadCommunityImage() {
		if (!communityImageFile) return '';
		try {
			const uploaded = await uploadFile(communityImageFile, {
				server: DEFAULT_SERVER,
				serverType: 'blossom',
				preferUserServers: false,
				alt: communityName.trim() || communityImageFile.name
			});
			return uploaded.url;
		} catch {
			// The community profile is still published, just without an image.
			return '';
		}
	}

	async function uploadCreatorPicture() {
		if (!pictureFile) return '';
		try {
			const uploaded = await uploadFile(pictureFile, {
				server: DEFAULT_SERVER,
				serverType: 'blossom',
				preferUserServers: false,
				alt: creatorName.trim() || pictureFile.name
			});
			return uploaded.url;
		} catch {
			// Account creation can continue without an optional profile picture.
			return '';
		}
	}

	function publishCommunityProfile(
		communityRelay: string,
		imageUrl: string,
		onSuccess: () => void,
		onError: (error: Error) => void
	) {
		const profileEvent: EventTemplate = {
			kind: COMMUNITY_PROFILE_KIND,
			tags: buildCommunityProfileTags({
				type: communityType,
				description: communityDescription,
				image: imageUrl
			}),
			content: '',
			created_at: now()
		};

		let settled = false;
		let unsubscribePublish: () => void = () => {};
		const timeout = window.setTimeout(() => {
			if (settled) return;
			settled = true;
			unsubscribePublish();
			publishUnsubscribers = publishUnsubscribers.filter(
				(unsubscribe) => unsubscribe !== unsubscribePublish
			);
			onError(new Error('The community relay did not confirm its profile.'));
		}, 12000);

		unsubscribePublish = usePublish(
			'community_profile_' + communityRelay,
			profileEvent,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status?.status() !== 'true' || settled) return;
				settled = true;
				window.clearTimeout(timeout);
				window.setTimeout(() => {
					unsubscribePublish();
					publishUnsubscribers = publishUnsubscribers.filter(
						(unsubscribe) => unsubscribe !== unsubscribePublish
					);
					onSuccess();
				}, 0);
			},
			{
				trackStatus: true,
				defaultRelays: [communityRelay]
			}
		);
		publishUnsubscribers.push(unsubscribePublish);
	}

	async function continueCommunityCreation(
		adminPubkey: string,
		creatorProfileEvent: EventTemplate
	) {
		try {
			state = 'creating-relay';
			relay = await createRelay(adminPubkey);
			rememberAdminServiceBaseUrl(relay.relay_url, relay.base_url);
			await waitForRelayReady(relay.relay_url);
			const profileImageUrl = await uploadCommunityImage();
			await Promise.all([
				adminRelaySetLookup?.settled || Promise.resolve(),
				relayFeedLookup?.settled || Promise.resolve()
			]);
			if (
				adminRelaySetLookup &&
				!adminRelaySet &&
				relaySetAddressesFromRelayFeedEvent(relayFeed).includes(
					relaySetAddress(adminPubkey, 'admin')
				)
			) {
				throw new Error(
					'Your community index references an existing admin relay list, but that list could not be loaded. Please retry before creating another community.'
				);
			}
			publishRelayList(adminPubkey, relay.relay_url);
			publishCommunityRelaySet(
				adminPubkey,
				relay.relay_url,
				() => {
					if (!relay) return;
					publishCreatorProfile(
						adminPubkey,
						relay.relay_url,
						creatorProfileEvent,
						() => {
							if (!relay) return;
							publishCommunityProfile(
								relay.relay_url,
								profileImageUrl,
								() => {
									if (!relay) return;
									void goto(resolve(`/admin/${encodeURIComponent(relay.relay_url)}`));
								},
								(err) => {
									state = 'error';
									error = err.message;
								}
							);
						},
						(err) => {
							state = 'error';
							error = err.message;
						}
					);
				},
				(err) => {
					state = 'error';
					error = err.message;
				}
			);
		} catch (err) {
			state = 'error';
			error = err instanceof Error ? err.message : 'Could not create community.';
		}
	}

	async function createCommunity() {
		if (
			!canCreate ||
			state === 'finding-profile' ||
			state === 'creating-account' ||
			state === 'creating-relay'
		) {
			return;
		}

		error = '';
		recoveryNsec = '';
		relay = undefined;
		cancelAdminRelaySetVerification?.();

		try {
			let adminPubkey = $key?.pub;
			const isNewSignup = !adminPubkey;
			if (isNewSignup) {
				state = 'creating-account';
				adminPubkey = await createLocalAccount();
			} else {
				state = 'finding-profile';
				const adminLookup = fetchAdminRelaySet(adminPubkey);
				const feedLookup = fetchRelayFeed(adminPubkey);
				await Promise.all([adminLookup.ready, feedLookup.ready]);
			}

			if (!isNewSignup) {
				const foundProfile =
					creatorProfile?.pubkey() === adminPubkey && creatorProfile.kind() === 0
						? creatorProfile
						: await fetchCreatorProfile(adminPubkey);
				const existingProfile = foundProfile ? asKind0(foundProfile) : undefined;
				if (!existingProfile) {
					creatorProfileLookupDone = true;
					throw new Error(
						'Could not find a kind-0 profile for this account. Community creation requires the existing profile for the provided pubkey.'
					);
				}
				fetchedCreatorProfile = foundProfile;
				creatorProfileLookupDone = true;
				const creatorProfileEvent = buildProfileReplicationEvent(existingProfile, {}, now());
				await continueCommunityCreation(adminPubkey, creatorProfileEvent);
				return;
			}

			if (!adminPubkey) throw new Error('Could not create the account.');
			if (creatorName.trim().length < 2) {
				throw new Error('A profile with your name is required to create a community.');
			}

			state = 'creating-account';
			const creatorPictureUrl = await uploadCreatorPicture();
			const creatorProfileEvent = buildProfileReplicationEvent(
				undefined,
				{
					name: creatorName.trim(),
					display_name: creatorName.trim(),
					picture: creatorPictureUrl || undefined,
					about: `Creator of ${communityName.trim()}`
				},
				now()
			);
			publishRequiredEvent(
				'community_creator_profile_source_' + adminPubkey,
				creatorProfileEvent,
				() => {
					creatorProfileLookupDone = true;
					void continueCommunityCreation(adminPubkey, creatorProfileEvent);
				},
				(err) => {
					state = 'error';
					error = err.message;
				},
				INDEXER_RELAYS,
				'Your profile could not be created, so the community was not created.'
			);
		} catch (err) {
			state = 'error';
			error = err instanceof Error ? err.message : 'Could not create community.';
		}
	}

	async function generateQr(text: string) {
		const requestId = ++qrRequest;
		const nextQrDataUrl = await QRCode.toDataURL(text, {
			errorCorrectionLevel: 'M',
			margin: 1,
			width: 720,
			color: {
				dark: '#151411',
				light: '#fff8ea'
			}
		});
		if (requestId !== qrRequest) return;
		qrDataUrl = nextQrDataUrl;
	}

	onMount(() => {
		if ($key?.pub) {
			fetchAdminRelaySet($key.pub);
			fetchRelayFeed($key.pub);
			void loadCreatorProfile($key.pub);
		}
	});

	onDestroy(() => {
		adminRelaySetLookup?.stop();
		relayFeedLookup?.stop();
		cancelAdminRelaySetVerification?.();
		unsubscribeCreatorProfile?.();
		cleanupPublishes();
	});
</script>

<svelte:head>
	<title>Create community - Nuts</title>
	<meta
		name="description"
		content="Create a Nuts community with a local account, private relay and invite link."
	/>
</svelte:head>

<main class="min-h-screen bg-[#f7f5ef] text-[#171614]">
	<section class="flex min-h-screen items-stretch gap-0">
		<CommunityBenefitsPanel />
		{#if (state === 'done' && relay) || forceSuccess}
			<CommunityCreatedScreen
				communityName={displayCommunityName}
				communityDescription={displayCommunityDescription}
				{communityImage}
				inviteUrl={successInviteUrl}
				{qrDataUrl}
				{recoveryNsec}
			/>
		{:else}
			<section class="min-w-0 flex-1 px-4 pb-12 pt-4 sm:px-6 lg:px-8 xl:px-10">
				<a
					class="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-black text-stone-600 no-underline transition hover:bg-white/75 hover:text-[#171614] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
					href={resolve('/')}
				>
					<ArrowLeft size={17} />
					Back
				</a>
				<p class="mt-12 text-sm font-black text-emerald-900">Create community</p>
				<h1 class="mt-4 max-w-4xl text-5xl font-black leading-[0.95] tracking-normal lg:text-7xl">
					Launch your community.
				</h1>
				{#if accountReady}
					<p class="mt-7 max-w-2xl text-xl font-medium leading-9 text-stone-600">
						Create the digital home for your sports club, restaurant, members' club, village or
						network.
					</p>
				{:else}
					<p class="mt-7 max-w-2xl text-xl font-medium leading-9 text-stone-600">
						Already have a Nuts or Nostr account? Sign in first. New here? We’ll create your account
						with the community.
					</p>
				{/if}

				<div class="mt-12 max-w-5xl">
					<div class="flex items-end justify-between gap-4">
						<div>
							<p class="text-sm font-black text-stone-500">Step 1</p>
							<h2 class="mt-1 text-2xl font-black">Pick the closest shape</h2>
						</div>
						<p
							class="hidden max-w-xs text-right text-sm font-semibold leading-6 text-stone-500 sm:block"
						>
							Sets your starting profile and tools. You can change everything later in Settings.
						</p>
					</div>
					<div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
						{#each COMMUNITY_ARCHETYPES as archetype (archetype.id)}
							<button
								type="button"
								class={`grid h-28 content-center justify-items-center gap-1.5 rounded-xl border p-3 text-center font-black transition focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] ${
									communityType === archetype.id
										? 'border-emerald-950 bg-emerald-950 text-white shadow-sm shadow-emerald-950/20'
										: 'border-stone-200 bg-white/80 text-stone-600 shadow-sm shadow-stone-950/5 hover:border-stone-300 hover:bg-white hover:text-[#171614]'
								}`}
								on:click={() => (communityType = archetype.id)}
							>
								<svelte:component this={archetype.icon} size={28} />
								<span class="text-xs leading-tight">{archetype.label}</span>
							</button>
						{/each}
					</div>
					<div class="mt-4 rounded-xl border border-emerald-900/15 bg-emerald-50/60 p-4">
						<p class="text-sm font-black text-emerald-950">{selectedArchetype.tagline}</p>
						<ul class="mt-3 grid gap-2 sm:grid-cols-2">
							{#each selectedArchetype.highlights as highlight (highlight)}
								<li class="flex items-start gap-2 text-sm font-semibold text-stone-600">
									<CheckCircle2 class="mt-0.5 shrink-0 text-emerald-800" size={15} />
									{highlight}
								</li>
							{/each}
						</ul>
					</div>
				</div>

				<div
					class="mt-10 max-w-5xl rounded-2xl border border-stone-200 bg-white/85 p-5 shadow-sm shadow-stone-950/5 sm:p-7"
				>
					<div class="flex flex-wrap items-end justify-between gap-4">
						<div>
							<p class="text-sm font-black text-stone-500">Step 2</p>
							<h2 class="mt-1 text-2xl font-black">Community details</h2>
						</div>
						<p class="text-sm font-semibold text-stone-500">Relay slug: {communitySlug}</p>
					</div>
					<div class="mt-6 grid gap-5">
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-600">Community name</span>
							<input
								class="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-4 text-lg font-black outline-none transition placeholder:text-stone-400 focus:border-emerald-900 focus:bg-white focus:ring-2 focus:ring-emerald-800/20"
								bind:value={communityName}
								autocomplete="organization"
								maxlength="50"
								placeholder="FC Avenir"
							/>
							<small class="justify-self-end text-xs font-black text-stone-400"
								>{communityName.length}/50</small
							>
						</label>

						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-600">Description</span>
							<textarea
								class="min-h-28 w-full resize-y rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-4 text-base font-semibold leading-7 outline-none transition placeholder:text-stone-400 focus:border-emerald-900 focus:bg-white focus:ring-2 focus:ring-emerald-800/20"
								rows="3"
								maxlength="200"
								bind:value={communityDescription}
								placeholder="A place for players, parents and supporters."
							></textarea>
							<small class="justify-self-end text-xs font-black text-stone-400"
								>{communityDescription.length}/200</small
							>
						</label>

						<label
							class="grid gap-2"
							on:dragover={handleImageDragOver}
							on:drop={handleCommunityImageDrop}
						>
							<span class="text-sm font-black text-stone-600"
								>Community image <em class="font-semibold not-italic">(optional)</em></span
							>
							<input
								class="sr-only"
								type="file"
								accept="image/*"
								on:change={handleCommunityImageUpload}
							/>
							<span
								class="grid min-h-28 cursor-pointer grid-cols-[72px_1fr] items-center gap-4 rounded-xl border border-dashed border-stone-300 bg-stone-50/70 p-4 transition hover:border-emerald-900/50 hover:bg-white"
							>
								{#if communityImage}
									<img
										class="h-[72px] w-[72px] rounded-lg object-cover"
										src={communityImage}
										alt=""
									/>
								{:else}
									<span
										class="grid h-[72px] w-[72px] place-items-center rounded-lg bg-emerald-950 text-white"
									>
										<ImagePlus size={28} />
									</span>
								{/if}
								<span>
									<strong class="block text-lg font-black">Upload or drop image</strong>
									<small class="mt-1 block text-sm font-semibold text-stone-500"
										>{communityImageName || 'JPG, PNG or GIF. Max 5MB'}</small
									>
								</span>
							</span>
						</label>

						{#if accountReady && !creatorProfile && !creatorProfileLookupDone}
							<div
								class="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-4 text-sm font-bold text-stone-600"
							>
								<Loader2 class="animate-spin" size={18} />
								Looking for your Nostr profile…
							</div>
						{:else if accountReady && !creatorProfile}
							<div class="rounded-xl border border-red-200 bg-red-50 p-4">
								<p class="font-black text-red-950">Kind-0 profile not found</p>
								<p class="mt-1 text-sm font-semibold leading-6 text-red-900">
									This signed-in pubkey cannot create a community until its existing profile can be
									retrieved.
								</p>
								<button
									type="button"
									class="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-black text-red-950"
									on:click={() => $key?.pub && loadCreatorProfile($key.pub)}
								>
									Retry profile lookup
								</button>
							</div>
						{/if}

						{#if needsCreatorProfile}
							<div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
								<p class="font-black text-amber-950">Create your profile first</p>
								<p class="mt-1 text-sm font-semibold leading-6 text-amber-900">
									A kind-0 profile is required before the community relay can be created.
								</p>
							</div>
							<label class="grid gap-2">
								<span class="text-sm font-black text-stone-600">Your name</span>
								<input
									class="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-4 text-lg font-black outline-none transition placeholder:text-stone-400 focus:border-emerald-900 focus:bg-white focus:ring-2 focus:ring-emerald-800/20"
									bind:value={creatorName}
									autocomplete="name"
									placeholder="Marie"
								/>
							</label>

							<label
								class="grid gap-2"
								on:dragover={handleImageDragOver}
								on:drop={handlePictureDrop}
							>
								<span class="text-sm font-black text-stone-600"
									>Your picture <em class="font-semibold not-italic">(optional)</em></span
								>
								<input
									class="sr-only"
									type="file"
									accept="image/*"
									on:change={handlePictureUpload}
								/>
								<span
									class="grid min-h-24 cursor-pointer grid-cols-[64px_1fr] items-center gap-4 rounded-xl border border-dashed border-stone-300 bg-stone-50/70 p-4 transition hover:border-emerald-900/50 hover:bg-white"
								>
									{#if picture}
										<img class="h-16 w-16 rounded-lg object-cover" src={picture} alt="" />
									{:else}
										<span
											class="grid h-16 w-16 place-items-center rounded-lg bg-stone-200 text-[#171614]"
										>
											<ImagePlus size={28} />
										</span>
									{/if}
									<span>
										<strong class="block font-black">Upload or drop profile picture</strong>
										<small class="mt-1 block text-sm font-semibold text-stone-500"
											>{pictureName || 'Optional account picture'}</small
										>
									</span>
								</span>
							</label>
						{/if}
					</div>
				</div>

				{#if !accountReady}
					<div
						class="mt-5 flex max-w-5xl flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white/60 p-3 text-sm font-bold text-stone-600 shadow-sm shadow-stone-950/5"
					>
						<button
							class="rounded-xl border border-stone-300 bg-white px-4 py-2 font-black text-[#171614] transition hover:border-emerald-900/50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
							type="button"
							on:click={connectWithExtension}>Sign in</button
						>
						<span>or continue below to create a new account</span>
					</div>
				{/if}

				{#if state === 'error'}
					<p
						class="mt-5 max-w-5xl break-words rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-800"
					>
						{error}
					</p>
				{/if}

				<div class="mt-8 flex max-w-5xl flex-wrap items-center gap-5">
					<button
						type="button"
						class="inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-emerald-950 px-7 text-base font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!canCreate ||
							state === 'finding-profile' ||
							state === 'creating-account' ||
							state === 'creating-relay'}
						on:click={createCommunity}
					>
						{#if state === 'finding-profile' || state === 'creating-account' || state === 'creating-relay'}
							<span class="animate-spin">
								<Loader2 size={18} />
							</span>
							{state === 'finding-profile'
								? 'Finding profile'
								: state === 'creating-account'
									? 'Creating account'
									: 'Creating community'}
						{:else}
							Create community
							<ArrowRight size={20} />
						{/if}
					</button>
					<p class="max-w-sm text-sm font-semibold leading-6 text-stone-500">
						You'll be able to invite members and customize more after creation.
					</p>
				</div>
			</section>
		{/if}

		<aside
			class="mx-auto hidden w-full max-w-[420px] px-6 pb-10 pt-6 xl:sticky xl:top-6 xl:block xl:w-[390px] xl:px-0 2xl:w-[420px] 2xl:self-start"
			aria-label="Community preview"
		>
			<div
				class="w-full min-w-0 rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm shadow-stone-950/5"
			>
				<p class="inline-flex items-center gap-2 text-sm font-black text-[#171614]">
					<span class="h-2.5 w-2.5 rounded-full bg-emerald-600"></span>
					Live preview
				</p>
				<div
					class="mt-4 w-full min-w-0 overflow-hidden rounded-2xl bg-[#fbf7ef] shadow-lg shadow-stone-950/10"
				>
					<div class="grid justify-items-center bg-emerald-950 px-8 py-12 text-center text-white">
						<div
							class="grid h-32 w-32 place-items-center rounded-2xl bg-[#e4ead7] text-[#171614] shadow-lg shadow-black/15"
						>
							{#if communityImage}
								<img class="h-32 w-32 rounded-2xl object-cover" src={communityImage} alt="" />
							{:else}
								<UserRound size={40} />
							{/if}
						</div>
						<h2 class="mt-6 max-w-full break-words text-3xl font-black">
							{displayCommunityName || 'New community'}
						</h2>
						<p class="mt-2 max-w-full break-words text-base font-semibold leading-7 text-white/70">
							{displayCommunityDescription || 'A home for your people.'}
						</p>
						<div class="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-8 text-white/85">
							<span class="text-lg font-black"
								><UsersRound class="mx-auto mb-1" size={18} />0<br /><small
									class="text-sm font-semibold text-white/55">Members</small
								></span
							>
							<span class="h-12 w-px bg-white/10"></span>
							<span class="text-lg font-black"
								><CalendarDays class="mx-auto mb-1" size={18} />0<br /><small
									class="text-sm font-semibold text-white/55">Events</small
								></span
							>
						</div>
					</div>
					<div class="p-6">
						<p class="break-words text-base font-semibold leading-7 text-[#171614]">
							{displayCommunityDescription ||
								'A community for people to meet, share, organize and grow together.'}
						</p>
						<hr class="my-6 border-stone-200" />
						<h3 class="text-sm font-black text-stone-500">What members can do</h3>
						<ul class="mt-5 grid gap-5">
							<li class="flex gap-3 text-sm">
								<CheckCircle2 class="mt-1 shrink-0 text-emerald-800" size={17} />
								<span
									><strong class="block text-base">Join and connect</strong>Find your people.</span
								>
							</li>
							<li class="flex gap-3 text-sm">
								<CheckCircle2 class="mt-1 shrink-0 text-emerald-800" size={17} />
								<span
									><strong class="block text-base">Share and discuss</strong>Posts, polls, events
									and more.</span
								>
							</li>
							<li class="flex gap-3 text-sm">
								<CheckCircle2 class="mt-1 shrink-0 text-emerald-800" size={17} />
								<span
									><strong class="block text-base">Organize events</strong>Meetups, trainings,
									workshops...</span
								>
							</li>
							<li class="flex gap-3 text-sm">
								<CheckCircle2 class="mt-1 shrink-0 text-emerald-800" size={17} />
								<span
									><strong class="block text-base">Grow together</strong>Build something meaningful.</span
								>
							</li>
						</ul>
						<button
							class="mt-8 flex w-full items-center justify-between rounded-xl bg-[#e4ead7] px-6 py-4 font-black text-[#171614] transition hover:bg-[#d9e2c6] active:scale-[0.98]"
							type="button">Join community <UsersRound size={22} /></button
						>
					</div>
				</div>
			</div>
		</aside>
	</section>
</main>
