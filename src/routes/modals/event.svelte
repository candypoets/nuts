<script lang="ts">
	import Icon from '@iconify/svelte';
	import type {
		ConnectionStatus,
		ParsedEvent,
		RequestObject,
		WorkerMessage
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { asConnectionStatus, asParsedEvent, asPreGeneric } from '@candypoets/nipworker/utils';
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
	import { now } from 'src/lib/period';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { key } from 'src/controller';
	import { writeRelays } from 'src/controller/nostr';
	import { go } from 'src/routes/modals/modal';
	import { onDestroy } from 'svelte';

	export let relay = '';
	export let address = '';

	let event: CalendarEventCard | undefined;
	let eventRaw: ParsedEvent | undefined;
	let attendees: string[] = [];
	let attendeeEvents: Record<string, ParsedEvent> = {};
	let connectionStatus: Record<string, ConnectionStatus> = {};
	let loading = true;
	let rsvpStatus = '';
	let hasRsvped = false;
	let lastKey = '';
	let eventSub: (() => void) | undefined;
	let rsvpSub: (() => void) | undefined;
	let publishSub: (() => void) | undefined;

	$: decodedRelays = decodeRelayParam(relay);
	$: decodedRelay = decodedRelays[0] || '';
	$: decodedAddress = decodeURIComponent(address || '');
	$: relays = Array.from(new Set([...decodedRelays, ...DEFAULT_RELAYS].filter(Boolean)));
	$: selectedRelay = decodedRelay || relays[0] || '';
	$: fetchRelayLabels = relays.map(relayLabel);
	$: attendeeCount = attendees.length || event?.attendeeCount || 0;
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

	function relayLabel(url: string) {
		return url
			.replace(/^wss?:\/\//, '')
			.replace(/^relay\./, '')
			.replace(/\/$/, '');
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
		const relayUrl = status.relayUrl();
		if (relayUrl) connectionStatus = { ...connectionStatus, [normalizeURL(relayUrl)]: status };
		return true;
	}

	function subscribe() {
		eventSub?.();
		rsvpSub?.();
		event = undefined;
		eventRaw = undefined;
		attendees = [];
		attendeeEvents = {};
		hasRsvped = false;
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

				eventRaw = parsed;
				event = parseCalendarEvent(parsed, relays);
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
				const status = content || tags.find((tag) => tag[0] === 'status')?.[1] || 'accepted';
				if (status && status !== 'accepted') return;

				attendeeEvents = { ...attendeeEvents, [pubkey]: parsed };
				attendees = Object.keys(attendeeEvents);
				hasRsvped = Boolean($key?.pub && attendees.includes($key.pub));
			},
			{ bytesPerEvent: 4 * 1024, closeOnEose: true }
		);

		window.setTimeout(() => {
			loading = false;
		}, 1800);
	}

	function publishRsvp() {
		if (!$key?.pub) {
			go('login');
			return;
		}
		if (!eventRaw || hasRsvped) return;

		const rsvpEvent = eventRaw;
		const tags = eventTags(eventRaw);
		const pTags = tags.filter((tag): tag is string[] => tag[0] === 'p' && tag.every(Boolean));
		const pubkey = $key.pub;
		if (!pubkey) return;
		const template: EventTemplate = {
			kind: RSVP_KIND,
			content: 'accepted',
			created_at: now(),
			tags: [
				['a', decodedAddress],
				['d', `${decodedAddress}:${pubkey}`],
				['status', 'accepted'],
				...pTags
			]
		};

		const publishRelays: string[] = Array.from(
			new Set(
				[selectedRelay, ...$writeRelays, ...relays].filter(
					(relay): relay is string => typeof relay === 'string' && Boolean(relay)
				)
			)
		);
		rsvpStatus = 'Publishing RSVP...';
		publishSub?.();
		publishSub = usePublish(
			`event_rsvp_${decodedAddress}_${pubkey}`,
			template,
			(message: WorkerMessage) => {
				const status = asConnectionStatus(message);
				if (status?.status()?.toString() === 'true') {
					rsvpStatus = 'You are going';
					hasRsvped = true;
					attendeeEvents = { ...attendeeEvents, [pubkey]: rsvpEvent };
					attendees = Object.keys(attendeeEvents);
				}
			},
			{ defaultRelays: publishRelays, trackStatus: true }
		);
	}

	onDestroy(() => {
		eventSub?.();
		rsvpSub?.();
		publishSub?.();
	});
</script>

<section class="flex h-full flex-col overflow-hidden bg-base-100">
	<ModalHandle />

	<div class="flex-1 overflow-auto bg-base-100 pb-28">
		{#if loading}
			<div class="space-y-5 p-5">
				<div class="rounded-xl bg-base-200/70 p-3">
					<p
						class="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-base-content/45"
					>
						<Icon icon="mdi:server-network" class="text-sm" />
						Fetch relays
					</p>
					<div class="flex flex-wrap gap-1.5">
						{#each fetchRelayLabels as relayName, index (`loading-${relayName}-${index}`)}
							<span
								class="max-w-full truncate rounded-full bg-base-100 px-2.5 py-1 text-xs font-semibold text-base-content/70"
							>
								{relayName}
							</span>
						{/each}
					</div>
				</div>
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
							<div
								class="rounded-full bg-base-100/90 px-3 py-1.5 text-xs font-semibold text-base-content/70 backdrop-blur"
							>
								{fetchRelayLabels[0]}
								{#if fetchRelayLabels.length > 1}
									+{fetchRelayLabels.length - 1}
								{/if}
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

						<div class="mt-4 rounded-xl bg-base-200/70 p-3">
							<p
								class="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-base-content/45"
							>
								<Icon icon="mdi:server-network" class="text-sm" />
								Fetch relays
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#each fetchRelayLabels as relayName, index (`${relayName}-${index}`)}
									<span
										class="max-w-full truncate rounded-full bg-base-100 px-2.5 py-1 text-xs font-semibold text-base-content/70"
									>
										{relayName}
									</span>
								{/each}
							</div>
						</div>
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
			<div class="mb-2 flex items-center justify-between gap-3">
				<div class="min-w-0">
					<p class="truncate text-sm font-bold">{event.title}</p>
					<p class="text-xs font-medium text-base-content/50">
						{rsvpStatus || (hasRsvped ? 'You are on the list' : `${attendeeCount} going`)}
					</p>
				</div>
				<button
					type="button"
					class="btn btn-primary min-w-28 rounded-xl shadow-lg shadow-primary/20 transition active:scale-[0.98]"
					disabled={hasRsvped || spotsLeft === 0}
					on:click={publishRsvp}
				>
					{#if hasRsvped}
						Going
					{:else if spotsLeft === 0}
						Full
					{:else}
						RSVP
					{/if}
				</button>
			</div>
		</footer>
	{/if}
</section>
