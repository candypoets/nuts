<script lang="ts">
	import { resolve } from '$app/paths';
	import { type ParsedEvent, type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isParsedEvent } from '@candypoets/nipworker/utils';
	import imageCompression from 'browser-image-compression';
	import { ArrowLeft, CalendarDays, Clock, MapPin, Plus, Tag, UsersRound } from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import type { EventTemplate } from 'nostr-tools';
	import { selectedAdminRelayUrl } from 'src/controller';
	import { parsedEventTags } from 'src/lib/adminRelays';
	import { uploadFile } from 'src/lib/upload';
	import { now } from 'src/lib/period';
	import { onDestroy } from 'svelte';

	type EventCategory = 'training' | 'match' | 'meeting' | 'social';

	type CommunityEvent = {
		id: string;
		title: string;
		summary: string;
		category: EventCategory;
		startsAt: number;
		endsAt?: number;
		location: string;
		capacity?: number;
		image?: string;
		createdAt: number;
	};

	const categoryOptions: Array<{ label: string; value: EventCategory }> = [
		{ label: 'Training', value: 'training' },
		{ label: 'Match', value: 'match' },
		{ label: 'Meeting', value: 'meeting' },
		{ label: 'Social', value: 'social' }
	];

	let loadedRelayUrl = '';
	let relayUrl = '';
	let title = '';
	let summary = '';
	let image = '';
	let location = '';
	let capacity = '';
	let category: EventCategory = 'training';
	let startsAt = defaultDateTimeLocal(24);
	let endsAt = '';
	let publishStatus = '';
	let uploadStatus = '';
	let loadingEvents = true;
	let events: CommunityEvent[] = [];
	let publishUnsubscribe: (() => void) | undefined;
	let unsubscribeEvents: (() => void) | undefined;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		loadCommunityRelay();
		subscribeEvents();
	}
	$: canCreateEvent = Boolean(relayUrl && title.trim() && startsAt);
	$: previewEvent = buildPreviewEvent(
		title,
		summary,
		image,
		category,
		startsAt,
		endsAt,
		location,
		capacity
	);

	function loadCommunityRelay() {
		relayUrl = $selectedAdminRelayUrl ? normalizeURL($selectedAdminRelayUrl) : '';
		publishStatus = '';
	}

	function subscribeEvents() {
		unsubscribeEvents?.();
		events = [];
		loadingEvents = Boolean(relayUrl);
		if (!relayUrl) {
			loadingEvents = false;
			return;
		}

		const requests: RequestObject[] = [
			{
				kinds: [31923],
				limit: 100,
				relays: [relayUrl],
				cacheFirst: false,
				noCache: true
			}
		];

		unsubscribeEvents = useSubscription(
			'admin_events_' + relayUrl,
			requests,
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				loadingEvents = false;
				upsertEvent(parseCommunityEvent(parsedEvent));
			},
			{ bytesPerEvent: 20 * 1024 }
		);

		window.setTimeout(() => {
			loadingEvents = false;
		}, 700);
	}

	function parseCommunityEvent(event: ParsedEvent): CommunityEvent | undefined {
		if (event.kind() !== 31923) return undefined;
		const tags = parsedEventTags(event);
		const d = tags.find((tag) => tag[0] === 'd')?.[1];
		const start = Number(tags.find((tag) => tag[0] === 'start')?.[1]);
		if (!d || !Number.isFinite(start)) return undefined;

		const title = tags.find((tag) => tag[0] === 'title')?.[1] || d;
		const summary = tags.find((tag) => tag[0] === 'summary')?.[1] || '';
		const categoryTag = tags.find((tag) => tag[0] === 't')?.[1];
		const category = isEventCategory(categoryTag) ? categoryTag : 'social';
		const end = Number(tags.find((tag) => tag[0] === 'end')?.[1]);
		const capacityValue = Number(tags.find((tag) => tag[0] === 'capacity')?.[1]);

		return {
			id: `${event.pubkey()}:${d}`,
			title,
			summary,
			category,
			startsAt: start,
			endsAt: Number.isFinite(end) ? end : undefined,
			location: tags.find((tag) => tag[0] === 'location')?.[1] || '',
			capacity: Number.isFinite(capacityValue) ? capacityValue : undefined,
			image: tags.find((tag) => tag[0] === 'image')?.[1],
			createdAt: Number(event.createdAt())
		};
	}

	function isEventCategory(value: string | undefined): value is EventCategory {
		return value === 'training' || value === 'match' || value === 'meeting' || value === 'social';
	}

	function upsertEvent(event: CommunityEvent | undefined) {
		if (!event) return;
		const existingIndex = events.findIndex((item) => item.id === event.id);
		if (existingIndex !== -1) {
			if (event.createdAt <= events[existingIndex].createdAt) return;
			events = events.map((item, index) => (index === existingIndex ? event : item));
		} else {
			events = [...events, event];
		}
		events = [...events].sort((a, b) => a.startsAt - b.startsAt);
	}

	function defaultDateTimeLocal(hoursFromNow: number) {
		const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
		date.setMinutes(0, 0, 0);
		return toDateTimeLocal(date);
	}

	function toDateTimeLocal(date: Date) {
		const offset = date.getTimezoneOffset() * 60 * 1000;
		return new Date(date.getTime() - offset).toISOString().slice(0, 16);
	}

	function timestampFromLocal(value: string) {
		return Math.floor(new Date(value).getTime() / 1000);
	}

	function slugFromTitle(value: string) {
		const slug = value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
		return `${slug || 'event'}-${now()}`;
	}

	function formatEventTime(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(timestamp * 1000));
	}

	async function compressIllustration(file: File) {
		if (!file.type.startsWith('image/')) return file;
		return await imageCompression(file, {
			maxSizeMB: 1,
			maxWidthOrHeight: 1920,
			useWebWorker: true,
			fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
			initialQuality: 0.82
		});
	}

	function buildPreviewEvent(
		previewTitle: string,
		previewSummary: string,
		previewImage: string,
		previewCategory: EventCategory,
		previewStartsAt: string,
		previewEndsAt: string,
		previewLocation: string,
		previewCapacity: string
	): CommunityEvent {
		const startsAtTimestamp = previewStartsAt ? timestampFromLocal(previewStartsAt) : now();
		const endsAtTimestamp = previewEndsAt ? timestampFromLocal(previewEndsAt) : undefined;
		const capacityValue = previewCapacity
			? Math.max(1, Math.floor(Number(previewCapacity)))
			: undefined;
		return {
			id: 'preview',
			title: previewTitle.trim() || 'Event title',
			summary: previewSummary.trim(),
			category: previewCategory,
			startsAt: startsAtTimestamp,
			endsAt: endsAtTimestamp,
			location: previewLocation.trim(),
			capacity: capacityValue,
			image: previewImage.trim(),
			createdAt: now()
		};
	}

	async function uploadIllustration(event: Event) {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement)) return;
		const file = input.files?.[0];
		if (!file) return;
		uploadStatus = 'Preparing illustration...';
		try {
			let uploadFileValue = file;
			try {
				uploadFileValue = await compressIllustration(file);
			} catch {
				uploadFileValue = file;
			}
			uploadStatus = 'Uploading illustration...';
			const result = await uploadFile(uploadFileValue, {
				preferUserServers: true,
				alt: title.trim() || uploadFileValue.name || file.name,
				includeMimeTag: true,
				includeDimensions: true
			});
			image = result.url;
			uploadStatus = 'Illustration uploaded';
		} catch (err) {
			uploadStatus = err instanceof Error ? err.message : 'Illustration upload failed';
		} finally {
			input.value = '';
		}
	}

	function createEvent() {
		if (!canCreateEvent) return;
		const startsAtTimestamp = timestampFromLocal(startsAt);
		const endsAtTimestamp = endsAt ? timestampFromLocal(endsAt) : undefined;
		const d = slugFromTitle(title);
		const eventTitle = title.trim();
		const eventSummary = summary.trim();
		const eventImage = image.trim();
		const eventLocation = location.trim();
		const eventCapacity = capacity ? Math.max(1, Math.floor(Number(capacity))) : undefined;
		const tags = [
			['d', d],
			['title', eventTitle],
			['summary', eventSummary],
			['start', String(startsAtTimestamp)],
			['t', category]
		];
		if (endsAtTimestamp) tags.push(['end', String(endsAtTimestamp)]);
		if (eventImage) tags.push(['image', eventImage]);
		if (eventLocation) tags.push(['location', eventLocation]);
		if (eventCapacity) tags.push(['capacity', String(eventCapacity)]);

		const event: EventTemplate = {
			kind: 31923,
			content: eventSummary,
			created_at: now(),
			tags
		};

		publishUnsubscribe?.();
		publishStatus = 'Publishing event...';
		publishUnsubscribe = usePublish(
			'admin_event_' + relayUrl + '_' + d,
			event,
			() => {
				publishStatus = 'Event published';
			},
			{
				trackStatus: true,
				defaultRelays: [relayUrl]
			}
		);

		events = [
			{
				id: d,
				title: eventTitle,
				summary: eventSummary,
				category,
				startsAt: startsAtTimestamp,
				endsAt: endsAtTimestamp,
				location: eventLocation,
				capacity: eventCapacity,
				image: eventImage,
				createdAt: now()
			},
			...events
		];
		title = '';
		summary = '';
		image = '';
		uploadStatus = '';
		location = '';
		capacity = '';
		category = 'training';
		startsAt = defaultDateTimeLocal(24);
		endsAt = '';
	}

	onDestroy(() => {
		unsubscribeEvents?.();
		publishUnsubscribe?.();
	});
</script>

<svelte:head>
	<title>Events - Nuts</title>
</svelte:head>

<main class="px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto grid max-w-[1500px] gap-6">
		<a
			href={resolve('/admin')}
			class="inline-flex w-fit items-center gap-2 rounded-lg text-sm font-bold text-stone-600 transition hover:text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
		>
			<ArrowLeft size={17} />
			Dashboard
		</a>

		<section
			class="overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm shadow-stone-950/5"
		>
			<div class="grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_420px]">
				<div>
					<p class="text-sm font-black text-emerald-900">Events</p>
					<h1 class="mt-3 text-3xl font-black text-[#171614]">Create community event</h1>
					<p class="mt-3 max-w-2xl text-lg font-medium leading-8 text-stone-600">
						Add trainings, matches, meetings, and social events for members.
					</p>
					<p class="mt-4 truncate text-sm font-bold text-stone-500">{relayUrl}</p>
				</div>

				<div class="rounded-2xl bg-[#111f19] p-6 text-white">
					<div class="grid h-12 w-12 place-items-center rounded-xl bg-emerald-800">
						<CalendarDays size={24} />
					</div>
					<p class="mt-5 text-2xl font-black">Fast event publishing</p>
					<p class="mt-2 text-sm font-medium leading-6 text-white/70">
						Published events are sent to this community relay and can be reused by calendar and
						member-facing views.
					</p>
				</div>
			</div>
		</section>

		<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
			<section
				class="rounded-2xl border border-stone-200 bg-white/85 p-6 shadow-sm shadow-stone-950/5 lg:p-8"
			>
				<div class="grid gap-5">
					<label class="grid gap-2">
						<span class="text-sm font-black text-stone-700">Title</span>
						<input
							class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
							type="text"
							placeholder="Saturday training"
							bind:value={title}
						/>
					</label>

					<label class="grid gap-2">
						<span class="text-sm font-black text-stone-700">Summary</span>
						<textarea
							class="min-h-28 rounded-xl border border-stone-200 bg-white px-4 py-3 text-base font-medium text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
							placeholder="What members should know before attending."
							bind:value={summary}
						></textarea>
					</label>

					<div class="grid gap-2">
						<span class="text-sm font-black text-stone-700">Illustration</span>
						<div class="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
							<label
								class="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus-within:ring-2 focus-within:ring-emerald-800/30 active:scale-[0.98]"
							>
								Upload image
								<input
									class="sr-only"
									type="file"
									accept="image/*"
									on:change={uploadIllustration}
								/>
							</label>
							<input
								class="h-12 min-w-0 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
								type="url"
								placeholder="Image URL"
								bind:value={image}
							/>
						</div>
						{#if uploadStatus}
							<p class="text-sm font-bold text-stone-600">{uploadStatus}</p>
						{/if}
					</div>

					<div class="grid gap-5 md:grid-cols-2">
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Starts</span>
							<input
								class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
								type="datetime-local"
								bind:value={startsAt}
							/>
						</label>
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Ends</span>
							<input
								class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
								type="datetime-local"
								bind:value={endsAt}
							/>
						</label>
					</div>

					<div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_160px_220px]">
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Location</span>
							<input
								class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
								type="text"
								placeholder="Club field"
								bind:value={location}
							/>
						</label>
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Capacity</span>
							<input
								class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
								type="number"
								min="1"
								step="1"
								placeholder="24"
								bind:value={capacity}
							/>
						</label>
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Category</span>
							<select
								class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
								bind:value={category}
							>
								{#each categoryOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
					</div>

					<div class="flex flex-wrap items-center gap-4">
						<button
							type="button"
							class="inline-flex h-12 items-center gap-3 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!canCreateEvent}
							on:click={createEvent}
						>
							<Plus size={18} />
							Create event
						</button>
						{#if publishStatus}
							<p class="text-sm font-black text-stone-600">{publishStatus}</p>
						{/if}
					</div>
				</div>
			</section>

			<aside
				class="rounded-2xl border border-stone-200 bg-white/85 p-6 shadow-sm shadow-stone-950/5 xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:overflow-hidden"
			>
				<h2 class="text-xl font-black text-[#171614]">Upcoming events</h2>
				<p class="mt-2 text-sm font-medium leading-6 text-stone-500">
					Events are loaded from this community relay.
				</p>

				<div class="mt-6 grid gap-3 xl:max-h-[calc(100vh-15rem)] xl:overflow-y-auto xl:pr-1">
					<div class="rounded-xl border border-amber-200 bg-white p-5">
						{#if previewEvent.image}
							<img
								class="mb-4 aspect-[16/9] w-full rounded-xl object-cover"
								src={previewEvent.image}
								alt=""
							/>
						{/if}
						<div class="flex items-start justify-between gap-3">
							<h3 class="min-w-0 text-lg font-black text-[#171614]">{previewEvent.title}</h3>
							<span
								class="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-xs font-black text-amber-800"
							>
								Preview
							</span>
						</div>
						<div class="mt-3">
							<span
								class="rounded-md bg-emerald-50 px-2 py-1 text-xs font-black capitalize text-emerald-900"
							>
								{previewEvent.category}
							</span>
						</div>
						<div class="mt-4 grid gap-2 text-sm font-semibold text-stone-600">
							<div class="flex items-center gap-2">
								<Clock size={15} />
								<span>{formatEventTime(previewEvent.startsAt)}</span>
							</div>
							{#if previewEvent.location}
								<div class="flex items-center gap-2">
									<MapPin size={15} />
									<span>{previewEvent.location}</span>
								</div>
							{/if}
							{#if previewEvent.capacity}
								<div class="flex items-center gap-2">
									<UsersRound size={15} />
									<span>{previewEvent.capacity} spots</span>
								</div>
							{/if}
							<div class="flex items-center gap-2">
								<Tag size={15} />
								<span class="capitalize">{previewEvent.category}</span>
							</div>
						</div>
						{#if previewEvent.summary}
							<p class="mt-4 text-sm font-medium leading-6 text-stone-500">
								{previewEvent.summary}
							</p>
						{/if}
					</div>

					{#if loadingEvents}
						<div class="rounded-xl bg-stone-50 p-5">
							<p class="font-black text-stone-700">Loading events</p>
							<p class="mt-1 text-sm font-medium text-stone-500">Checking the community relay.</p>
						</div>
					{:else if !events.length}
						<div class="rounded-xl bg-stone-50 p-5">
							<p class="font-black text-stone-700">No events yet</p>
							<p class="mt-1 text-sm font-medium text-stone-500">
								Create the first event for this community.
							</p>
						</div>
					{/if}

					{#each events as event (event.id)}
						<div class="rounded-xl border border-stone-200 bg-white p-5">
							{#if event.image}
								<img
									class="mb-4 aspect-[16/9] w-full rounded-xl object-cover"
									src={event.image}
									alt=""
								/>
							{/if}
							<div class="flex items-start justify-between gap-3">
								<h3 class="min-w-0 text-lg font-black text-[#171614]">{event.title}</h3>
								<span
									class="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-black capitalize text-emerald-900"
								>
									{event.category}
								</span>
							</div>
							<div class="mt-4 grid gap-2 text-sm font-semibold text-stone-600">
								<div class="flex items-center gap-2">
									<Clock size={15} />
									<span>{formatEventTime(event.startsAt)}</span>
								</div>
								{#if event.location}
									<div class="flex items-center gap-2">
										<MapPin size={15} />
										<span>{event.location}</span>
									</div>
								{/if}
								{#if event.capacity}
									<div class="flex items-center gap-2">
										<UsersRound size={15} />
										<span>{event.capacity} spots</span>
									</div>
								{/if}
								<div class="flex items-center gap-2">
									<Tag size={15} />
									<span class="capitalize">{event.category}</span>
								</div>
							</div>
							{#if event.summary}
								<p class="mt-4 text-sm font-medium leading-6 text-stone-500">{event.summary}</p>
							{/if}
						</div>
					{/each}
				</div>
			</aside>
		</div>
	</div>
</main>
