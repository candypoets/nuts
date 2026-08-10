<script lang="ts">
	import type { ParsedEvent, RequestObject, WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isEoce, isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		BadgeCheck,
		CircleAlert,
		Coffee,
		LoaderCircle,
		LockKeyhole,
		Package,
		ShoppingBag,
		ShoppingCart,
		Ticket,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key } from 'src/controller';
	import {
		catalogAddress,
		catalogAvailability,
		catalogCurrency,
		catalogDescription,
		catalogImage,
		catalogMaxUses,
		catalogName,
		catalogPosition,
		catalogPrice,
		catalogPriceSats,
		catalogProductKind,
		catalogSection,
		isStoreCatalogDefinition,
		sellableCatalogSubscriptionId,
		upsertCatalogEvent
	} from 'src/lib/catalog';
	import { parseMembershipDefinition, type MembershipDefinition } from 'src/lib/memberships';
	import {
		storePresetFor,
		type CommunityType,
		type StorePresentation
	} from 'src/lib/communityTypes';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { paymentServiceUrl } from 'src/lib/paymentService';
	import { go } from 'src/routes/modals/modal';
	import { onDestroy, onMount } from 'svelte';

	export let relay: string;
	export let communityType: CommunityType;

	let mounted = false;
	let activeRelay = '';
	let catalogEvents: ParsedEvent[] = [];
	let memberships: MembershipDefinition[] = [];
	let loading = true;
	let loadError = '';
	let checkoutAddress = '';
	let checkoutError = '';
	let checkoutAttempt = 0;
	let checkoutAbortController: AbortController | undefined;
	let unsubscribeCatalog: (() => void) | undefined;
	let loadTimeout: ReturnType<typeof setTimeout> | undefined;

	$: normalizedRelay = normalizeRelay(relay);
	$: preset = storePresetFor(communityType);
	$: availableEvents = catalogEvents
		.filter(
			(event) => isStoreCatalogDefinition(event) && catalogAvailability(event) === 'available'
		)
		.slice()
		.sort(compareCatalogEvents);
	$: hospitalityMenuEvents = availableEvents.filter(
		(event) => catalogProductKind(event) === 'food' || catalogProductKind(event) === 'drink'
	);
	$: hospitalityOtherEvents = availableEvents.filter(
		(event) => !hospitalityMenuEvents.includes(event)
	);
	$: hospitalityOtherItems = [
		...hospitalityOtherEvents.map(productItem),
		...memberships.map(membershipItem)
	];
	$: gridItems = [...availableEvents.map(productItem), ...memberships.map(membershipItem)];
	$: hospitalitySections = Array.from(
		new Set(hospitalityMenuEvents.map((event) => catalogSection(event) || 'Other'))
	).sort(compareHospitalitySections);
	$: if (mounted && normalizedRelay !== activeRelay) {
		subscribeStore(normalizedRelay);
	}

	function normalizeRelay(value: string) {
		try {
			return value ? normalizeURL(value) : '';
		} catch {
			return '';
		}
	}

	function subscribeStore(targetRelay: string) {
		unsubscribeCatalog?.();
		unsubscribeCatalog = undefined;
		if (loadTimeout) {
			clearTimeout(loadTimeout);
			loadTimeout = undefined;
		}

		activeRelay = targetRelay;
		checkoutAttempt += 1;
		checkoutAbortController?.abort();
		checkoutAbortController = undefined;
		catalogEvents = [];
		memberships = [];
		loadError = '';
		checkoutAddress = '';
		checkoutError = '';
		loading = Boolean(targetRelay);
		if (!targetRelay) {
			loading = false;
			return;
		}
		const requests: RequestObject[] = [
			{
				kinds: [30402],
				limit: 500,
				relays: [targetRelay],
				noCache: true
			},
			{
				kinds: [30009],
				tags: { '#t': ['membership'] },
				limit: 200,
				relays: [targetRelay],
				noCache: true
			}
		];

		unsubscribeCatalog = useSubscription(
			sellableCatalogSubscriptionId(targetRelay),
			requests,
			(message: WorkerMessage) => {
				if (activeRelay !== targetRelay) return;

				const event = isParsedEvent(message);
				if (event) {
					if (event.kind() === 30009) {
						upsertMembershipEvent(event);
						return;
					}
					if (isStoreCatalogDefinition(event)) {
						catalogEvents = upsertCatalogEvent(catalogEvents, event);
						loading = false;
					}
					return;
				}

				if (isEoce(message)) {
					return;
				}

				const status = isConnectionStatus(message);
				const statusValue = status?.status()?.toString().toLowerCase();
				if (statusValue === 'eose') {
					loading = false;
					if (loadTimeout) {
						clearTimeout(loadTimeout);
						loadTimeout = undefined;
					}
					return;
				}
				if (
					!gridItems.length &&
					(statusValue === 'failed' || statusValue === 'closed' || statusValue === 'close')
				) {
					loadError = 'The community store could not be loaded right now.';
					loading = false;
				}
			},
			{ bytesPerEvent: 12 * 1024 }
		);

		loadTimeout = setTimeout(() => {
			if (activeRelay === targetRelay) loading = false;
		}, 2500);
	}

	function compareCatalogEvents(left: ParsedEvent, right: ParsedEvent) {
		return (
			catalogPosition(left) - catalogPosition(right) ||
			catalogName(left).localeCompare(catalogName(right))
		);
	}

	function compareHospitalitySections(left: string, right: string) {
		const leftPosition = Math.min(
			...hospitalityMenuEvents
				.filter((event) => (catalogSection(event) || 'Other') === left)
				.map(catalogPosition)
		);
		const rightPosition = Math.min(
			...hospitalityMenuEvents
				.filter((event) => (catalogSection(event) || 'Other') === right)
				.map(catalogPosition)
		);
		return leftPosition - rightPosition || left.localeCompare(right);
	}

	function hospitalityEventsInSection(section: string) {
		return hospitalityMenuEvents
			.filter((event) => (catalogSection(event) || 'Other') === section)
			.slice()
			.sort(compareCatalogEvents);
	}

	/** Sellable memberships are NIP-97 `30009` definitions with `t=membership` and a valid price tag. */
	function upsertMembershipEvent(event: ParsedEvent) {
		const membership = parseMembershipDefinition(event);
		if (!membership) return;
		const price = Number(membership.price);
		if (!membership.price || !Number.isFinite(price) || price <= 0) {
			memberships = memberships.filter((item) => item.address !== membership.address);
			return;
		}
		const index = memberships.findIndex((item) => item.address === membership.address);
		if (index !== -1) {
			if (membership.createdAt <= memberships[index].createdAt) return;
			memberships = memberships.map((item, itemIndex) => (itemIndex === index ? membership : item));
		} else {
			memberships = [...memberships, membership];
		}
		loading = false;
	}

	type StorefrontItem =
		| { kind: 'product'; event: ParsedEvent }
		| { kind: 'membership'; membership: MembershipDefinition };

	function productItem(event: ParsedEvent): StorefrontItem {
		return { kind: 'product', event };
	}

	function membershipItem(membership: MembershipDefinition): StorefrontItem {
		return { kind: 'membership', membership };
	}

	function itemKey(item: StorefrontItem) {
		return item.kind === 'product' ? catalogAddress(item.event) : item.membership.address;
	}

	function itemName(item: StorefrontItem) {
		return item.kind === 'product' ? catalogName(item.event) : item.membership.name;
	}

	function itemImage(item: StorefrontItem) {
		return item.kind === 'product' ? catalogImage(item.event) : item.membership.image;
	}

	function itemDescription(item: StorefrontItem) {
		return item.kind === 'product' ? catalogDescription(item.event) : item.membership.description;
	}

	/** A pass is a `30402` listing with more than one use per award. */
	function isPassProduct(event: ParsedEvent) {
		const maxUses = catalogMaxUses(event);
		return Boolean(maxUses && maxUses > 1);
	}

	function formatFiatPrice(item: StorefrontItem) {
		const price = item.kind === 'product' ? catalogPrice(item.event) : item.membership.price;
		const currency =
			item.kind === 'product' ? catalogCurrency(item.event) : item.membership.currency;
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency
			}).format(Number(price));
		} catch {
			return `${price} ${currency}`;
		}
	}

	function formatSatsPrice(item: StorefrontItem) {
		if (item.kind !== 'product') return '';
		const sats = catalogPriceSats(item.event);
		return sats ? `${new Intl.NumberFormat().format(sats)} sats` : '';
	}

	function typeLabel(item: StorefrontItem) {
		if (item.kind === 'membership') return 'Membership';
		if (isPassProduct(item.event)) return 'Pass';
		const productKind = catalogProductKind(item.event);
		if (productKind === 'food') return 'Food';
		if (productKind === 'drink') return 'Drink';
		if (productKind === 'merchandise') return 'Merchandise';
		return 'Product';
	}

	function detailLabel(item: StorefrontItem) {
		if (item.kind === 'membership') {
			if (item.membership.billing === 'monthly') return 'Billed monthly';
			if (item.membership.billing === 'yearly') return 'Billed yearly';
			return 'One-time membership';
		}
		const maxUses = catalogMaxUses(item.event);
		if (maxUses) return `${maxUses} ${maxUses === 1 ? 'use' : 'uses'}`;
		return '';
	}

	function itemIcon(item: StorefrontItem) {
		if (item.kind === 'membership') return UsersRound;
		if (isPassProduct(item.event)) return Ticket;
		const productKind = catalogProductKind(item.event);
		if (productKind === 'food' || productKind === 'drink') {
			return Coffee;
		}
		return Package;
	}

	function storefrontTitle(presentation: StorePresentation) {
		return presentation === 'menu' ? 'Menu' : preset.title;
	}

	function purchaseLabel(item: StorefrontItem) {
		if (item.kind === 'membership') {
			return item.membership.billing === 'one_time' ? 'Join' : 'Subscribe';
		}
		if (isPassProduct(item.event)) return 'Get pass';
		return 'Buy';
	}

	async function startCheckout(item: StorefrontItem) {
		if (!$key?.pub || $key?.hasSigner === false) {
			go('login');
			return;
		}
		const address = itemKey(item);
		const targetRelay = normalizedRelay;
		const purchasable =
			item.kind === 'membership'
				? Boolean(address)
				: isStoreCatalogDefinition(item.event) && catalogAvailability(item.event) === 'available';
		if (!address || !targetRelay || !purchasable) {
			checkoutError = 'This item is not currently available for checkout.';
			return;
		}

		const attempt = ++checkoutAttempt;
		checkoutAddress = address;
		checkoutError = '';
		try {
			const url = paymentServiceUrl('/stripe/checkout');
			const body = JSON.stringify({
				community: targetRelay,
				eventAddress: address,
				returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`
			});
			const authorization = await makeInviteAuthorization(url, body);
			if (attempt !== checkoutAttempt || targetRelay !== normalizedRelay) {
				return;
			}
			const abortController = new AbortController();
			checkoutAbortController = abortController;
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization },
				body,
				signal: abortController.signal
			});
			if (attempt !== checkoutAttempt) return;
			const result = (await response.json().catch(() => ({}))) as {
				url?: unknown;
				message?: unknown;
				error?: unknown;
			};
			if (!response.ok) {
				const message =
					typeof result.message === 'string'
						? result.message
						: typeof result.error === 'string'
							? result.error
							: 'Checkout unavailable';
				throw new Error(message);
			}
			if (typeof result.url !== 'string' || !result.url) {
				throw new Error('Checkout unavailable');
			}
			window.location.assign(result.url);
		} catch (error) {
			if (attempt !== checkoutAttempt) return;
			checkoutError = error instanceof Error ? error.message : 'Checkout unavailable';
			checkoutAddress = '';
		} finally {
			if (attempt === checkoutAttempt) checkoutAbortController = undefined;
		}
	}

	onMount(() => {
		mounted = true;
		subscribeStore(normalizedRelay);
	});

	onDestroy(() => {
		checkoutAttempt += 1;
		checkoutAbortController?.abort();
		unsubscribeCatalog?.();
		if (loadTimeout) clearTimeout(loadTimeout);
	});
</script>

<section class="border-t border-base-200 pt-5" aria-busy={loading}>
	<header class="flex items-start justify-between gap-4">
		<div>
			<p class="text-xs font-black uppercase tracking-[0.14em] text-primary">
				Community {preset.presentation === 'menu' ? 'menu' : 'store'}
			</p>
			<h2 class="mt-1 text-2xl font-black">{storefrontTitle(preset.presentation)}</h2>
			<p class="mt-2 text-sm font-medium leading-6 text-base-content/65">
				{preset.presentation === 'menu'
					? 'Browse food, drinks, memberships and other current offers.'
					: 'Browse the products, memberships and passes currently available.'}
			</p>
		</div>
		<span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
			<ShoppingBag size={21} />
		</span>
	</header>

	{#if checkoutError}
		<div
			class="mt-4 flex items-start gap-2 rounded-xl border border-error/25 bg-error/10 p-3 text-sm font-bold text-error"
			role="alert"
			aria-live="polite"
		>
			<CircleAlert size={18} class="mt-0.5 shrink-0" />
			<span>{checkoutError}</span>
		</div>
	{/if}

	{#if loading && !gridItems.length}
		<div class="mt-6 space-y-3">
			{#each [1, 2, 3] as placeholder (placeholder)}
				<div class="h-24 animate-pulse rounded-xl bg-base-200"></div>
			{/each}
		</div>
	{:else if loadError && !gridItems.length}
		<div class="mt-6 rounded-xl border border-error/25 bg-error/10 p-5 text-center">
			<p class="text-sm font-bold text-error">{loadError}</p>
		</div>
	{:else if !gridItems.length}
		<div
			class="mt-6 rounded-xl border border-dashed border-base-200 bg-base-200/40 p-8 text-center"
		>
			<ShoppingBag size={28} class="mx-auto text-primary" />
			<h3 class="mt-3 text-lg font-black">
				{preset.presentation === 'menu' ? 'The menu is being prepared' : 'No offers yet'}
			</h3>
			<p class="mt-1 text-sm font-medium text-base-content/60">
				This community has not published anything available here yet.
			</p>
		</div>
	{:else if preset.presentation === 'menu'}
		<div class="mt-6 space-y-5">
			{#each hospitalitySections as section (section)}
				<section class="overflow-hidden rounded-xl border border-base-200 bg-base-300/70">
					<header class="border-b border-base-200 bg-base-200/50 px-4 py-3">
						<h3 class="text-lg font-black">{section}</h3>
					</header>
					<div class="divide-y divide-base-200">
						{#each hospitalityEventsInSection(section) as event (catalogAddress(event))}
							<article class="flex gap-3 p-4">
								<div
									class="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10 text-primary"
								>
									{#if catalogImage(event)}
										<img
											src={catalogImage(event)}
											alt={catalogName(event)}
											class="h-full w-full object-cover"
											loading="lazy"
										/>
									{:else}
										<svelte:component this={itemIcon(productItem(event))} size={25} />
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<h4 class="truncate text-base font-black">{catalogName(event)}</h4>
											<span
												class="mt-1 inline-flex rounded-full bg-base-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-base-content/65"
											>
												{typeLabel(productItem(event))}
											</span>
										</div>
										<div class="shrink-0 text-right">
											<p class="font-black text-primary">{formatFiatPrice(productItem(event))}</p>
											{#if formatSatsPrice(productItem(event))}
												<p class="mt-0.5 text-xs font-bold text-base-content/55">
													{formatSatsPrice(productItem(event))}
												</p>
											{/if}
										</div>
									</div>
									{#if catalogDescription(event)}
										<p class="mt-2 line-clamp-2 text-sm font-medium leading-5 text-base-content/65">
											{catalogDescription(event)}
										</p>
									{/if}
									<div class="mt-3 flex justify-end">
										<button
											type="button"
											class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-black text-primary-content disabled:cursor-wait disabled:opacity-60"
											disabled={Boolean(checkoutAddress)}
											aria-label={`${purchaseLabel(productItem(event))} ${catalogName(event)}`}
											on:click={() => startCheckout(productItem(event))}
										>
											{#if checkoutAddress === catalogAddress(event)}
												<LoaderCircle size={15} class="animate-spin" />
												Opening…
											{:else if !$key?.pub || $key?.hasSigner === false}
												<LockKeyhole size={15} />
												Sign in to buy
											{:else}
												<ShoppingCart size={15} />
												{purchaseLabel(productItem(event))}
											{/if}
										</button>
									</div>
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/each}

			{#if hospitalityOtherItems.length}
				<section>
					<div class="mb-3">
						<h3 class="text-lg font-black">Other offers</h3>
						<p class="mt-1 text-sm font-medium text-base-content/60">
							Memberships, passes and products beyond the menu.
						</p>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						{#each hospitalityOtherItems as item (itemKey(item))}
							<article class="overflow-hidden rounded-xl border border-base-200 bg-base-300/70">
								<div class="flex gap-3 p-4">
									<div
										class="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10 text-primary"
									>
										{#if itemImage(item)}
											<img
												src={itemImage(item)}
												alt={itemName(item)}
												class="h-full w-full object-cover"
												loading="lazy"
											/>
										{:else}
											<svelte:component this={itemIcon(item)} size={23} />
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<span
											class="inline-flex rounded-full bg-base-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-base-content/65"
										>
											{typeLabel(item)}
										</span>
										<h4 class="mt-1 truncate text-base font-black">{itemName(item)}</h4>
										<p class="mt-1 font-black text-primary">{formatFiatPrice(item)}</p>
										{#if formatSatsPrice(item)}
											<p class="text-xs font-bold text-base-content/55">
												{formatSatsPrice(item)}
											</p>
										{/if}
									</div>
								</div>
								<div class="border-t border-base-200 px-4 py-3">
									{#if itemDescription(item) || detailLabel(item)}
										{#if itemDescription(item)}
											<p class="line-clamp-2 text-sm font-medium leading-5 text-base-content/65">
												{itemDescription(item)}
											</p>
										{/if}
										{#if detailLabel(item)}
											<p
												class="mt-2 flex items-center gap-1.5 text-xs font-bold text-base-content/55"
											>
												<BadgeCheck size={14} class="text-primary" />
												{detailLabel(item)}
											</p>
										{/if}
									{/if}
									<button
										type="button"
										class="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-primary-content disabled:cursor-wait disabled:opacity-60"
										disabled={Boolean(checkoutAddress)}
										aria-label={`${purchaseLabel(item)} ${itemName(item)}`}
										on:click={() => startCheckout(item)}
									>
										{#if checkoutAddress === itemKey(item)}
											<LoaderCircle size={16} class="animate-spin" />
											Opening checkout…
										{:else if !$key?.pub || $key?.hasSigner === false}
											<LockKeyhole size={16} />
											Sign in to buy
										{:else}
											<ShoppingCart size={16} />
											{purchaseLabel(item)}
										{/if}
									</button>
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{:else}
		<div class="mt-6 grid gap-3 sm:grid-cols-2">
			{#each gridItems as item (itemKey(item))}
				<article
					class="flex min-h-56 flex-col overflow-hidden rounded-xl border border-base-200 bg-base-300/70"
				>
					<div class="relative h-32 bg-base-200">
						{#if itemImage(item)}
							<img
								src={itemImage(item)}
								alt={itemName(item)}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{:else}
							<div class="grid h-full place-items-center text-primary">
								<svelte:component this={itemIcon(item)} size={32} />
							</div>
						{/if}
						<span
							class="absolute left-3 top-3 rounded-full bg-base-100/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-base-content shadow-sm backdrop-blur"
						>
							{typeLabel(item)}
						</span>
					</div>
					<div class="flex flex-1 flex-col p-4">
						<div class="flex items-start justify-between gap-3">
							<h3 class="min-w-0 text-lg font-black leading-6">{itemName(item)}</h3>
							<div class="shrink-0 text-right">
								<p class="font-black text-primary">{formatFiatPrice(item)}</p>
								{#if formatSatsPrice(item)}
									<p class="text-xs font-bold text-base-content/55">{formatSatsPrice(item)}</p>
								{/if}
							</div>
						</div>
						{#if itemDescription(item)}
							<p class="mt-2 line-clamp-2 text-sm font-medium leading-5 text-base-content/65">
								{itemDescription(item)}
							</p>
						{/if}
						<div class="mt-auto flex flex-wrap items-center gap-2 pt-4">
							{#if item.kind === 'product' && catalogSection(item.event)}
								<span class="rounded-full bg-base-200 px-2.5 py-1 text-xs font-bold">
									{catalogSection(item.event)}
								</span>
							{/if}
							{#if detailLabel(item)}
								<span
									class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
								>
									<BadgeCheck size={13} />
									{detailLabel(item)}
								</span>
							{/if}
						</div>
						<button
							type="button"
							class="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-primary-content disabled:cursor-wait disabled:opacity-60"
							disabled={Boolean(checkoutAddress)}
							aria-label={`${purchaseLabel(item)} ${itemName(item)}`}
							on:click={() => startCheckout(item)}
						>
							{#if checkoutAddress === itemKey(item)}
								<LoaderCircle size={17} class="animate-spin" />
								Opening checkout…
							{:else if !$key?.pub || $key?.hasSigner === false}
								<LockKeyhole size={17} />
								Sign in to buy
							{:else}
								<ShoppingCart size={17} />
								{purchaseLabel(item)}
							{/if}
						</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</section>
