<script lang="ts">
	import { extractTagValue, type ParsedEvent, type WorkerMessage } from '@candypoets/nipworker';
	import { useSignEvent, useSubscription } from '@candypoets/nipworker/hooks';
	import { isParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import type { NostrEvent } from 'nostr-tools';
	import { decode, type EventPointer } from 'nostr-tools/nip19';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key, relayDirectoryUrls } from 'src/controller';
	import {
		fetchCommunityAccess,
		fetchCommunityTrust,
		type CommunityTrust
	} from 'src/lib/adminAccess';
	import {
		badgeDefinitionHasTypeTopic,
		catalogCurrency,
		catalogDescription,
		catalogEventAddress,
		catalogImage,
		catalogMaxUses,
		catalogName,
		catalogPrice,
		catalogProductKind,
		catalogUsesQrFulfillment,
		isBadgeDefinitionType,
		type BadgeDefinitionType
	} from 'src/lib/catalog';
	import { encodePresentation, entitlementPresentationTemplate } from 'src/lib/presentation';
	import { go } from 'src/routes/modals/modal';
	import type { BadgeStatus } from 'src/routes/notifications/notifications';
	import {
		BADGE_STATUS_KIND,
		isBadgeStatus
	} from 'src/routes/notifications/notifications';
	import { onDestroy, onMount } from 'svelte';

	export let nevent: string;
	export let visible = true;
	export let goBack: () => void;

	let pointer = { id: '', relays: [] } as EventPointer;
	let award: ParsedEvent | undefined;
	let definition: ParsedEvent | undefined;
	let referencedEvent: ParsedEvent | undefined;
	let rawStatuses: ParsedEvent[] = [];
	let statuses: ParsedEvent[] = [];
	let trustedRelays: string[] = [];
	let loading = true;
	let error = '';
	let mounted = false;
	let activeSubscriptionKey = '';
	let generation = 0;
	let awardUnsubscribe: (() => void) | undefined;
	let definitionUnsubscribe: (() => void) | undefined;
	let eventUnsubscribe: (() => void) | undefined;
	let loadingTimeout: ReturnType<typeof setTimeout> | undefined;
	let trustPromises = new Map<string, Promise<CommunityTrust>>();
	let authorizationPromises = new Map<string, Promise<boolean>>();
	let awardAcceptanceInFlight = new Set<string>();
	let statusAuthorizationInFlight = new Set<string>();
	let signingQr = false;
	let qrError = '';

	$: {
		try {
			const decoded = decode(nevent) as unknown as { type: string; data: EventPointer };
			pointer =
				decoded.type === 'nevent'
					? decoded.data
					: ({ id: '', relays: [] } as unknown as EventPointer);
		} catch {
			pointer = { id: '', relays: [] } as unknown as EventPointer;
		}
	}

	$: relays = Array.from(
		new Set(
			[...(pointer.relays || []), ...($relayDirectoryUrls || [])]
				.map(normalizedRelay)
				.filter(Boolean)
		)
	);
	$: subscriptionKey = `${$key?.pub || ''}:${pointer.id}:${relays.join('|')}`;
	$: orderedStatuses = [...statuses].sort(
		(left, right) =>
			left.createdAt() - right.createdAt() || (left.id() || '').localeCompare(right.id() || '')
	);
	$: latestStatus = [...statuses].sort(
		(left, right) =>
			right.createdAt() - left.createdAt() || (left.id() || '').localeCompare(right.id() || '')
	)[0];
	$: if (mounted && visible && subscriptionKey !== activeSubscriptionKey) {
		subscribe();
	}
	$: if (mounted && !visible && activeSubscriptionKey) {
		generation += 1;
		activeSubscriptionKey = '';
		cleanupSubscriptions();
	}

	function normalizedRelay(relay: string) {
		try {
			return normalizeURL(relay);
		} catch {
			return '';
		}
	}

	function definitionCoordinate(event: ParsedEvent | undefined) {
		const address = event ? extractTagValue(event, 'a') || '' : '';
		const [kind, author, ...identifierParts] = address.split(':');
		const identifier = identifierParts.join(':');
		if (kind !== '30009' || !author || !identifier) return undefined;
		return { address, author, identifier };
	}

	function addressCoordinate(address: string) {
		const [kindValue, author, ...identifierParts] = address.split(':');
		const kind = Number(kindValue);
		const identifier = identifierParts.join(':');
		if (!kind || !author || !identifier) return undefined;
		return { kind, author, identifier };
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

	function definitionAuthorization(relay: string, author: string, type: BadgeDefinitionType) {
		if (type === 'role') {
			return trustForRelay(relay).then((trust) => trust.authorityPubkeys.has(author));
		}
		return signerAuthorization(relay, author, type === 'event_access' ? 'events' : 'store');
	}

	async function acceptAward(event: ParsedEvent, currentGeneration: number) {
		const eventId = event.id();
		const address = extractTagValue(event, 'a');
		const issuer = event.pubkey();
		if (
			event.kind() !== 8 ||
			!eventId ||
			eventId !== pointer.id ||
			extractTagValue(event, 'p') !== $key?.pub ||
			!address?.startsWith('30009:') ||
			!issuer ||
			awardAcceptanceInFlight.has(eventId)
		) {
			return;
		}
		if (award?.id() === eventId) return;

		awardAcceptanceInFlight.add(eventId);
		try {
			const acceptedRelays = (
				await Promise.all(
					relays.map(async (relay) => {
						const trust = await trustForRelay(relay);
						return trust.authorityPubkeys.has(issuer) || trust.badgeIssuer === issuer ? relay : '';
					})
				)
			).filter(Boolean);
			if (currentGeneration !== generation || !acceptedRelays.length) return;
			trustedRelays = acceptedRelays;
			award = event;
			subscribeDefinition(currentGeneration);
			reconcileStatuses(currentGeneration);
		} finally {
			awardAcceptanceInFlight.delete(eventId);
		}
	}

	function subscribeDefinition(currentGeneration: number) {
		definitionUnsubscribe?.();
		definitionUnsubscribe = undefined;
		const coordinate = definitionCoordinate(award);
		if (!coordinate || !relays.length) return;

		definitionUnsubscribe = useSubscription(
			`badge_detail_definition_${pointer.id}_${currentGeneration}`,
			[
				{
					kinds: [30009],
					authors: [coordinate.author],
					tags: { '#d': [coordinate.identifier] },
					limit: 20,
					relays,
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (event) void acceptDefinition(event, currentGeneration);
			},
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	async function acceptDefinition(event: ParsedEvent, currentGeneration: number) {
		const coordinate = definitionCoordinate(award);
		const type = extractTagValue(event, 'type');
		if (
			!coordinate ||
			event.kind() !== 30009 ||
			event.pubkey() !== coordinate.author ||
			extractTagValue(event, 'd') !== coordinate.identifier ||
			!isBadgeDefinitionType(type) ||
			!badgeDefinitionHasTypeTopic(event, type)
		) {
			return;
		}
		const authorized = await Promise.all(
			trustedRelays.map((relay) => definitionAuthorization(relay, coordinate.author, type))
		);
		if (currentGeneration !== generation || !authorized.some(Boolean)) return;
		if (
			definition &&
			(event.createdAt() < definition.createdAt() ||
				(event.createdAt() === definition.createdAt() &&
					(event.id() || '') >= (definition.id() || '')))
		) {
			return;
		}
		definition = event;
		loading = false;
		error = '';
		if (loadingTimeout) clearTimeout(loadingTimeout);
		reconcileStatuses(currentGeneration);
		subscribeReferencedEvent(currentGeneration);
	}

	function subscribeReferencedEvent(currentGeneration: number) {
		eventUnsubscribe?.();
		eventUnsubscribe = undefined;
		referencedEvent = undefined;
		if (badgeType(definition) !== 'event_access' || !definition) return;
		const coordinate = addressCoordinate(extractTagValue(definition, 'a') || '');
		if (!coordinate) return;
		eventUnsubscribe = useSubscription(
			`badge_detail_event_${pointer.id}_${currentGeneration}`,
			[
				{
					kinds: [coordinate.kind],
					authors: [coordinate.author],
					tags: { '#d': [coordinate.identifier] },
					limit: 10,
					relays,
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (
					!event ||
					currentGeneration !== generation ||
					event.kind() !== coordinate.kind ||
					event.pubkey() !== coordinate.author ||
					extractTagValue(event, 'd') !== coordinate.identifier
				) {
					return;
				}
				if (
					!referencedEvent ||
					event.createdAt() > referencedEvent.createdAt() ||
					(event.createdAt() === referencedEvent.createdAt() &&
						(event.id() || '') < (referencedEvent.id() || ''))
				) {
					referencedEvent = event;
				}
			},
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	function acceptRawStatus(event: ParsedEvent, currentGeneration: number) {
		const eventId = event.id();
		if (
			currentGeneration !== generation ||
			event.kind() !== BADGE_STATUS_KIND ||
			!eventId ||
			extractTagValue(event, 'e') !== pointer.id ||
			extractTagValue(event, 'p') !== $key?.pub ||
			!extractTagValue(event, 'a') ||
			!isBadgeStatus(extractTagValue(event, 'status')) ||
			Boolean(extractTagValue(event, 'order')) === Boolean(extractTagValue(event, 'event')) ||
			rawStatuses.some((candidate) => candidate.id() === eventId)
		) {
			return;
		}
		rawStatuses = [...rawStatuses, event];
		reconcileStatuses(currentGeneration);
	}

	function reconcileStatuses(currentGeneration: number) {
		const coordinate = definitionCoordinate(award);
		const type = badgeType(definition);
		if (!award || !definition || !coordinate || type === 'membership' || type === 'role') return;
		const permission = type === 'event_access' ? 'events' : 'store';
		for (const event of rawStatuses) {
			const eventId = event.id();
			const signer = event.pubkey();
			if (
				!eventId ||
				!signer ||
				extractTagValue(event, 'a') !== coordinate.address ||
				statuses.some((candidate) => candidate.id() === eventId)
			) {
				continue;
			}
			const authorizationKey = `${currentGeneration}:${eventId}`;
			if (statusAuthorizationInFlight.has(authorizationKey)) continue;
			statusAuthorizationInFlight.add(authorizationKey);
			void Promise.all(
				trustedRelays.map((relay) => signerAuthorization(relay, signer, permission))
			).then((authorized) => {
				statusAuthorizationInFlight.delete(authorizationKey);
				if (
					currentGeneration !== generation ||
					!authorized.some(Boolean) ||
					statuses.some((candidate) => candidate.id() === eventId)
				) {
					return;
				}
				statuses = [...statuses, event];
			});
		}
	}

	function handleBadgeMessage(message: WorkerMessage, currentGeneration: number) {
		const event = isParsedEvent(message);
		if (!event) return;
		if (event.kind() === 8) {
			void acceptAward(event, currentGeneration);
		} else if (event.kind() === BADGE_STATUS_KIND) {
			acceptRawStatus(event, currentGeneration);
		}
	}

	function cleanupSubscriptions() {
		awardUnsubscribe?.();
		definitionUnsubscribe?.();
		eventUnsubscribe?.();
		awardUnsubscribe = undefined;
		definitionUnsubscribe = undefined;
		eventUnsubscribe = undefined;
		if (loadingTimeout) clearTimeout(loadingTimeout);
	}

	function subscribe() {
		cleanupSubscriptions();
		activeSubscriptionKey = subscriptionKey;
		const currentGeneration = ++generation;
		award = undefined;
		definition = undefined;
		referencedEvent = undefined;
		rawStatuses = [];
		statuses = [];
		trustedRelays = [];
		trustPromises = new Map();
		authorizationPromises = new Map();
		awardAcceptanceInFlight.clear();
		statusAuthorizationInFlight.clear();
		error = '';
		loading = true;

		if (!pointer.id || !$key?.pub || !relays.length) {
			loading = false;
			error = 'This badge link is incomplete.';
			return;
		}

		awardUnsubscribe = useSubscription(
			`badge_detail_${pointer.id}_${currentGeneration}`,
			[
				{
					kinds: [8],
					ids: [pointer.id],
					limit: 1,
					relays,
					cacheFirst: true
				},
				{
					kinds: [BADGE_STATUS_KIND],
					tags: { '#e': [pointer.id], '#p': [$key.pub] },
					limit: 200,
					relays,
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => handleBadgeMessage(message, currentGeneration),
			{ bytesPerEvent: 10 * 1024 }
		);

		loadingTimeout = setTimeout(() => {
			if (currentGeneration !== generation || definition) return;
			loading = false;
			error = award
				? 'The badge definition could not be loaded.'
				: 'This badge could not be found on your community relays.';
		}, 10000);
	}

	function badgeType(event: ParsedEvent | undefined): BadgeDefinitionType | undefined {
		const type = event ? extractTagValue(event, 'type') : undefined;
		return isBadgeDefinitionType(type) ? type : undefined;
	}

	function pageTitle(event: ParsedEvent | undefined) {
		const type = badgeType(event);
		if (type === 'product') return 'Purchase details';
		if (type === 'membership') return 'Membership';
		if (type === 'event_access') return 'Ticket';
		if (type === 'pass') return 'Pass';
		if (type === 'role') return 'Role';
		return 'Badge';
	}

	function typeIcon(event: ParsedEvent | undefined) {
		const type = badgeType(event);
		if (type === 'membership') return 'mdi:account-group';
		if (type === 'event_access') return 'mdi:ticket-confirmation';
		if (type === 'pass') return 'mdi:badge-account';
		if (type === 'role') return 'mdi:shield-account';
		if (!event) return 'mdi:medal-outline';
		const productKind = catalogProductKind(event);
		if (productKind === 'food' || productKind === 'drink') return 'mdi:food';
		if (productKind === 'merchandise') return 'mdi:package-variant';
		return 'mdi:shopping';
	}

	function expirationLabel() {
		const expiration = Number(award ? extractTagValue(award, 'expiration') || 0 : 0);
		if (!expiration) return 'No expiration';
		const date = formatDate(expiration);
		return expiration <= Math.floor(Date.now() / 1000) ? `Expired ${date}` : `Expires ${date}`;
	}

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(timestamp * 1000));
	}

	function formatPrice(event: ParsedEvent) {
		const price = catalogPrice(event);
		const currency = catalogCurrency(event);
		if (!price || !currency) return '';
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency
			}).format(Number(price));
		} catch {
			return `${price} ${currency}`;
		}
	}

	function visibleDescription(event: ParsedEvent) {
		const description = catalogDescription(event);
		return description.toLocaleLowerCase() === catalogName(event).toLocaleLowerCase()
			? ''
			: description;
	}

	function statusValue(event: ParsedEvent | undefined) {
		const value = event ? extractTagValue(event, 'status') : undefined;
		return isBadgeStatus(value) ? value : undefined;
	}

	function displayStatus(
		badgeDefinition: ParsedEvent | undefined,
		statusEvent: ParsedEvent | undefined
	) {
		const type = badgeType(badgeDefinition);
		const status = statusValue(statusEvent);
		if (type === 'membership')
			return expirationLabel().startsWith('Expired') ? 'Expired' : 'Active';
		if (type === 'role') return 'Granted';
		if (type === 'pass' && status !== 'cancelled') return remainingUsesLabel(badgeDefinition);
		if (!status) {
			if (type === 'product') return 'Order received';
			if (type === 'event_access') return 'Ticket available';
			return 'Available';
		}
		if (status === 'pending') return type === 'product' ? 'Order received' : 'Pending';
		if (status === 'accepted') return 'Accepted';
		if (status === 'processing') return 'Preparing';
		if (status === 'ready') return 'Ready';
		if (status === 'cancelled') return 'Cancelled';
		if (type === 'event_access') return 'Checked in';
		const productKind = badgeDefinition ? catalogProductKind(badgeDefinition) : undefined;
		if (productKind === 'food' || productKind === 'drink') return 'Served';
		if (productKind === 'merchandise') return 'Collected';
		return 'Fulfilled';
	}

	function latestByContext() {
		const latest = new Map<string, ParsedEvent>();
		for (const event of statuses) {
			const order = extractTagValue(event, 'order');
			const eventContext = extractTagValue(event, 'event');
			const context = order ? `order:${order}` : `event:${eventContext}`;
			const current = latest.get(context);
			if (
				!current ||
				event.createdAt() > current.createdAt() ||
				(event.createdAt() === current.createdAt() && (event.id() || '') < (current.id() || ''))
			) {
				latest.set(context, event);
			}
		}
		return Array.from(latest.values());
	}

	function remainingUsesLabel(event: ParsedEvent | undefined) {
		if (!event) return 'Available';
		const maxUses = catalogMaxUses(event);
		if (!maxUses) return 'Unlimited uses';
		const fulfilled = latestByContext().filter(
			(status) => statusValue(status) === 'fulfilled'
		).length;
		const remaining = Math.max(0, maxUses - fulfilled);
		return `${remaining} ${remaining === 1 ? 'use' : 'uses'} remaining`;
	}

	function statusTimelineLabel(status: BadgeStatus | undefined, event: ParsedEvent) {
		if (!status) return 'Status updated';
		if (status === 'pending') return 'Order received';
		if (badgeType(definition) === 'pass' && status === 'fulfilled') return 'Pass used';
		return displayStatus(definition, event);
	}

	function communityLabel() {
		const relay = trustedRelays[0] || relays[0];
		if (!relay) return '';
		try {
			return new URL(relay.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')).host;
		} catch {
			return relay;
		}
	}

	function eventTitle() {
		if (!referencedEvent) return '';
		return (
			extractTagValue(referencedEvent, 'title') || extractTagValue(referencedEvent, 'name') || ''
		);
	}

	function orderReference() {
		const statusOrder = latestStatus ? extractTagValue(latestStatus, 'order') || '' : '';
		if (statusOrder) return statusOrder;
		if (!award) return '';

		const awardOrder = extractTagValue(award, 'order') || '';
		if (awardOrder) return awardOrder;

		const redemptionReference = extractTagValue(award, 'i') || '';
		const redemptionPrefix = 'payment-redemption:';
		return redemptionReference.startsWith(redemptionPrefix)
			? redemptionReference.slice(redemptionPrefix.length)
			: '';
	}

	function redemptionQrLabel() {
		const type = badgeType(definition);
		if (type === 'event_access') return 'Show ticket QR';
		if (type === 'pass' || type === 'membership') return 'Show check-in QR';
		const productKind = definition ? catalogProductKind(definition) : undefined;
		if (productKind === 'food' || productKind === 'drink') return 'Show serving QR';
		return 'Show pickup QR';
	}

	function canPresentEntitlement() {
		if (!award || !definition || !$key?.pub || $key.hasSigner === false) return false;
		const type = badgeType(definition);
		if (type === 'role') return false;
		if (expirationLabel().startsWith('Expired')) return false;
		if (type === 'product') {
			if (!catalogUsesQrFulfillment(definition)) return false;
			const status = statusValue(latestStatus);
			return Boolean(orderReference() && status !== 'fulfilled' && status !== 'cancelled');
		}
		if (type === 'event_access') {
			return Boolean(catalogEventAddress(definition) && statusValue(latestStatus) !== 'fulfilled');
		}
		if (type === 'pass') {
			const maxUses = catalogMaxUses(definition);
			if (!maxUses) return true;
			return (
				latestByContext().filter((status) => statusValue(status) === 'fulfilled').length < maxUses
			);
		}
		return type === 'membership';
	}

	function showEntitlementQr() {
		if (!canPresentEntitlement() || !award || !definition || signingQr) return;
		const awardId = award.id();
		const badgeAddress = extractTagValue(award, 'a');
		const community = trustedRelays[0] || relays[0];
		const type = badgeType(definition);
		if (!awardId || !badgeAddress || !community || !type) return;

		const eventAddress = type === 'event_access' ? catalogEventAddress(definition) : undefined;
		const orderId =
			type === 'product'
				? orderReference()
				: type === 'pass' || type === 'membership'
					? `use:${crypto.randomUUID()}`
					: undefined;
		qrError = '';
		signingQr = true;
		try {
			const template = entitlementPresentationTemplate({
				awardId,
				badgeAddress,
				community,
				orderId,
				eventAddress
			});
			useSignEvent(template, (signed) => {
				try {
					const event = (typeof signed === 'string' ? JSON.parse(signed) : signed) as NostrEvent;
					go(`qr:${encodeURIComponent(encodePresentation(event))}`);
				} catch {
					qrError = 'Could not create the QR presentation.';
				} finally {
					signingQr = false;
				}
			});
		} catch (error) {
			qrError = error instanceof Error ? error.message : 'Could not create the QR presentation.';
			signingQr = false;
		}
	}

	function tagValues(event: ParsedEvent, name: string) {
		const values: string[] = [];
		for (let index = 0; index < event.tagsLength(); index += 1) {
			const tag = event.tags(index);
			if (tag?.items(0) === name && tag.items(1)) values.push(tag.items(1));
		}
		return values;
	}

	onMount(() => {
		mounted = true;
		if (visible) subscribe();
	});

	onDestroy(() => {
		generation += 1;
		cleanupSubscriptions();
	});
</script>

<div class="h-screen overflow-y-auto bg-base-300" data-scroll-container aria-busy={loading}>
	<header
		class="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-base-200 bg-base-300/90 px-4 pt-safe backdrop-blur-gpu"
	>
		<button type="button" class="btn btn-sm btn-circle" on:click={goBack} aria-label="Back">
			<Icon icon="mdi:arrow-left" class="text-xl" />
		</button>
		<h1 class="text-lg font-semibold">{pageTitle(definition)}</h1>
		<span class="w-8"></span>
	</header>

	<main class="mx-auto w-full max-w-2xl p-4 pb-safe">
		{#if loading}
			<div class="flex min-h-64 flex-col items-center justify-center text-base-content/60">
				<span class="loading loading-spinner loading-md"></span>
				<p class="mt-4 text-sm font-semibold">Loading badge details…</p>
			</div>
		{:else if error || !award || !definition}
			<div class="rounded-2xl border border-error/25 bg-error/10 p-5 text-error">
				<p class="font-bold">Could not load this badge</p>
				<p class="mt-2 text-sm">{error || 'The badge is unavailable.'}</p>
			</div>
		{:else}
			<section class="overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-widget">
				{#if catalogImage(definition)}
					<img
						src={catalogImage(definition)}
						alt=""
						class="h-56 w-full object-cover"
						loading="lazy"
					/>
				{/if}

				<div class="p-5">
					<div class="flex items-start gap-4">
						<div
							class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"
						>
							<Icon icon={typeIcon(definition)} class="text-2xl" />
						</div>
						<div class="min-w-0 flex-1">
							<h2 class="text-2xl font-bold">{catalogName(definition)}</h2>
							<p class="mt-1 text-sm font-semibold text-primary">
								{displayStatus(definition, latestStatus)}
							</p>
						</div>
					</div>

					{#if visibleDescription(definition)}
						<p class="mt-5 whitespace-pre-line text-sm leading-6 text-base-content/70">
							{visibleDescription(definition)}
						</p>
					{/if}

					{#if badgeType(definition) === 'event_access' && referencedEvent}
						<div class="mt-5 rounded-xl bg-base-200/70 p-4">
							<p class="text-xs font-bold uppercase tracking-wide text-base-content/50">Event</p>
							<p class="mt-1 font-bold">{eventTitle() || catalogName(definition)}</p>
							{#if Number(extractTagValue(referencedEvent, 'start'))}
								<p class="mt-2 text-sm text-base-content/70">
									{formatDate(Number(extractTagValue(referencedEvent, 'start')))}
								</p>
							{/if}
							{#if extractTagValue(referencedEvent, 'location')}
								<p class="mt-1 text-sm text-base-content/70">
									{extractTagValue(referencedEvent, 'location')}
								</p>
							{/if}
						</div>
					{/if}

					<div class="mt-5 grid gap-3 rounded-xl bg-base-200/50 p-4 text-sm sm:grid-cols-2">
						<div>
							<p class="text-xs font-bold uppercase tracking-wide text-base-content/45">
								{badgeType(definition) === 'product' ? 'Purchased' : 'Awarded'}
							</p>
							<p class="mt-1 font-semibold">{formatDate(award.createdAt())}</p>
						</div>
						{#if formatPrice(definition)}
							<div>
								<p class="text-xs font-bold uppercase tracking-wide text-base-content/45">
									Listed price
								</p>
								<p class="mt-1 font-semibold">{formatPrice(definition)}</p>
							</div>
						{/if}
						{#if orderReference()}
							<div>
								<p class="text-xs font-bold uppercase tracking-wide text-base-content/45">
									Order ID
								</p>
								<p class="mt-1 break-all font-mono text-xs font-semibold">{orderReference()}</p>
							</div>
						{/if}
						{#if badgeType(definition) === 'membership' || badgeType(definition) === 'role'}
							<div>
								<p class="text-xs font-bold uppercase tracking-wide text-base-content/45">
									Validity
								</p>
								<p class="mt-1 font-semibold">{expirationLabel()}</p>
							</div>
						{/if}
						{#if badgeType(definition) === 'pass'}
							<div>
								<p class="text-xs font-bold uppercase tracking-wide text-base-content/45">
									Availability
								</p>
								<p class="mt-1 font-semibold">{remainingUsesLabel(definition)}</p>
							</div>
						{/if}
						{#if communityLabel()}
							<div>
								<p class="text-xs font-bold uppercase tracking-wide text-base-content/45">
									Community
								</p>
								<p class="mt-1 truncate font-semibold">{communityLabel()}</p>
							</div>
						{/if}
					</div>

					{#if canPresentEntitlement()}
						<button
							type="button"
							class="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-black text-primary-content disabled:cursor-wait disabled:opacity-60"
							disabled={signingQr}
							on:click={showEntitlementQr}
						>
							<Icon
								icon={signingQr ? 'ei:spinner' : 'mdi:qrcode'}
								class={`text-xl ${signingQr ? 'animate-spin' : ''}`}
							/>
							{signingQr ? 'Preparing QR…' : redemptionQrLabel()}
						</button>
					{/if}
					{#if qrError}
						<p class="mt-3 text-sm font-semibold text-error">{qrError}</p>
					{/if}

					{#if badgeType(definition) === 'role' && tagValues(definition, 'permission').length}
						<div class="mt-5">
							<h3 class="font-bold">Permissions</h3>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each tagValues(definition, 'permission') as permission (permission)}
									<span class="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
										{permission}
									</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</section>

			{#if badgeType(definition) !== 'membership' && badgeType(definition) !== 'role'}
				<section class="mt-4 rounded-2xl border border-base-200 bg-base-100 p-5 shadow-widget">
					<h3 class="text-lg font-bold">Activity</h3>
					<div class="mt-4 space-y-4">
						<div class="flex gap-3">
							<div class="mt-1 h-3 w-3 shrink-0 rounded-full bg-primary"></div>
							<div>
								<p class="font-semibold">
									{badgeType(definition) === 'product'
										? 'Purchase confirmed'
										: badgeType(definition) === 'event_access'
											? 'Ticket acquired'
											: 'Pass acquired'}
								</p>
								<p class="mt-1 text-xs text-base-content/55">{formatDate(award.createdAt())}</p>
							</div>
						</div>
						{#each orderedStatuses as status (status.id())}
							<div class="flex gap-3">
								<div class="mt-1 h-3 w-3 shrink-0 rounded-full bg-primary"></div>
								<div>
									<p class="font-semibold">
										{statusTimelineLabel(statusValue(status), status)}
									</p>
									<p class="mt-1 text-xs text-base-content/55">
										{formatDate(status.createdAt())}
									</p>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/if}
	</main>
</div>
