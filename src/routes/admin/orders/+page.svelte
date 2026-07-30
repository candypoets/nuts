<script lang="ts">
	import {
		extractTagValue,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isEoce, isParsedEvent } from '@candypoets/nipworker/utils';
	import { CheckCircle2, ClipboardList, Loader2, XCircle } from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key, selectedAdminRelayUrl } from 'src/controller';
	import {
		fetchCommunityAccess,
		fetchCommunityTrust,
		type CommunityAccess,
		type CommunityTrust
	} from 'src/lib/adminAccess';
	import { parsedEventTags } from 'src/lib/adminRelays';
	import {
		catalogAddress,
		catalogName,
		catalogType,
		isNewerCatalogEvent,
		isSellableEventAccessDefinition,
		isStoreCatalogDefinition,
		sellableCatalogSubscriptionId,
		CATALOG_SELLABLE_TAG
	} from 'src/lib/catalog';
	import { COMMUNITY_PROFILE_D, COMMUNITY_PROFILE_KIND } from 'src/lib/communityProfile';
	import { isCommunityType, type CommunityType } from 'src/lib/communityTypes';
	import {
		advanceActionLabel,
		buildBadgeStatusTemplate,
		checkInContextTag,
		deriveOrderRecords,
		isAwardExpired,
		nextFlowStatus,
		nextStatusCreatedAt,
		ordersTitleFor,
		ordersViewFor,
		remainingAwardUses,
		statusColumnLabel,
		statusFlowFor,
		type OrderRecord
	} from 'src/lib/orders';
	import {
		formatTime,
		isBadgeStatus,
		BADGE_STATUS_KIND,
		type BadgeStatus
	} from 'src/routes/notifications/notifications';
	import User from 'src/routes/explore/user.svelte';
	import { onDestroy } from 'svelte';

	let relayUrl = '';
	let loadedRelayUrl = '';
	let definitionEvents: ParsedEvent[] = [];
	let awardEvents: ParsedEvent[] = [];
	let statusEvents: ParsedEvent[] = [];
	let revokedAwardIds = new Set<string>();
	let authorizedSigners = new Map<string, boolean>();
	let trust: CommunityTrust = { authorityPubkeys: new Set() };
	let access: CommunityAccess = { isOwner: false, permissions: new Set(), roles: [] };
	let communityType: CommunityType = 'other';
	let profileCreatedAt = 0;
	let loading = true;
	let publishError = '';
	let publishingKeys = new Set<string>();
	let unsubscribeOrders: Array<() => void> = [];
	let unsubscribeCatalog: (() => void) | undefined;
	let unsubscribeProfile: (() => void) | undefined;
	let publishUnsubscribers: Array<() => void> = [];
	const signerRequests = new Set<string>();
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayStartTs = Math.floor(todayStart.getTime() / 1000);

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		relayUrl = loadedRelayUrl ? normalizeURL(loadedRelayUrl) : '';
		void loadCommunity();
	}
	$: definitions = buildDefinitionMap(definitionEvents);
	$: visibleAwards = awardEvents.filter(
		(award) => awardIssuerTrusted(award) && !revokedAwardIds.has(award.id() || '')
	);
	$: trustedStatuses = statusEvents.filter((event) => statusEventTrusted(event, definitions));
	$: records = deriveOrderRecords(visibleAwards, trustedStatuses, definitions);
	$: view = ordersViewFor(communityType);
	$: flow = statusFlowFor(communityType);
	$: openRecords = records.filter(
		(record) => record.status !== 'fulfilled' && record.status !== 'cancelled'
	);
	$: cancelledRecords = records.filter((record) => record.status === 'cancelled');
	$: todayCheckIns = records.filter(
		(record) => record.status === 'fulfilled' && record.updatedAt >= todayStartTs
	);
	$: activePasses = visibleAwards.filter((award) => {
		const definition = definitions.get(extractTagValue(award, 'a') || '');
		if (!definition) return false;
		const type = catalogType(definition);
		if (type !== 'pass' && type !== 'membership') return false;
		if (isAwardExpired(award)) return false;
		const remaining = remainingAwardUses(award, definition, trustedStatuses);
		return remaining === undefined || remaining > 0;
	});

	function buildDefinitionMap(events: ParsedEvent[]) {
		const map = new Map<string, ParsedEvent>();
		for (const event of events) {
			if (!isStoreCatalogDefinition(event) && !isSellableEventAccessDefinition(event)) continue;
			const address = catalogAddress(event);
			if (!address) continue;
			const current = map.get(address);
			if (!current || isNewerCatalogEvent(event, current)) map.set(address, event);
		}
		return map;
	}

	function awardIssuerTrusted(award: ParsedEvent) {
		const issuer = award.pubkey();
		return Boolean(issuer && (trust.authorityPubkeys.has(issuer) || issuer === trust.badgeIssuer));
	}

	function statusEventTrusted(event: ParsedEvent, defs: ReadonlyMap<string, ParsedEvent>) {
		if (event.kind() !== BADGE_STATUS_KIND) return false;
		if (!isBadgeStatus(extractTagValue(event, 'status'))) return false;
		if (!defs.has(extractTagValue(event, 'a') || '')) return false;
		if (!extractTagValue(event, 'e') || !extractTagValue(event, 'p')) return false;
		const order = extractTagValue(event, 'order');
		const eventContext = extractTagValue(event, 'event');
		if (Boolean(order) === Boolean(eventContext)) return false;
		return signerTrusted(event.pubkey() || '');
	}

	function signerTrusted(signer: string): boolean {
		if (!signer) return false;
		if (trust.authorityPubkeys.has(signer) || signer === trust.badgeIssuer) return true;
		const cached = authorizedSigners.get(signer);
		if (cached !== undefined) return cached;
		void resolveSigner(signer);
		return false;
	}

	async function resolveSigner(signer: string) {
		if (!relayUrl || signerRequests.has(signer)) return;
		signerRequests.add(signer);
		const target = relayUrl;
		const allowed = await fetchCommunityAccess(target, signer, false)
			.then((result) => result.permissions.has('store') || result.permissions.has('events'))
			.catch(() => false);
		if (target !== relayUrl || authorizedSigners.get(signer) !== undefined) return;
		authorizedSigners = new Map(authorizedSigners).set(signer, allowed);
	}

	function upsertById(list: ParsedEvent[], event: ParsedEvent) {
		const id = event.id();
		if (!id) return list;
		return list.some((existing) => existing.id() === id) ? list : [...list, event];
	}

	function upsertDefinition(list: ParsedEvent[], event: ParsedEvent) {
		const address = catalogAddress(event);
		if (!address) return list;
		const index = list.findIndex((existing) => catalogAddress(existing) === address);
		if (index === -1) return [...list, event];
		if (!isNewerCatalogEvent(event, list[index])) return list;
		return list.map((existing, i) => (i === index ? event : existing));
	}

	async function loadCommunity() {
		unsubscribeOrders.forEach((unsubscribe) => unsubscribe());
		unsubscribeOrders = [];
		unsubscribeCatalog?.();
		unsubscribeProfile?.();
		publishUnsubscribers.forEach((unsubscribe) => unsubscribe());
		publishUnsubscribers = [];
		definitionEvents = [];
		awardEvents = [];
		statusEvents = [];
		revokedAwardIds = new Set();
		authorizedSigners = new Map();
		signerRequests.clear();
		trust = { authorityPubkeys: new Set() };
		access = { isOwner: false, permissions: new Set(), roles: [] };
		communityType = 'other';
		profileCreatedAt = 0;
		publishError = '';
		publishingKeys = new Set();
		loading = Boolean(relayUrl);
		if (!relayUrl) return;

		const target = relayUrl;
		trust = await fetchCommunityTrust(target);
		if (relayUrl !== target) return;
		const pubkey = $key?.pub || '';
		access = await fetchCommunityAccess(target, pubkey, trust.authorityPubkeys.has(pubkey)).catch(
			() => ({ isOwner: false, permissions: new Set(), roles: [] }) as CommunityAccess
		);
		if (relayUrl !== target) return;
		subscribeOrders(target);
	}

	function subscribeOrders(target: string) {
		const authors = Array.from(
			new Set([...trust.authorityPubkeys, ...(trust.badgeIssuer ? [trust.badgeIssuer] : [])])
		);
		// One useSubscription per filter: requests sharing a subId are sent as
		// separate REQs with the same id, and relays replace them (NIP-01) -
		// only the last one would stay live. Orders need live delivery for
		// incoming purchases, scanner fulfillments and revocations alike.
		const liveRequest = { limit: 1000, relays: [target], cacheFirst: false, noCache: true };
		const handleOrderMessage = (message: WorkerMessage) => {
			const event = isParsedEvent(message);
			if (event) {
				if (event.kind() === 8) {
					awardEvents = upsertById(awardEvents, event);
				} else if (event.kind() === BADGE_STATUS_KIND) {
					statusEvents = upsertById(statusEvents, event);
				} else if (event.kind() === 5 && awardIssuerTrusted(event)) {
					const revoked = parsedEventTags(event)
						.filter((tag) => tag[0] === 'e' && tag[1])
						.map((tag) => tag[1]);
					if (revoked.length) {
						revokedAwardIds = new Set([...revokedAwardIds, ...revoked]);
					}
				}
				loading = false;
				return;
			}
			if (isEoce(message)) loading = false;
		};
		unsubscribeOrders = [
			useSubscription(
				`admin_orders_awards_${target}`,
				[{ kinds: [8], ...(authors.length ? { authors } : {}), ...liveRequest }],
				handleOrderMessage,
				{ bytesPerEvent: 8 * 1024 }
			),
			useSubscription(
				`admin_orders_statuses_${target}`,
				[{ kinds: [BADGE_STATUS_KIND], ...liveRequest }],
				handleOrderMessage,
				{ bytesPerEvent: 8 * 1024 }
			),
			useSubscription(
				`admin_orders_revocations_${target}`,
				[{ kinds: [5], ...liveRequest }],
				handleOrderMessage,
				{ bytesPerEvent: 8 * 1024 }
			)
		];

		unsubscribeCatalog = useSubscription(
			sellableCatalogSubscriptionId(target),
			[
				{
					kinds: [30009],
					tags: { '#t': [CATALOG_SELLABLE_TAG] },
					limit: 500,
					relays: [target],
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (event) {
					if (isStoreCatalogDefinition(event) || isSellableEventAccessDefinition(event)) {
						definitionEvents = upsertDefinition(definitionEvents, event);
					}
					loading = false;
					return;
				}
				if (isEoce(message)) loading = false;
			},
			{ bytesPerEvent: 12 * 1024 }
		);

		unsubscribeProfile = useSubscription(
			'admin_store_profile_' + target,
			[
				{
					kinds: [COMMUNITY_PROFILE_KIND],
					tags: { '#d': [COMMUNITY_PROFILE_D] },
					limit: 10,
					relays: [target],
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (!event || event.kind() !== COMMUNITY_PROFILE_KIND) return;
				if (event.createdAt() < profileCreatedAt) return;
				const type = extractTagValue(event, 'type');
				communityType = isCommunityType(type) ? type : 'other';
				profileCreatedAt = Number(event.createdAt());
			},
			{ bytesPerEvent: 4 * 1024 }
		);

		window.setTimeout(() => (loading = false), 1800);
	}

	function canManageRecord(record: OrderRecord) {
		const permission = catalogType(record.definition) === 'event_access' ? 'events' : 'store';
		return access.isOwner || access.permissions.has(permission);
	}

	function canManagePasses() {
		return access.isOwner || access.permissions.has('store');
	}

	function recordsInColumn(records: OrderRecord[], status: BadgeStatus) {
		return records.filter((record) => record.status === status);
	}

	function isEventAccess(record: OrderRecord) {
		return catalogType(record.definition) === 'event_access';
	}

	function shortRef(ref: string) {
		return ref.length > 16 ? `${ref.slice(0, 8)}…${ref.slice(-4)}` : ref;
	}

	// Last created_at we published per context key. The relay ACK (which
	// re-enables the button) can arrive before the live subscription delivers
	// the event that refreshes record.updatedAt, so a fast follow-up click
	// would otherwise compute a same-second created_at — a coin flip that
	// strfry resolves by event id, silently dropping the newer status.
	let lastPublishedCreatedAt = new Map<string, number>();

	function publishStatus(
		target: {
			key: string;
			awardId: string;
			badgeAddress: string;
			holder: string;
			contextTag: string[];
			updatedAt?: number;
		},
		status: BadgeStatus
	) {
		if (!relayUrl || !$key?.pub || publishingKeys.has(target.key)) return;
		// Same-second updates for one context are a coin flip on the reader side
		// (created_at tie → smallest event id wins); keep created_at monotonic.
		const template = buildBadgeStatusTemplate(
			status,
			target,
			nextStatusCreatedAt(
				Math.max(target.updatedAt ?? 0, lastPublishedCreatedAt.get(target.key) ?? 0)
			)
		);
		lastPublishedCreatedAt.set(target.key, template.created_at ?? 0);
		publishingKeys = new Set(publishingKeys).add(target.key);
		publishError = '';
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			const next = new Set(publishingKeys);
			next.delete(target.key);
			publishingKeys = next;
		};
		try {
			const unsubscribe = usePublish(
				`admin_order_status_${target.key}_${status}_${template.created_at}`,
				template,
				(message: WorkerMessage) => {
					const publishStatusMessage = isConnectionStatus(message);
					if (publishStatusMessage?.status()?.toString() === 'true') finish();
				},
				{ trackStatus: true, defaultRelays: [relayUrl], subId: `admin_orders_statuses_${relayUrl}` }
			);
			publishUnsubscribers = [...publishUnsubscribers, unsubscribe];
		} catch (error) {
			finish();
			publishError = error instanceof Error ? error.message : 'Could not publish this update.';
			return;
		}
		window.setTimeout(finish, 5000);
	}

	function advanceStatus(record: OrderRecord, status: BadgeStatus) {
		publishStatus(record, status);
	}

	function checkInPass(award: ParsedEvent) {
		const awardId = award.id() || '';
		const contextTag = checkInContextTag(awardId);
		publishStatus(
			{
				key: `${awardId}:checkin`,
				awardId,
				badgeAddress: extractTagValue(award, 'a') || '',
				holder: extractTagValue(award, 'p') || '',
				contextTag
			},
			'fulfilled'
		);
	}

	onDestroy(() => {
		unsubscribeOrders.forEach((unsubscribe) => unsubscribe());
		unsubscribeCatalog?.();
		unsubscribeProfile?.();
		publishUnsubscribers.forEach((unsubscribe) => unsubscribe());
	});
</script>

<svelte:head>
	<title>{ordersTitleFor(communityType)} - Nuts</title>
</svelte:head>

<main class="px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-[1560px]">
		<header class="flex flex-wrap items-center gap-4">
			<span
				class="grid h-12 w-12 place-items-center rounded-xl bg-[#003d31] text-white shadow-sm shadow-emerald-950/20"
			>
				<ClipboardList size={22} strokeWidth={1.9} />
			</span>
			<div class="min-w-0">
				<h1 class="text-2xl font-black text-[#080b12]">{ordersTitleFor(communityType)}</h1>
				<p class="mt-0.5 text-sm font-semibold text-slate-500">
					{#if view === 'checkins'}
						Member check-ins and active passes, recorded on the community relay.
					{:else if communityType === 'hospitality'}
						Follow each order from purchase to served — updates publish instantly for staff.
					{:else}
						Follow each order from purchase to collection — updates publish instantly for staff.
					{/if}
				</p>
			</div>
		</header>

		{#if publishError}
			<p
				class="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
			>
				{publishError}
			</p>
		{/if}

		{#if loading}
			<div class="mt-10 flex items-center gap-3 text-sm font-bold text-slate-500">
				<Loader2 size={18} class="animate-spin" />
				Loading orders…
			</div>
		{:else if !relayUrl}
			<p class="mt-10 text-sm font-bold text-slate-500">Select a community to see its orders.</p>
		{:else if view === 'checkins'}
			<!-- Sports club & gym: check-in oriented view -->
			<section class="mt-8">
				<h2 class="text-lg font-black text-[#080b12]">
					Today's check-ins
					<span class="ml-2 rounded-lg bg-[#eef5f3] px-2 py-0.5 text-sm font-black text-[#003d31]">
						{todayCheckIns.length}
					</span>
				</h2>
				{#if todayCheckIns.length}
					<div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{#each todayCheckIns as record (record.key)}
							<article
								class="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white/85 p-4 shadow-sm shadow-stone-950/5"
							>
								<CheckCircle2 size={22} class="shrink-0 text-[#24b99a]" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-base font-black text-[#080b12]">
										{catalogName(record.definition)}
									</p>
									<p class="truncate text-sm font-semibold text-slate-500">
										<User pubkey={record.holder} relays={[relayUrl]} link={false} />
										· {formatTime(record.updatedAt)}
									</p>
								</div>
							</article>
						{/each}
					</div>
				{:else}
					<p class="mt-4 text-sm font-semibold text-slate-500">No check-ins recorded today yet.</p>
				{/if}
			</section>

			<section class="mt-10">
				<h2 class="text-lg font-black text-[#080b12]">
					Active passes
					<span class="ml-2 rounded-lg bg-[#eef5f3] px-2 py-0.5 text-sm font-black text-[#003d31]">
						{activePasses.length}
					</span>
				</h2>
				{#if activePasses.length}
					<div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{#each activePasses as award (award.id())}
							{@const definition = definitions.get(extractTagValue(award, 'a') || '')}
							{@const remaining = definition
								? remainingAwardUses(award, definition, trustedStatuses)
								: undefined}
							<article
								class="rounded-2xl border border-stone-200 bg-white/85 p-4 shadow-sm shadow-stone-950/5"
							>
								<p class="truncate text-base font-black text-[#080b12]">
									{definition ? catalogName(definition) : 'Pass'}
								</p>
								<p class="mt-0.5 truncate text-sm font-semibold text-slate-500">
									<User
										pubkey={extractTagValue(award, 'p') || ''}
										relays={[relayUrl]}
										link={false}
									/>
								</p>
								<div class="mt-3 flex items-center justify-between gap-3">
									<span class="text-xs font-bold uppercase tracking-wide text-slate-500">
										{remaining === undefined
											? 'Unlimited uses'
											: `${remaining} use${remaining === 1 ? '' : 's'} left`}
									</span>
									{#if canManagePasses()}
										<button
											type="button"
											class="inline-flex items-center gap-2 rounded-lg bg-[#003d31] px-3 py-2 text-sm font-black text-white transition hover:bg-[#0a5446] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:opacity-50"
											disabled={publishingKeys.has(`${award.id()}:checkin`)}
											on:click={() => checkInPass(award)}
										>
											Check in
										</button>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				{:else}
					<p class="mt-4 text-sm font-semibold text-slate-500">
						No active passes or memberships yet.
					</p>
				{/if}
			</section>

			{#if openRecords.length}
				<section class="mt-10">
					<h2 class="text-lg font-black text-[#080b12]">
						Open orders
						<span
							class="ml-2 rounded-lg bg-[#eef5f3] px-2 py-0.5 text-sm font-black text-[#003d31]"
						>
							{openRecords.length}
						</span>
					</h2>
					<div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{#each openRecords as record (record.key)}
							{@const next = nextFlowStatus(flow, record.status)}
							<article
								class="rounded-2xl border border-stone-200 bg-white/85 p-4 shadow-sm shadow-stone-950/5"
							>
								<p class="truncate text-base font-black text-[#080b12]">
									{catalogName(record.definition)}
								</p>
								<p class="mt-0.5 truncate text-sm font-semibold text-slate-500">
									<User pubkey={record.holder} relays={[relayUrl]} link={false} />
									· {formatTime(record.updatedAt)}
								</p>
								<div class="mt-3 flex items-center justify-between gap-3">
									<span
										class="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black uppercase tracking-wide text-slate-600"
									>
										{statusColumnLabel(record.status, communityType)}
									</span>
									{#if canManageRecord(record) && next}
										<button
											type="button"
											class="inline-flex items-center gap-2 rounded-lg bg-[#003d31] px-3 py-2 text-sm font-black text-white transition hover:bg-[#0a5446] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:opacity-50"
											disabled={publishingKeys.has(record.key)}
											on:click={() => advanceStatus(record, next)}
										>
											{advanceActionLabel(next, communityType)}
										</button>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/if}
		{:else}
			<!-- Hospitality / store: status queue -->
			<div class="mt-8 flex gap-4 overflow-x-auto pb-4">
				{#each flow as columnStatus (columnStatus)}
					{@const columnRecords = recordsInColumn(records, columnStatus)}
					<section
						class="w-72 shrink-0 rounded-2xl border border-stone-200 bg-white/85 p-4 shadow-sm shadow-stone-950/5"
					>
						<header class="flex items-center justify-between gap-2">
							<h2 class="text-sm font-black uppercase tracking-wide text-slate-600">
								{statusColumnLabel(columnStatus, communityType)}
							</h2>
							<span class="rounded-lg bg-[#eef5f3] px-2 py-0.5 text-sm font-black text-[#003d31]">
								{columnRecords.length}
							</span>
						</header>
						<div class="mt-4 grid gap-3">
							{#each columnRecords as record (record.key)}
								{@const next = nextFlowStatus(flow, record.status)}
								<article class="rounded-xl border border-stone-200 bg-white p-4">
									<p class="truncate text-base font-black text-[#080b12]">
										{catalogName(record.definition)}
									</p>
									<p class="mt-0.5 truncate text-sm font-semibold text-slate-500">
										<User pubkey={record.holder} relays={[relayUrl]} link={false} />
									</p>
									<p class="mt-1 text-xs font-bold text-slate-400">
										#{shortRef(record.orderRef)} · {formatTime(record.updatedAt)}
									</p>
									{#if canManageRecord(record) && record.status !== 'fulfilled' && record.status !== 'cancelled'}
										<div class="mt-3 flex items-center gap-2">
											{#if isEventAccess(record)}
												<button
													type="button"
													class="flex-1 rounded-lg bg-[#003d31] px-3 py-2 text-sm font-black text-white transition hover:bg-[#0a5446] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:opacity-50"
													disabled={publishingKeys.has(record.key)}
													on:click={() => advanceStatus(record, 'fulfilled')}
												>
													Check in
												</button>
											{:else if next}
												<button
													type="button"
													class="flex-1 rounded-lg bg-[#003d31] px-3 py-2 text-sm font-black text-white transition hover:bg-[#0a5446] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:opacity-50"
													disabled={publishingKeys.has(record.key)}
													on:click={() => advanceStatus(record, next)}
												>
													{advanceActionLabel(next, communityType)}
												</button>
											{/if}
											<button
												type="button"
												aria-label="Cancel order"
												class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/25 disabled:opacity-50"
												disabled={publishingKeys.has(record.key)}
												on:click={() => advanceStatus(record, 'cancelled')}
											>
												<XCircle size={18} />
											</button>
										</div>
									{/if}
								</article>
							{:else}
								<p
									class="rounded-xl border border-dashed border-stone-200 p-4 text-center text-xs font-bold text-slate-400"
								>
									Nothing here
								</p>
							{/each}
						</div>
					</section>
				{/each}
			</div>

			{#if cancelledRecords.length}
				<section class="mt-6">
					<h2 class="text-sm font-black uppercase tracking-wide text-slate-500">
						Cancelled
						<span
							class="ml-2 rounded-lg bg-slate-100 px-2 py-0.5 text-sm font-black text-slate-600"
						>
							{cancelledRecords.length}
						</span>
					</h2>
					<div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						{#each cancelledRecords as record (record.key)}
							<article class="rounded-xl border border-stone-200 bg-stone-50 p-4 opacity-75">
								<p class="truncate text-sm font-black text-slate-600 line-through">
									{catalogName(record.definition)}
								</p>
								<p class="mt-0.5 truncate text-xs font-semibold text-slate-400">
									<User pubkey={record.holder} relays={[relayUrl]} link={false} />
									· {formatTime(record.updatedAt)}
								</p>
							</article>
						{/each}
					</div>
				</section>
			{/if}
		{/if}
	</div>
</main>
