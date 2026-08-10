<script lang="ts">
	import { extractTagValue, type ParsedEvent, type WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { nip19 } from 'nostr-tools';
	import {
		canDo,
		fetchCommunityAccess,
		fetchCommunityTrust,
		type CommunityTrust
	} from 'src/lib/adminAccess';
	import {
		catalogEventAddress,
		catalogImage,
		catalogMaxUses,
		catalogName,
		catalogProductKind,
		isCatalogDefinition
	} from 'src/lib/catalog';
	import { isDefinitionAddress } from 'src/lib/nip97';
	import { onDestroy, onMount } from 'svelte';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';
	import { formatTime, type BadgeNotification, type BadgeStatus } from './notifications';

	export let post: BadgeNotification;

	const nav = usePagerNavigation();
	let definition: ParsedEvent | undefined;
	let definitionUnsubscribe: (() => void) | undefined;
	let mounted = false;
	let activeDefinitionKey = '';
	let definitionGeneration = 0;
	let trustPromises = new Map<string, Promise<CommunityTrust>>();
	let authorizationPromises = new Map<string, Promise<boolean>>();

	function definitionCoordinate() {
		const address = extractTagValue(post.parsed.award, 'a') || '';
		if (!isDefinitionAddress(address)) return undefined;
		const [kindValue, author, ...identifierParts] = address.split(':');
		const kind = Number(kindValue);
		const identifier = identifierParts.join(':');
		if (!author || !identifier) return undefined;
		return { address, kind, author, identifier };
	}

	function trustForRelay(relay: string) {
		let trust = trustPromises.get(relay);
		if (!trust) {
			trust = fetchCommunityTrust(relay);
			trustPromises.set(relay, trust);
		}
		return trust;
	}

	/**
	 * Definition authors: anchor admins may author anything; role authoring stays
	 * admin-only (privilege-escalation boundary); other definitions require the
	 * matching kind write capability (with the topic filter for 30009).
	 */
	function definitionAuthorization(relay: string, author: string, kind: number, topic?: string) {
		const cacheKey = `${relay}:${author}:${kind}:${topic || ''}`;
		let authorization = authorizationPromises.get(cacheKey);
		if (!authorization) {
			authorization = trustForRelay(relay).then(async (trust) => {
				if (trust.admins.has(author)) return true;
				if (kind === 30009 && topic === 'role') return false;
				const access = await fetchCommunityAccess(relay, author, false);
				return canDo(access, String(kind), 'write', topic);
			});
			authorizationPromises.set(cacheKey, authorization);
		}
		return authorization;
	}

	async function acceptDefinition(event: ParsedEvent, generation: number) {
		const coordinate = definitionCoordinate();
		const awardIssuer = post.parsed.award.pubkey();
		if (
			!coordinate ||
			event.kind() !== coordinate.kind ||
			event.pubkey() !== coordinate.author ||
			extractTagValue(event, 'd') !== coordinate.identifier ||
			!awardIssuer
		) {
			return;
		}
		const topic = event.kind() === 30009 ? extractTagValue(event, 't') : undefined;
		if (event.kind() === 30009 && topic !== 'role' && topic !== 'membership') return;
		if (event.kind() === 30402 && !isCatalogDefinition(event)) return;

		const trusted = await Promise.all(
			post.parsed.relays.map(async (relay) => {
				const communityTrust = await trustForRelay(relay);
				const trustedAward =
					communityTrust.admins.has(awardIssuer) || communityTrust.badgeIssuer === awardIssuer;
				if (!trustedAward) return false;
				return definitionAuthorization(relay, coordinate.author, coordinate.kind, topic);
			})
		);
		if (generation !== definitionGeneration || !trusted.some(Boolean)) return;
		if (
			!definition ||
			event.createdAt() > definition.createdAt() ||
			(event.createdAt() === definition.createdAt() && (event.id() || '') < (definition.id() || ''))
		) {
			definition = event;
		}
	}

	function subscribeDefinition(key: string) {
		definitionUnsubscribe?.();
		definitionUnsubscribe = undefined;
		activeDefinitionKey = key;
		definition = undefined;
		trustPromises = new Map();
		authorizationPromises = new Map();
		const generation = ++definitionGeneration;
		const coordinate = definitionCoordinate();
		if (!mounted || !coordinate || !post.parsed.relays.length) return;

		definitionUnsubscribe = useSubscription(
			`notification_badge_definition_${post.parsed.award.id()}_${generation}`,
			[
				{
					kinds: [coordinate.kind],
					authors: [coordinate.author],
					tags: { '#d': [coordinate.identifier] },
					limit: 20,
					relays: post.parsed.relays,
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (event) void acceptDefinition(event, generation);
			},
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	/**
	 * Display classification from the definition's kind and tags: 30009 topics are
	 * role/membership, a 30402 with an event link (or a bare calendar event) is a
	 * ticket, a multi-use 30402 is a pass, anything else sellable is a product.
	 */
	function definitionType(value: ParsedEvent | undefined) {
		if (!value) return '';
		const kind = value.kind();
		if (kind === 30009) {
			const topic = extractTagValue(value, 't');
			return topic === 'role' ? 'role' : topic === 'membership' ? 'membership' : '';
		}
		if (kind === 31922 || kind === 31923) return 'event_access';
		if (kind === 30402) {
			if (catalogEventAddress(value)) return 'event_access';
			const maxUses = catalogMaxUses(value);
			return maxUses && maxUses > 1 ? 'pass' : 'product';
		}
		return '';
	}

	function latestStatus(value: ParsedEvent | undefined) {
		const type = definitionType(value);
		if (type === 'membership' || type === 'role') return undefined;
		const event = post.parsed.statuses[0];
		if (!event) return undefined;
		const status = extractTagValue(event, 'status');
		return status as BadgeStatus | undefined;
	}

	function icon(value: ParsedEvent | undefined) {
		const type = definitionType(value);
		if (type === 'membership') return 'mdi:account-group';
		if (type === 'event_access') return 'mdi:ticket-confirmation';
		if (type === 'pass') return 'mdi:badge-account';
		if (type === 'role') return 'mdi:shield-account';
		if (!value) return 'mdi:medal-outline';
		const productKind = catalogProductKind(value);
		if (productKind === 'food' || productKind === 'drink') return 'mdi:food';
		if (productKind === 'merchandise') return 'mdi:package-variant';
		return 'mdi:shopping';
	}

	function acquisitionHeading(value: ParsedEvent | undefined) {
		const type = definitionType(value);
		const status = latestStatus(value);
		if (type === 'membership') return 'Membership acquired';
		if (type === 'event_access') return status === 'fulfilled' ? 'Checked in' : 'Ticket acquired';
		if (type === 'pass') return status === 'fulfilled' ? 'Pass used' : 'Pass acquired';
		if (type === 'role') return 'New role awarded';
		if (type === 'product') {
			if (status === 'accepted') return 'Purchase accepted';
			if (status === 'processing') return 'Purchase being prepared';
			if (status === 'ready') return 'Purchase ready';
			if (status === 'fulfilled') return 'Purchase completed';
			if (status === 'cancelled') return 'Purchase cancelled';
			return 'Purchase confirmed';
		}
		if (status === 'ready') return 'Order ready';
		if (status === 'fulfilled') {
			const productKind = value ? catalogProductKind(value) : undefined;
			if (productKind === 'food' || productKind === 'drink') return 'Your order was served';
			if (productKind === 'merchandise') return 'Your order was collected';
			return 'Order fulfilled';
		}
		if (status === 'cancelled') return 'Order cancelled';
		if (status === 'processing') return 'Your order is being prepared';
		if (status === 'accepted') return 'Your order was accepted';
		return value ? 'Entitlement acquired' : 'Loading details';
	}

	function statusLabel(value: ParsedEvent) {
		const type = definitionType(value);
		const status = latestStatus(value);
		if (type === 'membership') return `Active · ${expirationLabel()}`;
		if (type === 'role') return `Granted · ${expirationLabel()}`;
		if (!status) {
			if (type === 'product') return 'Order received';
			if (type === 'event_access') return 'Ticket available';
			if (type === 'pass') return 'Available';
			return 'Available';
		}
		if (status === 'pending') return 'Pending';
		if (status === 'accepted') return 'Accepted';
		if (status === 'processing') return 'Preparing';
		if (status === 'ready') return 'Ready';
		if (status === 'fulfilled') {
			if (type === 'event_access') return 'Checked in';
			if (type === 'pass') return 'Used';
			const productKind = catalogProductKind(value);
			if (productKind === 'food' || productKind === 'drink') return 'Served';
			if (productKind === 'merchandise') return 'Collected';
			return 'Fulfilled';
		}
		return 'Cancelled';
	}

	function expirationLabel() {
		const expiration = Number(extractTagValue(post.parsed.award, 'expiration') || 0);
		if (!expiration) return 'No expiration';
		const formatted = new Intl.DateTimeFormat(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(new Date(expiration * 1000));
		return expiration <= Math.floor(Date.now() / 1000)
			? `Expired ${formatted}`
			: `Expires ${formatted}`;
	}

	function openBadgeDetails() {
		const awardId = post.parsed.award.id();
		if (!awardId) return;
		const eventPath = `badge:${nip19.neventEncode({
			id: awardId,
			author: post.parsed.award.pubkey() || undefined,
			relays: post.parsed.relays
		})}`;
		nav ? nav.push(eventPath) : go(eventPath);
	}

	$: definitionKey = `${post.parsed.award.id()}:${post.parsed.relays.join('|')}`;
	$: if (mounted && definitionKey !== activeDefinitionKey) {
		subscribeDefinition(definitionKey);
	}

	onMount(() => {
		mounted = true;
		subscribeDefinition(definitionKey);
	});

	onDestroy(() => {
		definitionGeneration += 1;
		definitionUnsubscribe?.();
	});
</script>

<div class="notification-row transition-colors">
	<div class="flex items-start gap-3">
		<div class="notification-type-icon">
			<Icon icon={icon(definition)} class="text-xl" />
		</div>

		<div class="min-w-0 flex-grow">
			<div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<div class="notification-heading">{acquisitionHeading(definition)}</div>
					{#if !definition}
						<p class="mt-1 text-sm text-base-content/60">Loading badge details…</p>
					{/if}
				</div>
				<div class="notification-time">{formatTime(post.createdAt())}</div>
			</div>

			{#if definition}
				<button
					type="button"
					class="notification-post-preview flex w-full items-center gap-3 p-3 text-left transition hover:bg-base-200/70"
					aria-label={`View ${catalogName(definition)} details`}
					on:click|stopPropagation={openBadgeDetails}
				>
					{#if catalogImage(definition)}
						<img
							src={catalogImage(definition)}
							alt=""
							class="h-14 w-14 rounded-lg object-cover"
							loading="lazy"
						/>
					{/if}
					<div class="min-w-0 flex-1">
						<p class="truncate font-bold">{catalogName(definition)}</p>
						<p class="mt-1 text-sm font-semibold text-primary">
							{statusLabel(definition)}
						</p>
					</div>
				</button>
			{/if}
		</div>
	</div>
</div>
