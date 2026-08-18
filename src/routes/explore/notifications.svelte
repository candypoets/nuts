<script lang="ts">
	import {
		extractTagValue,
		type Kind10002Parsed,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind10002,
		asParsedEvent,
		ConnectionTracker,
		fbArray
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { onDestroy } from 'svelte';

	import { key, kind10002Ready, lastNotificationView, relayDirectoryUrls } from 'src/controller';
	import {
		shouldShowLiveNotificationToast,
		showNotificationToast
	} from 'src/controller/notificationToast';
	import {
		canDo,
		fetchCommunityAccess,
		fetchCommunityTrust,
		type CommunityTrust
	} from 'src/lib/adminAccess';
	import { isDefinitionAddress } from 'src/lib/nip97';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';
	import {
		BADGE_STATUS_KIND,
		isBadgeStatus,
		notificationRelayHints,
		processNotifications,
		type ProcessedNotification
	} from 'src/routes/notifications/notifications';

	let missed = 0;
	let socialUnsubscribe: (() => void) | undefined;
	let badgeUnsubscribe: (() => void) | undefined;
	let destroyed = false;
	let badgeSubscriptionKey = '';
	let badgeGeneration = 0;
	let seenEventIds = new Set<string>();
	let toastedEventIds = new Set<string>();
	let socialEoseReceived = false;
	let socialSubscriptionStartedAt = 0;
	const socialConnectionTracker = new ConnectionTracker();
	let trustPromises = new Map<string, Promise<CommunityTrust>>();
	let authorizationPromises = new Map<string, Promise<boolean>>();
	const nav = usePagerNavigation();

	function openNotifications() {
		nav ? nav.root('notifications') : go('notifications');
	}

	kind10002Ready.promise.then((result) => {
		if (destroyed || !$key?.pub) return;
		const kind10002 = asKind10002(result) as Kind10002Parsed;
		const socialRelays =
			fbArray(kind10002, 'relays')
				?.filter((relay) => relay.write() === true)
				.map((relay) => relay.url())
				.filter((relay): relay is string => Boolean(relay)) || [];
		socialConnectionTracker.reset();
		socialEoseReceived = false;
		socialSubscriptionStartedAt = Math.floor(Date.now() / 1000);
		toastedEventIds.clear();
		socialUnsubscribe = useSubscription(
			'notifications',
			[
				{
					kinds: [1, 7, 6],
					tags: { '#p': [$key?.pub] },
					limit: 100,
					relays: socialRelays
				}
			],
			(message: WorkerMessage) => {
				const status = asConnectionStatus(message);
				if (status) {
					socialConnectionTracker.handleMessage(message);
					if (socialConnectionTracker.resolutionRate > 0.5) {
						socialEoseReceived = true;
					}
					return;
				}

				const parsedEvent = asParsedEvent(message);
				if (!parsedEvent) return;

				markUnread(parsedEvent);
				if (
					shouldShowLiveNotificationToast(
						parsedEvent.createdAt(),
						socialSubscriptionStartedAt,
						socialEoseReceived
					)
				) {
					showSocialToast(parsedEvent, socialRelays);
				}
			}
		);
	});

	function normalizedRelay(relay: string) {
		try {
			return normalizeURL(relay);
		} catch {
			return '';
		}
	}

	$: badgeRelays = Array.from(
		new Set(($relayDirectoryUrls || []).map(normalizedRelay).filter(Boolean))
	);
	$: nextBadgeSubscriptionKey =
		$key?.pub && badgeRelays.length ? `${$key.pub}:${badgeRelays.join('|')}` : '';

	function trustForRelay(relay: string) {
		let trust = trustPromises.get(relay);
		if (!trust) {
			trust = fetchCommunityTrust(relay);
			trustPromises.set(relay, trust);
		}
		return trust;
	}

	/** 37237 status signers: anchor admins, the badge issuer, or 37237-write holders. */
	function signerAuthorization(relay: string, signer: string) {
		const cacheKey = `${relay}:${signer}`;
		let authorization = authorizationPromises.get(cacheKey);
		if (!authorization) {
			authorization = trustForRelay(relay).then(async (trust) => {
				if (trust.admins.has(signer) || trust.badgeIssuer === signer) return true;
				const access = await fetchCommunityAccess(relay, signer, false);
				return canDo(access, '37237', 'write');
			});
			authorizationPromises.set(cacheKey, authorization);
		}
		return authorization;
	}

	function toastContent(notification: ProcessedNotification) {
		switch (notification.type) {
			case 'reply':
				return {
					title: 'New reply',
					message: 'Someone replied to your post'
				};
			case 'mention':
				return {
					title: 'New mention',
					message: 'You were mentioned in a post'
				};
			case 'reaction':
				return {
					title: 'New reaction',
					message: 'Someone reacted to your post'
				};
			case 'repost':
				return {
					title: 'New repost',
					message: 'Someone reposted your post'
				};
		}
	}

	function showSocialToast(event: ParsedEvent, relays: string[]) {
		const notification = processNotifications([event])[0];
		const id = event.id();
		if (!notification || !id || toastedEventIds.has(id)) return;

		const targetEventId =
			notification.type === 'reply' || notification.type === 'mention'
				? id
				: notification.parsed.referencedPostId;
		if (!targetEventId) return;
		toastedEventIds.add(id);

		showNotificationToast({
			id,
			...toastContent(notification),
			targetEventId,
			relays: notificationRelayHints(notification, relays)
		});
	}

	function markUnread(event: ParsedEvent) {
		const id = event.id();
		if (!id || seenEventIds.has(id) || event.createdAt() <= $lastNotificationView / 1000) {
			return false;
		}
		seenEventIds.add(id);
		missed = seenEventIds.size;
		return true;
	}

	async function handleBadgeEvent(event: ParsedEvent, generation: number, pubkey: string) {
		const recipient = extractTagValue(event, 'p');
		const signer = event.pubkey();
		const address = extractTagValue(event, 'a');
		if (recipient !== pubkey || !signer || !isDefinitionAddress(address || '')) return;

		if (event.kind() === 8) {
			const trusted = await Promise.all(
				badgeRelays.map(async (relay) => {
					const trust = await trustForRelay(relay);
					return trust.admins.has(signer) || trust.badgeIssuer === signer;
				})
			);
			if (generation === badgeGeneration && trusted.some(Boolean)) {
				markUnread(event);
			}
			return;
		}

		const order = extractTagValue(event, 'order');
		const eventContext = extractTagValue(event, 'event');
		if (
			event.kind() !== BADGE_STATUS_KIND ||
			!extractTagValue(event, 'e') ||
			!isBadgeStatus(extractTagValue(event, 'status')) ||
			Boolean(order) === Boolean(eventContext)
		) {
			return;
		}
		const authorized = await Promise.all(
			badgeRelays.map((relay) => signerAuthorization(relay, signer))
		);
		if (authorized.some(Boolean) && generation === badgeGeneration) {
			markUnread(event);
		}
	}

	function subscribeBadges() {
		badgeUnsubscribe?.();
		badgeUnsubscribe = undefined;
		badgeSubscriptionKey = nextBadgeSubscriptionKey;
		const pubkey = $key?.pub;
		const generation = ++badgeGeneration;
		if (!pubkey || !badgeRelays.length) return;

		badgeUnsubscribe = useSubscription(
			`notification_badge_indicator_${pubkey}`,
			[
				{
					kinds: [8],
					tags: { '#p': [pubkey] },
					limit: 100,
					relays: badgeRelays,
					cacheFirst: true
				},
				{
					kinds: [BADGE_STATUS_KIND],
					tags: { '#p': [pubkey] },
					limit: 100,
					relays: badgeRelays,
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const event = asParsedEvent(message);
				if (event) void handleBadgeEvent(event, generation, pubkey);
			},
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	$: if (nextBadgeSubscriptionKey !== badgeSubscriptionKey) {
		subscribeBadges();
	}

	$: if ($lastNotificationView > Date.now() - 1000) {
		missed = 0;
		seenEventIds = new Set();
	}

	onDestroy(() => {
		destroyed = true;
		socialUnsubscribe?.();
		badgeUnsubscribe?.();
	});
</script>

<button
	type="button"
	class="indicator cursor-pointer"
	aria-label="Open notifications"
	on:click|stopPropagation={openNotifications}
>
	<div
		class="w-2 h-2 bg-accent rounded-full indicator-item indicator-center"
		class:hidden={!missed}
	></div>

	<Icon icon="mdi:bell-outline" class="text-2xl mr-2" />
</button>
