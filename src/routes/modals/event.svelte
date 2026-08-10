<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { ParsedEvent, RequestObject, WorkerMessage } from '@candypoets/nipworker';
	import { extractTagValue } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { asConnectionStatus, asParsedEvent, asPreGeneric } from '@candypoets/nipworker/utils';
	import { nip19 } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import type { EventTemplate } from 'nostr-tools';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import ModalHandle from 'src/components/ModalHandle.svelte';
	import {
		RSVP_KIND,
		eventTags,
		parseCalendarEvent,
		type CalendarEventCard
	} from 'src/lib/calendarEvent';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import {
		catalogAddress,
		catalogAvailability,
		catalogCurrency,
		catalogEventAddress,
		catalogExpiration,
		catalogMaxUses,
		catalogPrice,
		catalogPriceSats,
		isCatalogDefinition,
		isNewerCatalogEvent
	} from 'src/lib/catalog';
	import { now } from 'src/lib/period';
	import { paymentServiceUrl } from 'src/lib/paymentService';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { key } from 'src/controller';
	import { adminServiceBaseUrl } from 'src/controller/admin';
	import { go } from 'src/routes/modals/modal';
	import { onDestroy } from 'svelte';

	export let relay = '';
	export let address = '';

	let event: CalendarEventCard | undefined;
	let eventRaw: ParsedEvent | undefined;
	let entranceDefinition: ParsedEvent | undefined;
	let latestEntranceDefinition: ParsedEvent | undefined;
	let attendees: string[] = [];
	let attendeeEvents: Record<string, ParsedEvent> = {};
	let loading = true;
	let rsvpStatus = '';
	let hasRsvped = false;
	let locallySubmittedRsvp = false;
	let lastKey = '';
	let eventSub: (() => void) | undefined;
	let entranceDefinitionSub: (() => void) | undefined;
	let rsvpSub: (() => void) | undefined;
	let rsvpPublish: (() => void) | undefined;
	let rsvpPublishTimeout: ReturnType<typeof setTimeout> | undefined;
	let checkoutLoading = false;
	let checkoutError = '';

	$: decodedRelays = decodeRelayParam(relay);
	$: decodedRelay = decodedRelays[0] || '';
	$: decodedAddress = decodeURIComponent(address || '');
	$: relays = Array.from(new Set([...decodedRelays, ...DEFAULT_RELAYS].filter(Boolean)));
	$: selectedRelay = decodedRelay || relays[0] || '';
	$: attendeeCount = attendees.length;
	$: spotsLeft = event?.capacity ? Math.max(0, event.capacity - attendeeCount) : null;
	$: capacityLabel = event?.capacity ? `${attendeeCount}/${event.capacity}` : `${attendeeCount}`;
	$: subscriptionKey = `${selectedRelay}|${decodedAddress}`;
	$: if (subscriptionKey && subscriptionKey !== lastKey) {
		lastKey = subscriptionKey;
		subscribe();
	}

	function splitAddress(value: string) {
		const [kind, author, ...rest] = value.split(':');
		return {
			kind: Number(kind),
			author,
			d: rest.join(':')
		};
	}

	function formatTime(timestamp: number | undefined) {
		if (!timestamp) return '';
		return new Intl.DateTimeFormat(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(timestamp * 1000));
	}

	function formatCalendarDay(timestamp: number | undefined) {
		if (!timestamp) return '';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric'
		}).format(new Date(timestamp * 1000));
	}

	function formatPrice(value: string | undefined, currency: string | undefined) {
		if (!value || !currency) return '';
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: currency.toUpperCase()
			}).format(Number(value));
		} catch {
			return `${value} ${currency.toUpperCase()}`;
		}
	}

	function decodeRelayParam(value: string) {
		return Array.from(
			new Set(
				value
					.split(',')
					.map((item) => {
						try {
							return normalizeURL(decodeURIComponent(item));
						} catch {
							return '';
						}
					})
					.filter(Boolean)
			)
		);
	}

	function handleConnectionStatus(message: WorkerMessage) {
		const status = asConnectionStatus(message);
		if (!status) return false;
		return true;
	}

	function subscribe() {
		eventSub?.();
		entranceDefinitionSub?.();
		rsvpSub?.();
		clearRsvpPublish();
		event = undefined;
		eventRaw = undefined;
		entranceDefinition = undefined;
		latestEntranceDefinition = undefined;
		attendees = [];
		attendeeEvents = {};
		hasRsvped = false;
		locallySubmittedRsvp = false;
		rsvpStatus = '';
		loading = Boolean(decodedAddress);

		const parsedAddress = splitAddress(decodedAddress);
		if (!parsedAddress.kind || !parsedAddress.author || !parsedAddress.d) {
			loading = false;
			return;
		}

		const eventRequests: RequestObject[] = [
			{
				kinds: [parsedAddress.kind],
				authors: [parsedAddress.author],
				tags: { '#d': [parsedAddress.d] },
				limit: 1,
				noCache: true,
				relays
			}
		];

		eventSub = useSubscription(
			`event_detail_${decodedAddress}_${selectedRelay}`,
			eventRequests,
			(message) => {
				if (handleConnectionStatus(message)) return;
				const parsed = asParsedEvent(message);
				if (!parsed) return;

				if (eventRaw && !isNewerCatalogEvent(parsed, eventRaw)) return;
				eventRaw = parsed;
				event = parseCalendarEvent(parsed, relays);
				subscribeEntranceDefinition(parsed);
				loading = false;
			},
			{ bytesPerEvent: 12 * 1024, closeOnEose: true }
		);

		rsvpSub = useSubscription(
			`event_rsvps_${decodedAddress}_${selectedRelay}`,
			[
				{
					kinds: [RSVP_KIND],
					noCache: true,
					relays,
					tags: { '#a': [decodedAddress] }
				}
			],
			(message) => {
				if (handleConnectionStatus(message)) return;
				const parsed = asParsedEvent(message);
				if (!parsed) return;

				const pubkey = parsed.pubkey();
				if (!pubkey) return;
				const content = asPreGeneric(parsed)?.content?.() || '';
				const tags = eventTags(parsed);
				const status = tags.find((tag) => tag[0] === 'status')?.[1] || content || 'accepted';
				const previous = attendeeEvents[pubkey];
				if (previous && Number(previous.createdAt()) >= Number(parsed.createdAt())) return;
				if (status === 'declined') {
					const next = { ...attendeeEvents };
					delete next[pubkey];
					attendeeEvents = next;
				} else if (status === 'accepted') {
					attendeeEvents = { ...attendeeEvents, [pubkey]: parsed };
				}
				if (pubkey === $key?.pub) locallySubmittedRsvp = false;
				recomputeRsvps();
			},
			{ bytesPerEvent: 4 * 1024 }
		);

		window.setTimeout(() => {
			loading = false;
		}, 1800);
	}

	function subscribeEntranceDefinition(calendarEvent: ParsedEvent) {
		entranceDefinitionSub?.();
		entranceDefinition = undefined;
		latestEntranceDefinition = undefined;
		const badgeAddress = extractTagValue(calendarEvent, 'entrance_badge') || '';
		const badge = splitAddress(badgeAddress);
		const calendarAuthor = calendarEvent.pubkey();
		if (
			badge.kind !== 30402 ||
			!badge.author ||
			!badge.d ||
			!calendarAuthor ||
			badge.author !== calendarAuthor
		) {
			return;
		}

		entranceDefinitionSub = useSubscription(
			`event_entrance_definition_v1_${badgeAddress}_${selectedRelay}`,
			[
				{
					kinds: [30402],
					authors: [badge.author],
					tags: { '#d': [badge.d] },
					limit: 1,
					relays,
					cacheFirst: true
				}
			],
			(message) => {
				if (handleConnectionStatus(message)) return;
				const parsed = asParsedEvent(message);
				if (!parsed) return;
				if (latestEntranceDefinition && !isNewerCatalogEvent(parsed, latestEntranceDefinition)) {
					return;
				}
				latestEntranceDefinition = parsed;
				const expiresAt = catalogExpiration(parsed);
				entranceDefinition =
					catalogAddress(parsed) === badgeAddress &&
					parsed.pubkey() === calendarAuthor &&
					isCatalogDefinition(parsed) &&
					catalogEventAddress(parsed) === decodedAddress &&
					catalogMaxUses(parsed) === 1 &&
					catalogAvailability(parsed) === 'available' &&
					Boolean(expiresAt && expiresAt > now())
						? parsed
						: undefined;
			},
			{ bytesPerEvent: 8 * 1024, closeOnEose: true }
		);
	}

	function recomputeRsvps() {
		const attendeePubkeys = Object.keys(attendeeEvents);
		if ($key?.pub && locallySubmittedRsvp && !attendeeEvents[$key.pub]) {
			attendeePubkeys.push($key.pub);
		}
		attendees = attendeePubkeys;
		hasRsvped = Boolean($key?.pub && (attendeeEvents[$key.pub] || locallySubmittedRsvp));
	}

	function clearRsvpPublish() {
		rsvpPublish?.();
		rsvpPublish = undefined;
		if (rsvpPublishTimeout) clearTimeout(rsvpPublishTimeout);
		rsvpPublishTimeout = undefined;
	}

	function submitRsvp(status: 'accepted' | 'declined') {
		if (!$key?.pub) {
			go('login');
			return;
		}
		if (!eventRaw || !selectedRelay) return;

		const pubkey = $key.pub;
		const eventAuthor = eventRaw.pubkey();
		if (!pubkey || !eventAuthor) return;
		const template: EventTemplate = {
			kind: RSVP_KIND,
			content: status,
			created_at: now(),
			tags: [
				['a', decodedAddress],
				['d', `${decodedAddress}:${pubkey}`],
				['status', status],
				['p', eventAuthor]
			]
		};
		rsvpStatus = status === 'declined' ? 'Cancelling…' : 'Requesting a place…';
		checkoutError = '';
		clearRsvpPublish();
		let settled = false;
		const complete = () => {
			if (settled) return;
			settled = true;
			clearRsvpPublish();
			if (status === 'declined') {
				locallySubmittedRsvp = false;
				const next = { ...attendeeEvents };
				delete next[pubkey];
				attendeeEvents = next;
				rsvpStatus = 'RSVP cancelled';
			} else {
				locallySubmittedRsvp = true;
				rsvpStatus = 'You’re going';
			}
			recomputeRsvps();
		};
		try {
			const unsubscribe = usePublish(
				`event_rsvp_${decodedAddress}_${pubkey}`,
				template,
				(message: WorkerMessage) => {
					const publishStatus = asConnectionStatus(message);
					if (publishStatus?.status() === 'true') complete();
				},
				{
					trackStatus: true,
					defaultRelays: [selectedRelay],
					subId: `event_rsvps_${decodedAddress}_${selectedRelay}`
				}
			);
			if (settled) {
				unsubscribe();
			} else {
				rsvpPublish = unsubscribe;
				rsvpPublishTimeout = setTimeout(() => {
					if (settled) return;
					settled = true;
					clearRsvpPublish();
					checkoutError = 'The community relay did not confirm the RSVP.';
					rsvpStatus = '';
				}, 5000);
			}
		} catch (error) {
			settled = true;
			clearRsvpPublish();
			checkoutError = error instanceof Error ? error.message : 'RSVP could not be saved';
			rsvpStatus = '';
		}
	}

	async function startCheckout() {
		if (!$key?.pub) {
			go('login');
			return;
		}
		if (!entranceDefinition || !catalogPrice(entranceDefinition) || !selectedRelay) return;
		checkoutLoading = true;
		checkoutError = '';
		try {
			const body = JSON.stringify({ community: selectedRelay, eventAddress: decodedAddress });
			const url = paymentServiceUrl('/stripe/checkout');
			const authorization = await makeInviteAuthorization(url, body);
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization },
				body
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || result.error || 'Checkout unavailable');
			window.location.assign(result.url);
		} catch (error) {
			checkoutError = error instanceof Error ? error.message : 'Checkout unavailable';
			checkoutLoading = false;
		}
	}

	function startEcashCheckout() {
		if (!$key?.pub) {
			go('login');
			return;
		}
		if (!eventRaw || !entranceDefinition || !selectedRelay) return;
		const amount = catalogPriceSats(entranceDefinition);
		const badgeAddress = catalogAddress(entranceDefinition);
		if (!amount || !badgeAddress) return;
		const context = encodeURIComponent(
			JSON.stringify({
				community: selectedRelay,
				service: adminServiceBaseUrl(selectedRelay),
				eventAddress: decodedAddress,
				badgeAddress,
				amount
			})
		);
		const eventId = eventRaw.id();
		const organizer = eventRaw.pubkey();
		if (!eventId || !organizer) return;
		const nevent = nip19.neventEncode({ id: eventId, relays: [selectedRelay] });
		go(`ecash:${organizer}:${nevent}:${context}`);
	}

	onDestroy(() => {
		eventSub?.();
		entranceDefinitionSub?.();
		rsvpSub?.();
		clearRsvpPublish();
	});
</script>

<section class="flex h-full flex-col overflow-hidden bg-base-100">
	<ModalHandle />

	<div class="flex-1 overflow-auto bg-base-100 pb-28">
		{#if loading}
			<div class="space-y-5 p-5">
				<div class="h-64 animate-pulse rounded-b-[2rem] rounded-t-xl bg-base-200"></div>
				<div class="space-y-3">
					<div class="h-4 w-40 animate-pulse rounded bg-base-200"></div>
					<div class="h-8 w-4/5 animate-pulse rounded bg-base-200"></div>
					<div class="h-8 w-3/5 animate-pulse rounded bg-base-200"></div>
				</div>
				<div class="grid grid-cols-3 gap-2">
					<div class="h-20 animate-pulse rounded-xl bg-base-200"></div>
					<div class="h-20 animate-pulse rounded-xl bg-base-200"></div>
					<div class="h-20 animate-pulse rounded-xl bg-base-200"></div>
				</div>
			</div>
		{:else if event}
			<article>
				<header class="relative overflow-hidden bg-base-200">
					{#if event.image}
						<img
							src={proxyAvatarUrl(event.image)}
							alt={event.title}
							class="absolute inset-0 h-full w-full object-cover"
						/>
						<div
							class="absolute inset-0 bg-gradient-to-b from-black/20 via-black/45 to-base-100"
						></div>
					{:else}
						<div class="absolute inset-0 bg-base-200"></div>
						<div
							class="absolute inset-0 opacity-70"
							style="background-image: radial-gradient(circle at 20% 10%, hsl(var(--p) / 0.22), transparent 34%), radial-gradient(circle at 80% 0%, hsl(var(--a) / 0.16), transparent 30%), linear-gradient(145deg, hsl(var(--b2)), hsl(var(--b1)));"
						></div>
					{/if}

					<div class="relative flex min-h-[320px] flex-col justify-end px-5 pb-6 pt-20">
						<div class="mb-5 flex items-end justify-between gap-4">
							<div
								class="rounded-xl bg-base-100/95 p-3 text-center shadow-xl shadow-base-content/10 backdrop-blur"
							>
								<p class="text-xs font-black uppercase text-primary">
									{formatCalendarDay(event.start).split(' ')[0]}
								</p>
								<p class="text-3xl font-black leading-none text-base-content">
									{formatCalendarDay(event.start).split(' ')[1]}
								</p>
							</div>
						</div>

						<p class="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
							<Icon icon="mdi:calendar-clock" class="text-lg" />
							<span>{formatTime(event.start)}</span>
						</p>
						<h1 class="max-w-[11ch] text-4xl font-black leading-[0.95] text-base-content">
							{event.title}
						</h1>
					</div>
				</header>

				<div class="-mt-3 space-y-6 px-5 pb-8">
					<section
						class="relative rounded-2xl bg-base-100 p-4 shadow-xl shadow-base-content/10 ring-1 ring-base-200"
					>
						<div
							class="grid grid-cols-3 divide-x divide-base-200 overflow-hidden rounded-xl bg-base-200"
						>
							<div class="p-3">
								<p class="text-[11px] font-semibold text-base-content/50">Going</p>
								<p class="mt-1 font-mono text-xl font-black tabular-nums">{attendeeCount}</p>
							</div>
							<div class="p-3">
								<p class="text-[11px] font-semibold text-base-content/50">Capacity</p>
								<p class="mt-1 font-mono text-xl font-black tabular-nums">{capacityLabel}</p>
							</div>
							<div class="p-3">
								<p class="text-[11px] font-semibold text-base-content/50">Spots</p>
								<p class="mt-1 font-mono text-xl font-black tabular-nums">
									{spotsLeft === null ? 'Open' : spotsLeft || 'Full'}
								</p>
							</div>
						</div>

						{#if event.location}
							<div class="mt-4 flex items-start gap-3 text-sm font-medium text-base-content/75">
								<div
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
								>
									<Icon icon="mdi:map-marker-outline" class="text-xl" />
								</div>
								<p class="min-w-0 pt-1 leading-5">{event.location}</p>
							</div>
						{/if}
					</section>

					{#if event.description}
						<section class="space-y-2">
							<h2 class="text-sm font-black text-base-content">About</h2>
							<p class="max-w-prose whitespace-pre-wrap text-[15px] leading-7 text-base-content/75">
								{event.description}
							</p>
						</section>
					{/if}

					<section>
						<div class="mb-3 flex items-center justify-between">
							<h2 class="text-sm font-black text-base-content">Who's going</h2>
							<span class="font-mono text-xs font-semibold tabular-nums text-base-content/45">
								{attendees.length}
							</span>
						</div>
						{#if attendees.length}
							<div class="grid gap-2">
								{#each attendees as pubkey (pubkey)}
									<button
										type="button"
										class="group flex w-full items-center gap-3 rounded-xl bg-base-200 p-3 text-left transition duration-200 hover:bg-base-300 active:scale-[0.99]"
										on:click={() => go('nprofile:' + pubkey)}
									>
										<Avatar {pubkey} size="lg" link={false} customClass="ring-2 ring-base-100" />
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold text-base-content">
												<User {pubkey} link={false} />
											</p>
											<p class="text-xs font-medium text-base-content/45">RSVP accepted</p>
										</div>
										<Icon
											icon="mdi:chevron-right"
											class="ml-auto text-xl text-base-content/25 transition group-hover:translate-x-0.5 group-hover:text-base-content/50"
										/>
									</button>
								{/each}
							</div>
						{:else}
							<div class="rounded-2xl bg-base-200 p-5 text-center">
								<div
									class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-base-100 text-primary"
								>
									<Icon icon="mdi:account-group-outline" class="text-2xl" />
								</div>
								<p class="text-sm font-semibold text-base-content">No RSVPs yet</p>
								<p class="mt-1 text-sm leading-5 text-base-content/55">
									Be the first person on the list.
								</p>
							</div>
						{/if}
					</section>
				</div>
			</article>
		{:else}
			<div class="flex h-full items-center justify-center px-8 text-center">
				<div class="max-w-xs">
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-base-200 text-base-content/45"
					>
						<Icon icon="mdi:calendar-remove-outline" class="text-3xl" />
					</div>
					<h1 class="text-xl font-black">Event not found</h1>
					<p class="mt-2 text-sm leading-6 text-base-content/60">
						The selected relay did not return this event.
					</p>
				</div>
			</div>
		{/if}
	</div>

	{#if event}
		<footer
			class="absolute bottom-0 left-0 right-0 border-t border-base-200 bg-base-100/90 px-5 pb-safe pt-3 shadow-[0_-18px_40px_hsl(var(--b1)/0.92)] backdrop-blur"
		>
			{#if checkoutError}<p class="mb-2 text-xs font-bold text-error">{checkoutError}</p>{/if}
			<div class="mb-2 flex items-center justify-between gap-3">
				<div class="min-w-0">
					<p class="truncate text-sm font-bold">{event.title}</p>
					<p class="text-xs font-medium text-base-content/50">
						{rsvpStatus || (hasRsvped ? 'You are on the list' : `${attendeeCount} going`)}
					</p>
				</div>
				{#if entranceDefinition}
					{#if catalogPriceSats(entranceDefinition)}
						<button
							type="button"
							class="btn min-w-28 rounded-xl border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100"
							disabled={checkoutLoading || spotsLeft === 0}
							on:click={startEcashCheckout}>₿ {catalogPriceSats(entranceDefinition)} sats</button
						>
					{/if}
					<button
						type="button"
						class="btn btn-primary min-w-32 rounded-xl shadow-lg shadow-primary/20 transition active:scale-[0.98]"
						disabled={checkoutLoading || spotsLeft === 0}
						on:click={startCheckout}
					>
						{checkoutLoading
							? 'Opening…'
							: `Buy · ${formatPrice(catalogPrice(entranceDefinition), catalogCurrency(entranceDefinition))}`}
					</button>
				{:else if event.entranceBadgeAddress}
					<span class="text-xs font-bold text-base-content/45">Ticket unavailable</span>
				{/if}
				<button
					type="button"
					class={`btn min-w-28 rounded-xl shadow-lg transition active:scale-[0.98] ${hasRsvped ? 'btn-outline' : 'btn-primary shadow-primary/20'}`}
					disabled={Boolean(rsvpStatus?.endsWith('…')) || (!hasRsvped && spotsLeft === 0)}
					on:click={() => submitRsvp(hasRsvped ? 'declined' : 'accepted')}
				>
					{hasRsvped ? 'Cancel RSVP' : spotsLeft === 0 ? 'Event full' : 'RSVP'}
				</button>
			</div>
		</footer>
	{/if}
</section>
