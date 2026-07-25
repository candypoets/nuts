<script lang="ts">
	import {
		extractTagValue,
		type Kind10002Parsed,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind10002, asParsedEvent, fbArray } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { onDestroy } from 'svelte';

	import { key, kind10002Ready, lastNotificationView, relayDirectoryUrls } from 'src/controller';
	import {
		fetchCommunityAccess,
		fetchCommunityTrust,
		type CommunityTrust
	} from 'src/lib/adminAccess';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';
	import { isBadgeStatus } from 'src/routes/notifications/notifications';

	let missed = 0;
	let socialUnsubscribe: (() => void) | undefined;
	let badgeUnsubscribe: (() => void) | undefined;
	let destroyed = false;
	let badgeSubscriptionKey = '';
	let badgeGeneration = 0;
	let seenEventIds = new Set<string>();
	let trustPromises = new Map<string, Promise<CommunityTrust>>();
	let authorizationPromises = new Map<string, Promise<boolean>>();
	const nav = usePagerNavigation();

	function openNotifications() {
		nav ? nav.root('notifications') : go('notifications');
	}

	kind10002Ready.promise.then((result) => {
		if (destroyed || !$key?.pub) return;
		const kind10002 = asKind10002(result) as Kind10002Parsed;
		socialUnsubscribe = useSubscription(
			'notifications',
			[
				{
					kinds: [1, 7, 6],
					tags: { '#p': [$key?.pub] },
					limit: 100,
					relays:
						fbArray(kind10002, 'relays')
							?.filter((r) => r.write() == true)
							.map((r) => r.url())
							.filter((relay): relay is string => Boolean(relay)) || []
				}
			],
			(message: WorkerMessage) => {
				const parsedEvent = asParsedEvent(message);
				if (parsedEvent) markUnread(parsedEvent);
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

	function signerAuthorization(relay: string, signer: string) {
		const cacheKey = `${relay}:${signer}`;
		let authorization = authorizationPromises.get(cacheKey);
		if (!authorization) {
			authorization = trustForRelay(relay).then(async (trust) => {
				if (trust.authorityPubkeys.has(signer)) return true;
				const access = await fetchCommunityAccess(relay, signer, false);
				return access.permissions.has('store') || access.permissions.has('events');
			});
			authorizationPromises.set(cacheKey, authorization);
		}
		return authorization;
	}

	function markUnread(event: ParsedEvent) {
		const id = event.id();
		if (!id || seenEventIds.has(id) || event.createdAt() <= $lastNotificationView / 1000) return;
		seenEventIds.add(id);
		missed = seenEventIds.size;
	}

	async function handleBadgeEvent(event: ParsedEvent, generation: number, pubkey: string) {
		const recipient = extractTagValue(event, 'p');
		const signer = event.pubkey();
		const address = extractTagValue(event, 'a');
		if (recipient !== pubkey || !signer || !address?.startsWith('30009:')) return;

		if (event.kind() === 8) {
			const trusted = await Promise.all(
				badgeRelays.map(async (relay) => {
					const trust = await trustForRelay(relay);
					return trust.authorityPubkeys.has(signer) || trust.badgeIssuer === signer;
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
			event.kind() !== 27237 ||
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
					kinds: [27237],
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
