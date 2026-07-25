<script lang="ts">
	import { resolve } from 'src/lib/paths';
	import { type ParsedEvent, type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isParsedEvent } from '@candypoets/nipworker/utils';
	import imageCompression from 'browser-image-compression';
	import {
		ArrowLeft,
		BadgeEuro,
		Bitcoin,
		CalendarDays,
		Check,
		ChevronLeft,
		ChevronRight,
		Clock,
		Globe2,
		LockKeyhole,
		MapPin,
		Search,
		ScanLine,
		Plus,
		Tag,
		Ticket,
		Timer,
		UsersRound,
		X
	} from 'lucide-svelte';
	import DatePicker from 'src/components/admin/DatePicker.svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import type { EventTemplate } from 'nostr-tools';
	import { key, selectedAdminRelayUrl } from 'src/controller';
	import { parsedEventTags } from 'src/lib/adminRelays';
	import { BADGE_DEFINITION_TYPE_TOPICS } from 'src/lib/catalog';
	import { buildPaidEventAccess } from 'src/lib/eventAccess';
	import { parseMembershipDefinition } from 'src/lib/memberships';
	import { parseRoleDefinition, type RoleDefinition } from 'src/lib/nip58Roles';
	import { uploadFile } from 'src/lib/upload';
	import { now } from 'src/lib/period';
	import { encodeCheckInContext } from 'src/lib/presentation';
	import { go } from 'src/routes/modals/modal';
	import { onDestroy, onMount } from 'svelte';

	type EventCategory = 'training' | 'match' | 'meeting' | 'social';
	type FreeEntry = 'everyone' | 'selected';
	type EventFilter = 'upcoming' | 'past' | 'all';
	type RsvpStatus = 'accepted' | 'tentative' | 'declined';

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
		access: 'open' | 'restricted';
		requiredBadgeCount: number;
		requiredBadgeAddresses: string[];
		entrancePrice?: string;
		entranceCurrency?: string;
		entranceBadgeAddress?: string;
		entranceSats?: number;
	};

	type RsvpResponse = { status: RsvpStatus; createdAt: number };

	const categoryOptions: Array<{ label: string; value: EventCategory }> = [
		{ label: 'Training', value: 'training' },
		{ label: 'Match', value: 'match' },
		{ label: 'Meeting', value: 'meeting' },
		{ label: 'Social', value: 'social' }
	];
	const eventFilterOptions: Array<{ label: string; value: EventFilter }> = [
		{ label: 'Upcoming', value: 'upcoming' },
		{ label: 'Past', value: 'past' },
		{ label: 'All events', value: 'all' }
	];

	let loadedRelayUrl = '';
	let relayUrl = '';
	let title = '';
	let summary = '';
	let image = '';
	let location = '';
	let capacity = '';
	let category: EventCategory = 'training';
	const initialSchedule = defaultSchedule();
	const minimumEventDate = localDateValue(new Date());
	let eventDate = initialSchedule.date;
	let startTime = initialSchedule.startTime;
	let endTime = initialSchedule.endTime;
	let freeEntry: FreeEntry = 'everyone';
	let selectedBadgeAddresses: string[] = [];
	let paidEntrance = false;
	let entrancePrice = '';
	let entranceCurrency = 'EUR';
	let entranceSats = '';
	let publishStatus = '';
	let publishingEvent = false;
	let uploadStatus = '';
	let loadingEvents = true;
	let events: CommunityEvent[] = [];
	let roleDefinitions: RoleDefinition[] = [];
	let loadingRoles = false;
	let publishUnsubscribe: (() => void) | undefined;
	let badgePublishUnsubscribe: (() => void) | undefined;
	let publishTimeouts: number[] = [];
	let unsubscribeEvents: (() => void) | undefined;
	let unsubscribeRoles: (() => void) | undefined;
	let createModalOpen = false;
	let createStep = 1;
	let eventFilter: EventFilter = 'upcoming';
	let eventSearch = '';
	let rsvpResponses: Record<string, Record<string, RsvpResponse>> = {};
	let selectedEvent: CommunityEvent | undefined;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		loadCommunityRelay();
		subscribeEvents();
		subscribeRoles();
	}
	$: admissionValid =
		freeEntry === 'everyone' ||
		selectedBadgeAddresses.length > 0 ||
		(paidEntrance && Number(entrancePrice) > 0);
	$: paymentValid = !paidEntrance || Number(entrancePrice) > 0;
	$: startsAtTimestamp = timestampFromSchedule(eventDate, startTime);
	$: endsAtTimestamp = timestampFromSchedule(eventDate, endTime);
	$: scheduleValid = Boolean(
		eventDate && startTime && endTime && endsAtTimestamp > startsAtTimestamp
	);
	$: scheduleSummary = formatScheduleSummary(startsAtTimestamp, endsAtTimestamp);
	$: canCreateEvent = Boolean(
		relayUrl &&
		title.trim() &&
		scheduleValid &&
		admissionValid &&
		paymentValid &&
		(!paidEntrance || $key?.pub) &&
		!publishingEvent
	);
	$: admissionSummary = buildAdmissionSummary(
		freeEntry,
		selectedBadgeAddresses,
		roleDefinitions,
		paidEntrance,
		entrancePrice,
		entranceCurrency
	);
	$: previewEvent = buildPreviewEvent(
		title,
		summary,
		image,
		category,
		startsAtTimestamp,
		endsAtTimestamp,
		location,
		capacity
	);
	$: visibleEvents = events.filter((event) => {
		const matchesSearch = `${event.title} ${event.location} ${event.category}`
			.toLowerCase()
			.includes(eventSearch.trim().toLowerCase());
		const isPast = (event.endsAt || event.startsAt) < now();
		return matchesSearch && (eventFilter === 'all' || (eventFilter === 'past' ? isPast : !isPast));
	});
	$: upcomingEvents = events.filter((event) => (event.endsAt || event.startsAt) >= now());
	$: totalGoing = events.reduce((total, event) => total + rsvpCount(event.id, 'accepted'), 0);
	$: totalInterested = events.reduce((total, event) => total + rsvpCount(event.id, 'tentative'), 0);

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
				kinds: [31923, 31925, 5],
				limit: 100,
				relays: [relayUrl],
				cacheFirst: false,
				noCache: true
			}
		];

		unsubscribeEvents = useSubscription(
			eventSubscriptionId(relayUrl),
			requests,
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				loadingEvents = false;
				if (parsedEvent.kind() === 31923) upsertEvent(parseCommunityEvent(parsedEvent));
				if (parsedEvent.kind() === 31925) upsertRsvp(parsedEvent);
				if (parsedEvent.kind() === 5) applyDeletion(parsedEvent);
			},
			{ bytesPerEvent: 20 * 1024 }
		);

		window.setTimeout(() => {
			loadingEvents = false;
		}, 700);
	}

	function subscribeRoles() {
		unsubscribeRoles?.();
		roleDefinitions = [];
		selectedBadgeAddresses = [];
		loadingRoles = Boolean(relayUrl);
		if (!relayUrl) {
			loadingRoles = false;
			return;
		}

		unsubscribeRoles = useSubscription(
			'admin_event_access_badges_classified_v1_' + relayUrl,
			[
				{
					kinds: [30009],
					tags: { '#t': [BADGE_DEFINITION_TYPE_TOPICS.role] },
					limit: 100,
					relays: [relayUrl],
					cacheFirst: true
				},
				{
					kinds: [30009],
					tags: { '#t': [BADGE_DEFINITION_TYPE_TOPICS.membership] },
					limit: 100,
					relays: [relayUrl],
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				const roleDefinition = parseRoleDefinition(parsedEvent);
				const membershipDefinition = parseMembershipDefinition(parsedEvent);
				const definition: RoleDefinition | undefined =
					roleDefinition ||
					(membershipDefinition
						? {
								address: membershipDefinition.address,
								pubkey: membershipDefinition.pubkey,
								d: membershipDefinition.d,
								name: membershipDefinition.name,
								description: membershipDefinition.description,
								createdAt: membershipDefinition.createdAt
							}
						: undefined);
				if (!definition) return;
				const existingIndex = roleDefinitions.findIndex(
					(role) => role.address === definition.address
				);
				if (existingIndex !== -1) {
					if (definition.createdAt <= roleDefinitions[existingIndex].createdAt) return;
					roleDefinitions = roleDefinitions.map((role, index) =>
						index === existingIndex ? definition : role
					);
				} else {
					roleDefinitions = [...roleDefinitions, definition];
				}
				roleDefinitions = [...roleDefinitions].sort((left, right) =>
					left.name.localeCompare(right.name)
				);
				loadingRoles = false;
			},
			{ bytesPerEvent: 10 * 1024 }
		);

		window.setTimeout(() => {
			loadingRoles = false;
		}, 900);
	}

	function selectFreeEntry(value: FreeEntry) {
		freeEntry = value;
		if (value === 'everyone') {
			paidEntrance = false;
			entrancePrice = '';
		}
	}

	function toggleBadge(address: string) {
		selectedBadgeAddresses = selectedBadgeAddresses.includes(address)
			? selectedBadgeAddresses.filter((candidate) => candidate !== address)
			: [...selectedBadgeAddresses, address];
	}

	function buildAdmissionSummary(
		entry: FreeEntry,
		selectedAddresses: string[],
		definitions: RoleDefinition[],
		isPaid: boolean,
		price: string,
		currency: string
	) {
		if (entry === 'everyone') return 'Open and free for everyone';
		const selectedNames = definitions
			.filter((role) => selectedAddresses.includes(role.address))
			.map((role) => role.name);
		const freeLabel = selectedNames.length ? `${selectedNames.join(' or ')} enter free` : '';
		const paidLabel = isPaid
			? `others pay ${new Intl.NumberFormat(undefined, {
					style: 'currency',
					currency
				}).format(Number(price) || 0)}`
			: '';
		return [freeLabel, paidLabel].filter(Boolean).join('; ') || 'Choose who can attend';
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
			id: `31923:${event.pubkey()}:${d}`,
			title,
			summary,
			category,
			startsAt: start,
			endsAt: Number.isFinite(end) ? end : undefined,
			location: tags.find((tag) => tag[0] === 'location')?.[1] || '',
			capacity: Number.isFinite(capacityValue) ? capacityValue : undefined,
			image: tags.find((tag) => tag[0] === 'image')?.[1],
			createdAt: Number(event.createdAt()),
			access: tags.find((tag) => tag[0] === 'access')?.[1] === 'restricted' ? 'restricted' : 'open',
			requiredBadgeCount: tags.filter((tag) => tag[0] === 'required_badge').length,
			requiredBadgeAddresses: tags
				.filter((tag) => tag[0] === 'required_badge' && tag[1])
				.map((tag) => tag[1]),
			entrancePrice: tags.find((tag) => tag[0] === 'entrance_price')?.[1],
			entranceCurrency: tags.find((tag) => tag[0] === 'entrance_price')?.[2],
			entranceBadgeAddress: tags.find((tag) => tag[0] === 'entrance_badge')?.[1],
			entranceSats: Number(tags.find((tag) => tag[0] === 'entrance_sats')?.[1]) || undefined
		};
	}

	function startCheckIn(event: CommunityEvent | undefined) {
		if (!event) return;
		const badgeAddresses = Array.from(
			new Set([
				...event.requiredBadgeAddresses,
				...(event.entranceBadgeAddress ? [event.entranceBadgeAddress] : [])
			])
		);
		selectedEvent = undefined;
		go(
			`scan:${encodeCheckInContext({
				type: 'event_checkin',
				community: relayUrl,
				eventAddress: event.id,
				eventTitle: event.title,
				badgeAddresses
			})}`
		);
	}

	function upsertRsvp(event: ParsedEvent) {
		const tags = parsedEventTags(event);
		const coordinate = tags.find((tag) => tag[0] === 'a' && tag[1]?.startsWith('31923:'))?.[1];
		const statusValue = tags.find((tag) => tag[0] === 'status')?.[1];
		if (typeof coordinate !== 'string' || !isRsvpStatus(statusValue)) return;
		const attendee = event.pubkey();
		if (typeof attendee !== 'string') return;
		const previous = rsvpResponses[coordinate]?.[attendee];
		const createdAt = Number(event.createdAt());
		if (previous && previous.createdAt >= createdAt) return;
		rsvpResponses = {
			...rsvpResponses,
			[coordinate]: { ...rsvpResponses[coordinate], [attendee]: { status: statusValue, createdAt } }
		};
	}

	function isRsvpStatus(value: string | undefined): value is RsvpStatus {
		return value === 'accepted' || value === 'tentative' || value === 'declined';
	}

	function rsvpCount(eventId: string, status: RsvpStatus) {
		return Object.values(rsvpResponses[eventId] || {}).filter(
			(response) => response.status === status
		).length;
	}

	function attendeeResponses(eventId: string) {
		return Object.entries(rsvpResponses[eventId] || {}).sort(
			([, left], [, right]) => right.createdAt - left.createdAt
		);
	}

	function shortPubkey(pubkey: string) {
		return `${pubkey.slice(0, 10)}…${pubkey.slice(-8)}`;
	}

	function closeOverlays() {
		selectedEvent = undefined;
		closeCreateModal();
	}

	function openCreateModal() {
		createStep = 1;
		publishStatus = '';
		createModalOpen = true;
	}

	onMount(() => {
		const url = new URL(window.location.href);
		if (url.searchParams.get('create') !== '1') return;
		openCreateModal();
		url.searchParams.delete('create');
		window.history.replaceState(window.history.state, '', url);
	});

	function closeCreateModal() {
		createModalOpen = false;
	}

	function nextCreateStep() {
		if (createStep === 1 && !title.trim()) return;
		if (createStep === 2 && !scheduleValid) return;
		createStep = Math.min(3, createStep + 1);
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

	function applyDeletion(event: ParsedEvent) {
		const author = event.pubkey();
		if (typeof author !== 'string') return;
		// Local items only track replaceable addresses ("kind:pubkey:d"), not raw event
		// ids, so only `a` tags can match. A deletion is only valid from the target's
		// author (the pubkey embedded in the address); the cache re-validates regardless.
		const deletedAddresses = parsedEventTags(event)
			.filter((tag) => tag[0] === 'a' && tag[1]?.startsWith('31923:'))
			.map((tag) => tag[1])
			.filter((address) => address.split(':')[1] === author);
		if (!deletedAddresses.length) return;
		events = events.filter((item) => !deletedAddresses.includes(item.id));
		if (selectedEvent && deletedAddresses.includes(selectedEvent.id)) selectedEvent = undefined;
	}

	function localDateValue(date: Date) {
		const offset = date.getTimezoneOffset() * 60 * 1000;
		return new Date(date.getTime() - offset).toISOString().slice(0, 10);
	}

	function localTimeValue(date: Date) {
		return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
	}

	function defaultSchedule() {
		const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
		start.setMinutes(0, 0, 0);
		const end = new Date(start.getTime() + 60 * 60 * 1000);
		return {
			date: localDateValue(start),
			startTime: localTimeValue(start),
			endTime: localTimeValue(end)
		};
	}

	function timestampFromSchedule(date: string, time: string) {
		if (!date || !time) return 0;
		return Math.floor(new Date(`${date}T${time}`).getTime() / 1000);
	}

	function applyDuration(minutes: number) {
		if (!eventDate || !startTime) return;
		const start = new Date(`${eventDate}T${startTime}`);
		const end = new Date(start.getTime() + minutes * 60 * 1000);
		if (localDateValue(end) !== eventDate) return;
		endTime = localTimeValue(end);
	}

	function formatScheduleSummary(start: number, end: number) {
		if (!start || !end || end <= start) return 'Choose a valid date and time';
		const date = new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		}).format(new Date(start * 1000));
		const time = new Intl.DateTimeFormat(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		});
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return `${date} · ${time.format(new Date(start * 1000))}–${time.format(new Date(end * 1000))} · ${timezone}`;
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
		previewStartsAt: number,
		previewEndsAt: number,
		previewLocation: string,
		previewCapacity: string
	): CommunityEvent {
		const previewStartTimestamp = previewStartsAt || now();
		const previewEndTimestamp = previewEndsAt > previewStartTimestamp ? previewEndsAt : undefined;
		const capacityValue = previewCapacity
			? Math.max(1, Math.floor(Number(previewCapacity)))
			: undefined;
		return {
			id: 'preview',
			title: previewTitle.trim() || 'Event title',
			summary: previewSummary.trim(),
			category: previewCategory,
			startsAt: previewStartTimestamp,
			endsAt: previewEndTimestamp,
			location: previewLocation.trim(),
			capacity: capacityValue,
			image: previewImage.trim(),
			createdAt: now(),
			access: freeEntry === 'everyone' ? 'open' : 'restricted',
			requiredBadgeCount: selectedBadgeAddresses.length,
			requiredBadgeAddresses: [...selectedBadgeAddresses],
			entrancePrice: paidEntrance ? entrancePrice : undefined,
			entranceCurrency: paidEntrance ? entranceCurrency : undefined
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

	function eventSubscriptionId(url: string) {
		return 'admin_events_' + url;
	}

	function publishAccepted(message: WorkerMessage) {
		const value = isConnectionStatus(message)?.status()?.toString();
		return value === 'true' || value === 'OK';
	}

	function trackPublishTimeout(callback: () => void) {
		const timeout = window.setTimeout(callback, 5000);
		publishTimeouts = [...publishTimeouts, timeout];
		return timeout;
	}

	function clearPublishTimeout(timeout: number) {
		window.clearTimeout(timeout);
		publishTimeouts = publishTimeouts.filter((candidate) => candidate !== timeout);
	}

	function resetEventForm() {
		title = '';
		summary = '';
		image = '';
		uploadStatus = '';
		location = '';
		capacity = '';
		category = 'training';
		const nextSchedule = defaultSchedule();
		eventDate = nextSchedule.date;
		startTime = nextSchedule.startTime;
		endTime = nextSchedule.endTime;
		freeEntry = 'everyone';
		selectedBadgeAddresses = [];
		paidEntrance = false;
		entrancePrice = '';
		entranceCurrency = 'EUR';
		entranceSats = '';
		createModalOpen = false;
	}

	function publishCalendarEvent(event: EventTemplate, d: string) {
		publishUnsubscribe?.();
		publishStatus = 'Publishing event...';
		let settled = false;
		const timeout = trackPublishTimeout(() => {
			if (settled) return;
			settled = true;
			publishingEvent = false;
			publishStatus = 'The relay did not confirm the event. Retry to finish publishing.';
		});
		try {
			publishUnsubscribe = usePublish(
				'admin_event_' + relayUrl + '_' + d,
				event,
				(message: WorkerMessage) => {
					if (settled || !publishAccepted(message)) return;
					settled = true;
					clearPublishTimeout(timeout);
					publishingEvent = false;
					publishStatus = 'Event published';
					resetEventForm();
				},
				{
					trackStatus: true,
					defaultRelays: [relayUrl],
					subId: eventSubscriptionId(relayUrl)
				}
			);
		} catch (error) {
			settled = true;
			clearPublishTimeout(timeout);
			publishingEvent = false;
			publishStatus = error instanceof Error ? error.message : 'Event publication failed.';
		}
	}

	function publishTicketThenEvent(
		badgeDefinition: EventTemplate,
		badgeD: string,
		event: EventTemplate,
		eventD: string
	) {
		badgePublishUnsubscribe?.();
		publishStatus = 'Publishing entrance ticket...';
		let settled = false;
		const timeout = trackPublishTimeout(() => {
			if (settled) return;
			settled = true;
			publishingEvent = false;
			publishStatus =
				'The entrance ticket was not confirmed, so the event was not published. Retry to continue.';
		});
		try {
			badgePublishUnsubscribe = usePublish(
				'admin_event_badge_' + relayUrl + '_' + badgeD,
				badgeDefinition,
				(message: WorkerMessage) => {
					if (settled || !publishAccepted(message)) return;
					settled = true;
					clearPublishTimeout(timeout);
					publishStatus = 'Entrance ticket saved. Publishing event...';
					publishCalendarEvent(event, eventD);
				},
				{ trackStatus: true, defaultRelays: [relayUrl] }
			);
		} catch (error) {
			settled = true;
			clearPublishTimeout(timeout);
			publishingEvent = false;
			publishStatus = error instanceof Error ? error.message : 'Ticket publication failed.';
		}
	}

	function createEvent() {
		if (!canCreateEvent) return;
		const d = slugFromTitle(title);
		const pubkey = $key?.pub || '';
		const eventTitle = title.trim();
		const eventSummary = summary.trim();
		const eventImage = image.trim();
		const eventLocation = location.trim();
		const eventCapacity = capacity ? Math.max(1, Math.floor(Number(capacity))) : undefined;
		let paidAccess: ReturnType<typeof buildPaidEventAccess> | undefined;
		if (paidEntrance) {
			try {
				paidAccess = buildPaidEventAccess({
					eventKind: 31923,
					eventAuthor: pubkey,
					eventD: d,
					eventTitle,
					eventImage,
					price: entrancePrice,
					currency: entranceCurrency,
					...(Number(entranceSats) > 0 ? { priceSats: Math.floor(Number(entranceSats)) } : {}),
					expiresAt: endsAtTimestamp,
					relay: relayUrl
				});
			} catch (error) {
				publishStatus = error instanceof Error ? error.message : 'The entrance ticket is invalid.';
				return;
			}
		}

		const tags: string[][] = [
			['d', d],
			['title', eventTitle],
			['summary', eventSummary],
			['start', String(startsAtTimestamp)],
			['t', category]
		];
		tags.push(['end', String(endsAtTimestamp)]);
		if (eventImage) tags.push(['image', eventImage]);
		if (eventLocation) tags.push(['location', eventLocation]);
		if (eventCapacity) tags.push(['capacity', String(eventCapacity)]);
		tags.push(['access', freeEntry === 'everyone' ? 'open' : 'restricted']);
		if (freeEntry === 'selected') {
			for (const badgeAddress of selectedBadgeAddresses) {
				tags.push(['required_badge', badgeAddress]);
			}
		}
		if (paidAccess) tags.push(...paidAccess.eventTags);

		const event: EventTemplate = {
			kind: 31923,
			content: eventSummary,
			created_at: now(),
			tags
		};

		publishingEvent = true;
		if (paidAccess) {
			const badgeDefinition: EventTemplate = {
				kind: 30009,
				content: paidAccess.description,
				created_at: now(),
				tags: paidAccess.definitionTags
			};
			publishTicketThenEvent(badgeDefinition, paidAccess.badgeD, event, d);
			return;
		}
		publishCalendarEvent(event, d);
	}

	onDestroy(() => {
		unsubscribeEvents?.();
		unsubscribeRoles?.();
		publishUnsubscribe?.();
		badgePublishUnsubscribe?.();
		publishTimeouts.forEach((timeout) => window.clearTimeout(timeout));
	});
</script>

<svelte:head>
	<title>Events - Nuts</title>
</svelte:head>

<svelte:window on:keydown={(event) => event.key === 'Escape' && closeOverlays()} />

<main class="px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto grid max-w-[1500px] gap-6">
		<a
			href={resolve('/admin')}
			class="inline-flex w-fit items-center gap-2 rounded-lg text-sm font-bold text-stone-600 transition hover:text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
		>
			<ArrowLeft size={17} />
			Dashboard
		</a>

		<section class="overflow-hidden rounded-2xl bg-[#15372c] text-white shadow-sm">
			<div class="grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
				<div>
					<p class="text-sm font-black text-white/60">Event operations</p>
					<h1 class="mt-3 text-4xl font-black tracking-[-0.04em]">Events</h1>
					<p class="mt-3 max-w-2xl text-lg font-medium leading-8 text-white/65">
						Track attendance, access, and every event published by this community.
					</p>
				</div>
				<button
					type="button"
					class="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#df725c] px-5 font-black text-white shadow-lg shadow-black/15 transition hover:-translate-y-0.5 hover:bg-[#d7654f] active:translate-y-0"
					on:click={openCreateModal}><Plus size={18} /> Create event</button
				>
			</div>
		</section>

		<section
			class="grid overflow-hidden rounded-2xl border border-stone-200 bg-white sm:grid-cols-3"
		>
			<div class="p-6">
				<p class="text-sm font-bold text-stone-400">Upcoming</p>
				<p class="mt-2 text-4xl font-black tabular-nums text-[#171614]">{upcomingEvents.length}</p>
			</div>
			<div class="border-t border-stone-100 p-6 sm:border-l sm:border-t-0">
				<p class="text-sm font-bold text-stone-400">Going</p>
				<p class="mt-2 text-4xl font-black tabular-nums text-[#171614]">{totalGoing}</p>
			</div>
			<div class="border-t border-stone-100 p-6 sm:border-l sm:border-t-0">
				<p class="text-sm font-bold text-stone-400">Interested</p>
				<p class="mt-2 text-4xl font-black tabular-nums text-[#171614]">{totalInterested}</p>
			</div>
		</section>

		<section class="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
			<header
				class="flex flex-col gap-4 border-b border-stone-200 p-5 lg:flex-row lg:items-center lg:justify-between"
			>
				<div class="flex items-center gap-1 rounded-xl bg-stone-100 p-1">
					{#each eventFilterOptions as filter (filter.value)}<button
							type="button"
							class={`rounded-lg px-4 py-2 text-sm font-black transition ${eventFilter === filter.value ? 'bg-white text-[#15372c] shadow-sm' : 'text-stone-500'}`}
							on:click={() => (eventFilter = filter.value)}>{filter.label}</button
						>{/each}
				</div>
				<label class="relative block lg:w-80"
					><span class="sr-only">Search events</span><Search
						size={17}
						class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
					/><input
						class="h-11 w-full rounded-xl border border-stone-200 pl-11 pr-4 text-sm font-bold outline-none focus:border-emerald-900"
						placeholder="Search events"
						bind:value={eventSearch}
					/></label
				>
			</header>
			{#if loadingEvents}<div class="grid gap-3 p-5">
					{#each [1, 2, 3] as row (row)}<div
							class="h-24 animate-pulse rounded-xl bg-stone-100"
						></div>{/each}
				</div>{:else if !visibleEvents.length}<div
					class="grid place-items-center px-6 py-16 text-center"
				>
					<CalendarDays size={28} class="text-stone-300" />
					<h2 class="mt-4 text-xl font-black">No matching events</h2>
					<p class="mt-2 text-sm font-medium text-stone-500">
						Create an event or adjust the filters.
					</p>
				</div>{:else}<div class="divide-y divide-stone-100">
					{#each visibleEvents as event (event.id)}<button
							type="button"
							class="grid w-full gap-5 p-5 text-left transition hover:bg-[#fbfcfb] focus:bg-[#fbfcfb] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-800/20 md:grid-cols-[minmax(0,1fr)_120px_120px_160px_36px] md:items-center"
							on:click={() => (selectedEvent = event)}
						>
							<div class="flex min-w-0 items-center gap-4">
								{#if event.image}<img
										class="h-16 w-20 shrink-0 rounded-xl object-cover"
										src={event.image}
										alt={event.title}
									/>{:else}<span
										class="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-[#eef5f3] text-[#15372c]"
										><CalendarDays size={22} /></span
									>{/if}
								<div class="min-w-0">
									<h2 class="truncate font-black text-[#171614]">{event.title}</h2>
									<p class="mt-1 truncate text-sm font-semibold text-stone-500">
										{formatEventTime(event.startsAt)}{event.location ? ` · ${event.location}` : ''}
									</p>
								</div>
							</div>
							<div>
								<p class="text-xs font-black text-stone-400">Going</p>
								<p class="mt-1 text-xl font-black tabular-nums">
									{rsvpCount(event.id, 'accepted')}{event.capacity ? ` / ${event.capacity}` : ''}
								</p>
							</div>
							<div>
								<p class="text-xs font-black text-stone-400">Interested</p>
								<p class="mt-1 text-xl font-black tabular-nums">
									{rsvpCount(event.id, 'tentative')}
								</p>
							</div>
							<div>
								<p class="text-xs font-black text-stone-400">Admission</p>
								<p class="mt-1 truncate text-sm font-black text-[#15372c]">
									{event.access === 'open'
										? 'Open event'
										: event.entrancePrice
											? `${event.entrancePrice} ${event.entranceCurrency || ''}`
											: `${event.requiredBadgeCount} badge${event.requiredBadgeCount === 1 ? '' : 's'}`}
								</p>
							</div>
							<span class="grid h-9 w-9 place-items-center rounded-lg text-stone-400"
								><ChevronRight size={19} /></span
							>
						</button>{/each}
				</div>{/if}
		</section>

		{#if selectedEvent}
			<div
				class="fixed inset-0 z-50 flex items-end justify-center bg-[#101713]/70 backdrop-blur-sm sm:items-center sm:p-6"
			>
				<div
					class="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-[#f8faf9] shadow-2xl shadow-black/30 sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl"
					role="dialog"
					aria-modal="true"
					aria-labelledby="event-detail-title"
				>
					<header class="relative shrink-0 overflow-hidden bg-[#15372c] text-white">
						{#if selectedEvent.image}<img
								class="absolute inset-0 h-full w-full object-cover opacity-20"
								src={selectedEvent.image}
								alt=""
							/>{/if}
						<div class="relative flex items-start justify-between gap-5 p-6 sm:p-8">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span
										class="rounded-md bg-white/10 px-2 py-1 text-xs font-black capitalize text-white/75"
										>{selectedEvent.category}</span
									><span class="rounded-md bg-white/10 px-2 py-1 text-xs font-black text-white/75"
										>{selectedEvent.access === 'open' ? 'Open event' : 'Restricted access'}</span
									>
								</div>
								<h2
									id="event-detail-title"
									class="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-4xl"
								>
									{selectedEvent.title}
								</h2>
								<p
									class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold text-white/65"
								>
									<span class="inline-flex items-center gap-2"
										><Clock size={16} /> {formatEventTime(selectedEvent.startsAt)}</span
									>{#if selectedEvent.location}<span class="inline-flex items-center gap-2"
											><MapPin size={16} /> {selectedEvent.location}</span
										>{/if}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<button
									type="button"
									class="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#df725c] px-3 text-sm font-black text-white shadow-lg shadow-black/20 transition hover:bg-[#e47e69] active:scale-[0.98] sm:px-4"
									on:click={() => startCheckIn(selectedEvent)}
								>
									<ScanLine size={18} />
									<span class="hidden sm:inline">Check in attendees</span>
									<span class="sm:hidden">Check in</span>
								</button>
								<button
									type="button"
									class="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
									aria-label="Close event details"
									on:click={() => (selectedEvent = undefined)}><X size={20} /></button
								>
							</div>
						</div>
					</header>

					<div class="overflow-y-auto p-5 sm:p-8">
						<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
							<div class="grid content-start gap-6">
								<section
									class="grid grid-cols-3 overflow-hidden rounded-2xl border border-stone-200 bg-white"
								>
									<div class="p-5">
										<p class="text-xs font-black text-stone-400">Going</p>
										<p class="mt-2 text-3xl font-black tabular-nums text-[#171614]">
											{rsvpCount(selectedEvent.id, 'accepted')}
										</p>
									</div>
									<div class="border-l border-stone-100 p-5">
										<p class="text-xs font-black text-stone-400">Interested</p>
										<p class="mt-2 text-3xl font-black tabular-nums text-[#171614]">
											{rsvpCount(selectedEvent.id, 'tentative')}
										</p>
									</div>
									<div class="border-l border-stone-100 p-5">
										<p class="text-xs font-black text-stone-400">Declined</p>
										<p class="mt-2 text-3xl font-black tabular-nums text-[#171614]">
											{rsvpCount(selectedEvent.id, 'declined')}
										</p>
									</div>
								</section>
								<section>
									<h3 class="text-lg font-black text-[#171614]">About this event</h3>
									{#if selectedEvent.summary}<p
											class="mt-3 max-w-2xl whitespace-pre-line text-sm font-medium leading-7 text-stone-600"
										>
											{selectedEvent.summary}
										</p>{:else}<p class="mt-3 text-sm font-medium text-stone-400">
											No description was provided.
										</p>{/if}
								</section>
								<section>
									<div class="flex items-end justify-between gap-4">
										<div>
											<h3 class="text-lg font-black text-[#171614]">Responses</h3>
											<p class="mt-1 text-sm font-medium text-stone-500">
												Latest RSVP from each person.
											</p>
										</div>
										<span class="text-sm font-black tabular-nums text-stone-400"
											>{attendeeResponses(selectedEvent.id).length} total</span
										>
									</div>
									{#if attendeeResponses(selectedEvent.id).length}<div
											class="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white"
										>
											{#each attendeeResponses(selectedEvent.id) as [pubkey, response] (pubkey)}<div
													class="flex items-center gap-3 px-4 py-3"
												>
													<span
														class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef5f3] text-sm font-black text-[#15372c]"
														>{pubkey.slice(0, 2).toUpperCase()}</span
													><span
														class="min-w-0 flex-1 truncate font-mono text-sm font-bold text-stone-600"
														>{shortPubkey(pubkey)}</span
													><span
														class={`rounded-md px-2 py-1 text-xs font-black capitalize ${response.status === 'accepted' ? 'bg-emerald-50 text-emerald-800' : response.status === 'tentative' ? 'bg-amber-50 text-amber-800' : 'bg-stone-100 text-stone-500'}`}
														>{response.status === 'accepted'
															? 'Going'
															: response.status === 'tentative'
																? 'Interested'
																: 'Declined'}</span
													>
												</div>{/each}
										</div>{:else}<div
											class="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center"
										>
											<UsersRound size={22} class="mx-auto text-stone-300" />
											<p class="mt-3 text-sm font-black text-stone-600">No responses yet</p>
										</div>{/if}
								</section>
							</div>

							<aside class="grid content-start gap-4">
								<section class="rounded-2xl border border-stone-200 bg-white p-5">
									<h3 class="text-sm font-black text-stone-400">Event details</h3>
									<dl class="mt-4 grid gap-4">
										<div>
											<dt class="text-xs font-black text-stone-400">Starts</dt>
											<dd class="mt-1 text-sm font-black text-[#171614]">
												{formatEventTime(selectedEvent.startsAt)}
											</dd>
										</div>
										{#if selectedEvent.endsAt}<div>
												<dt class="text-xs font-black text-stone-400">Ends</dt>
												<dd class="mt-1 text-sm font-black text-[#171614]">
													{formatEventTime(selectedEvent.endsAt)}
												</dd>
											</div>{/if}{#if selectedEvent.location}<div>
												<dt class="text-xs font-black text-stone-400">Location</dt>
												<dd class="mt-1 text-sm font-black text-[#171614]">
													{selectedEvent.location}
												</dd>
											</div>{/if}{#if selectedEvent.capacity}<div>
												<dt class="text-xs font-black text-stone-400">Capacity</dt>
												<dd class="mt-1 text-sm font-black text-[#171614]">
													{Math.max(
														0,
														selectedEvent.capacity - rsvpCount(selectedEvent.id, 'accepted')
													)} of {selectedEvent.capacity} places remaining
												</dd>
											</div>{/if}
									</dl>
								</section>
								<section class="rounded-2xl border border-stone-200 bg-white p-5">
									<div class="flex items-center gap-2 text-stone-400">
										<LockKeyhole size={16} />
										<h3 class="text-sm font-black">Admission</h3>
									</div>
									<p class="mt-3 text-sm font-semibold leading-6 text-stone-600">
										{selectedEvent.access === 'open'
											? 'Open to everyone.'
											: selectedEvent.entrancePrice
												? `Eligible badge or ${selectedEvent.entrancePrice} ${selectedEvent.entranceCurrency || ''}.`
												: `${selectedEvent.requiredBadgeCount} eligible badge${selectedEvent.requiredBadgeCount === 1 ? '' : 's'} required.`}
									</p>
								</section>
							</aside>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if createModalOpen}<div
				class="fixed inset-0 z-40 overflow-y-auto bg-[#101713]/70 p-3 backdrop-blur-sm sm:p-6"
				role="dialog"
				aria-modal="true"
			>
				<div class="mx-auto grid max-w-3xl gap-6">
					<header class="flex items-center justify-between rounded-2xl bg-white p-5">
						<div>
							<p class="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">
								Step {createStep} of 3
							</p>
							<h2 class="mt-1 text-2xl font-black">Create event</h2>
							<div class="mt-3 flex gap-2">
								{#each [1, 2, 3] as step (step)}<span
										class={`h-1.5 w-16 rounded-full ${step <= createStep ? 'bg-[#15372c]' : 'bg-stone-200'}`}
									></span>{/each}
							</div>
						</div>
						<button
							type="button"
							class="grid h-10 w-10 place-items-center rounded-xl text-stone-400 hover:bg-stone-100"
							aria-label="Close event form"
							on:click={closeCreateModal}><X size={20} /></button
						>
					</header>
					<div class="grid gap-6">
						<section>
							<div class="grid gap-5">
								<section
									class={`overflow-hidden rounded-2xl border border-stone-200 bg-[#f8faf9] shadow-sm shadow-stone-950/5 ${createStep === 1 ? '' : 'hidden'}`}
								>
									<header class="border-b border-stone-200 bg-white px-5 py-5 sm:px-6">
										<div class="flex items-start gap-4">
											<span
												class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#15372c] text-white"
											>
												<CalendarDays size={21} />
											</span>
											<div>
												<p class="text-xs font-black uppercase tracking-[0.14em] text-stone-400">
													Step 1
												</p>
												<h2 class="mt-1 text-lg font-black text-[#171614]">Event details</h2>
												<p class="mt-1 max-w-2xl text-sm font-medium leading-6 text-stone-500">
													Give people enough context to decide whether they want to attend.
												</p>
											</div>
										</div>
									</header>

									<div class="grid gap-5 p-5 sm:p-6">
										<div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_200px]">
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
									</div>
								</section>

								<section
									class={`overflow-hidden rounded-2xl border border-stone-200 bg-[#f8faf9] shadow-sm shadow-stone-950/5 ${createStep === 2 ? '' : 'hidden'}`}
								>
									<header class="border-b border-stone-200 bg-white px-5 py-5 sm:px-6">
										<div class="flex items-start gap-4">
											<span
												class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#15372c] text-white"
											>
												<Clock size={21} />
											</span>
											<div>
												<p class="text-xs font-black uppercase tracking-[0.14em] text-stone-400">
													Step 2
												</p>
												<h2 class="mt-1 text-lg font-black text-[#171614]">Schedule and place</h2>
												<p class="mt-1 max-w-2xl text-sm font-medium leading-6 text-stone-500">
													Set when it happens, where people meet, and how many can join.
												</p>
											</div>
										</div>
									</header>

									<div class="grid gap-5 p-5 sm:p-6">
										<div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px_180px]">
											<div class="grid gap-2">
												<span class="text-sm font-black text-stone-700">Date</span>
												<DatePicker
													bind:value={eventDate}
													min={minimumEventDate}
													label="Event date"
												/>
											</div>
											<label class="grid gap-2">
												<span class="text-sm font-black text-stone-700">Starts</span>
												<input
													class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
													type="time"
													step="300"
													bind:value={startTime}
												/>
											</label>
											<label class="grid gap-2">
												<span class="text-sm font-black text-stone-700">Ends</span>
												<input
													class={`h-12 rounded-xl border bg-white px-4 text-base font-bold text-[#171614] outline-none focus:ring-2 ${
														scheduleValid
															? 'border-stone-200 focus:border-emerald-900 focus:ring-emerald-800/20'
															: 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15'
													}`}
													type="time"
													step="300"
													bind:value={endTime}
												/>
											</label>
										</div>

										<div class="flex flex-wrap items-center gap-2">
											<span
												class="mr-1 inline-flex items-center gap-2 text-sm font-black text-stone-500"
											>
												<Timer size={16} />
												Duration
											</span>
											{#each [30, 60, 90, 120] as minutes (minutes)}
												<button
													type="button"
													class="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-black text-stone-600 transition hover:border-[#15372c]/30 hover:bg-[#eef5f3] hover:text-[#15372c] focus:outline-none focus:ring-2 focus:ring-emerald-800/20 active:scale-[0.98]"
													on:click={() => applyDuration(minutes)}
												>
													{minutes < 60
														? `${minutes}m`
														: minutes === 60
															? '1h'
															: minutes === 90
																? '1h 30'
																: '2h'}
												</button>
											{/each}
										</div>

										<div
											class={`flex items-start gap-3 rounded-xl px-4 py-3 ${
												scheduleValid ? 'bg-[#eef5f3] text-[#15372c]' : 'bg-rose-50 text-rose-800'
											}`}
										>
											<Clock size={17} class="mt-0.5 shrink-0" />
											<div>
												<p class="text-sm font-black">{scheduleSummary}</p>
												{#if !scheduleValid}
													<p class="mt-1 text-sm font-medium">
														End time must be later than start time.
													</p>
												{/if}
											</div>
										</div>

										<div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px]">
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
										</div>
									</div>
								</section>

								<section
									class={`overflow-hidden rounded-2xl border border-stone-200 bg-[#f8faf9] shadow-sm shadow-stone-950/5 ${createStep === 3 ? '' : 'hidden'}`}
								>
									<header class="border-b border-stone-200 bg-white px-5 py-5 sm:px-6">
										<div class="flex items-start gap-4">
											<span
												class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#15372c] text-white"
											>
												<LockKeyhole size={21} />
											</span>
											<div>
												<p class="text-xs font-black uppercase tracking-[0.14em] text-stone-400">
													Step 3
												</p>
												<h2 class="mt-1 text-lg font-black text-[#171614]">Admission</h2>
												<p class="mt-1 max-w-2xl text-sm font-medium leading-6 text-stone-500">
													Choose who enters free. You can sell an event badge to everyone else.
												</p>
											</div>
										</div>
									</header>

									<div class="grid gap-6 p-5 sm:p-6">
										<fieldset>
											<legend class="text-sm font-black text-stone-700">Who enters free?</legend>
											<div class="mt-3 grid gap-3 sm:grid-cols-2">
												<button
													type="button"
													class={`flex min-h-[92px] items-start gap-4 rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-800/25 active:scale-[0.99] ${
														freeEntry === 'everyone'
															? 'border-[#15372c] bg-white shadow-sm shadow-emerald-950/10'
															: 'border-stone-200 bg-white/60 hover:border-stone-300 hover:bg-white'
													}`}
													aria-pressed={freeEntry === 'everyone'}
													on:click={() => selectFreeEntry('everyone')}
												>
													<span
														class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[#15372c]"
													>
														<Globe2 size={18} />
													</span>
													<span class="min-w-0">
														<span class="flex items-center gap-2 font-black text-[#171614]">
															Everyone
															{#if freeEntry === 'everyone'}<Check
																	size={17}
																	class="text-emerald-800"
																/>{/if}
														</span>
														<span class="mt-1 block text-sm font-medium leading-5 text-stone-500"
															>Open and free event.</span
														>
													</span>
												</button>

												<button
													type="button"
													class={`flex min-h-[92px] items-start gap-4 rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-800/25 active:scale-[0.99] ${
														freeEntry === 'selected'
															? 'border-[#15372c] bg-white shadow-sm shadow-emerald-950/10'
															: 'border-stone-200 bg-white/60 hover:border-stone-300 hover:bg-white'
													}`}
													aria-pressed={freeEntry === 'selected'}
													on:click={() => selectFreeEntry('selected')}
												>
													<span
														class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-800"
													>
														<UsersRound size={18} />
													</span>
													<span class="min-w-0">
														<span class="flex items-center gap-2 font-black text-[#171614]">
															Selected badges or roles
															{#if freeEntry === 'selected'}<Check
																	size={17}
																	class="text-emerald-800"
																/>{/if}
														</span>
														<span class="mt-1 block text-sm font-medium leading-5 text-stone-500"
															>Closed unless entrance is purchased.</span
														>
													</span>
												</button>
											</div>
										</fieldset>

										{#if freeEntry === 'selected'}
											<div class="grid gap-3">
												<div>
													<p class="text-sm font-black text-stone-700">
														Free-entry badges and roles
													</p>
													<p class="mt-1 text-sm font-medium text-stone-500">
														Owning any selected badge grants access.
													</p>
												</div>

												{#if loadingRoles}
													<div class="h-16 animate-pulse rounded-xl bg-stone-200/70"></div>
												{:else if roleDefinitions.length}
													<div class="grid gap-2 sm:grid-cols-2">
														{#each roleDefinitions as role (role.address)}
															<button
																type="button"
																class={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-800/25 ${
																	selectedBadgeAddresses.includes(role.address)
																		? 'border-emerald-800 bg-emerald-50 text-emerald-950'
																		: 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
																}`}
																aria-pressed={selectedBadgeAddresses.includes(role.address)}
																on:click={() => toggleBadge(role.address)}
															>
																<span
																	class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white shadow-sm"
																>
																	<Tag size={16} />
																</span>
																<span class="min-w-0 flex-1 truncate font-black">{role.name}</span>
																{#if selectedBadgeAddresses.includes(role.address)}<Check
																		size={17}
																	/>{/if}
															</button>
														{/each}
													</div>
												{:else}
													<div
														class="rounded-xl border border-dashed border-stone-300 bg-white/70 p-4"
													>
														<p class="text-sm font-black text-stone-700">No badges or roles yet</p>
														<p class="mt-1 text-sm font-medium leading-5 text-stone-500">
															Create one from Roles, or offer paid entrance only.
														</p>
													</div>
												{/if}
											</div>

											<div class="border-t border-stone-200 pt-5">
												<button
													type="button"
													class={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-800/25 active:scale-[0.995] ${
														paidEntrance
															? 'border-[#df725c] bg-[#fff7f4]'
															: 'border-stone-200 bg-white hover:border-stone-300'
													}`}
													aria-pressed={paidEntrance}
													on:click={() => (paidEntrance = !paidEntrance)}
												>
													<span
														class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#df725c]/10 text-[#b9503d]"
													>
														<Ticket size={20} />
													</span>
													<span class="min-w-0 flex-1">
														<span class="block font-black text-[#171614]"
															>Let other people buy entrance</span
														>
														<span class="mt-1 block text-sm font-medium text-stone-500"
															>A successful payment will issue this event's badge.</span
														>
													</span>
													<span
														class={`relative h-6 w-11 rounded-full transition ${paidEntrance ? 'bg-[#15372c]' : 'bg-stone-300'}`}
													>
														<span
															class={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${paidEntrance ? 'translate-x-6' : 'translate-x-1'}`}
														></span>
													</span>
												</button>

												{#if paidEntrance}
													<div
														class="mt-4 grid gap-4 rounded-xl bg-white p-4 sm:grid-cols-[minmax(0,1fr)_140px]"
													>
														<label class="grid gap-2">
															<span class="text-sm font-black text-stone-700">Entrance price</span>
															<div class="relative">
																<BadgeEuro
																	size={18}
																	class="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
																/>
																<input
																	class="h-12 w-full rounded-xl border border-stone-200 bg-white pl-11 pr-4 text-base font-black text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
																	type="number"
																	min="0.01"
																	step="0.01"
																	placeholder="15.00"
																	bind:value={entrancePrice}
																/>
															</div>
														</label>
														<label class="grid gap-2">
															<span class="text-sm font-black text-stone-700">Currency</span>
															<select
																class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-black text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
																bind:value={entranceCurrency}
															>
																<option value="EUR">EUR</option>
																<option value="USD">USD</option>
																<option value="GBP">GBP</option>
																<option value="CHF">CHF</option>
															</select>
														</label>
														<label class="grid gap-2 sm:col-span-2"
															><span class="text-sm font-black text-stone-700"
																>Bitcoin price <span class="font-semibold text-stone-400"
																	>· optional</span
																></span
															>
															<div class="relative">
																<Bitcoin
																	size={18}
																	class="absolute left-4 top-1/2 -translate-y-1/2 text-amber-600"
																/><input
																	class="h-12 w-full rounded-xl border border-stone-200 bg-white pl-11 pr-16 text-base font-black text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
																	type="number"
																	min="1"
																	step="1"
																	placeholder="2100"
																	bind:value={entranceSats}
																/><span
																	class="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-stone-400"
																	>sats</span
																>
															</div></label
														>
													</div>
												{/if}
											</div>
										{/if}

										<div
											class="flex items-start gap-3 rounded-xl bg-[#15372c] px-4 py-3 text-white"
										>
											<Check size={18} class="mt-0.5 shrink-0 text-[#e7b638]" />
											<p class="text-sm font-bold leading-5">{admissionSummary}</p>
										</div>

										{#if !admissionValid}
											<p class="text-sm font-black text-rose-700">
												Select at least one free-entry badge or set an entrance price.
											</p>
										{:else if !paymentValid}
											<p class="text-sm font-black text-rose-700">
												Enter a price greater than zero.
											</p>
										{/if}
									</div>
								</section>

								<footer
									class="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-950/5 sm:p-6"
								>
									<button
										type="button"
										class="inline-flex h-11 items-center gap-2 rounded-xl px-3 font-black text-stone-500 hover:bg-stone-100 disabled:opacity-0"
										disabled={createStep === 1}
										on:click={() => (createStep -= 1)}><ChevronLeft size={18} /> Back</button
									>
									{#if createStep < 3}
										<button
											type="button"
											class="inline-flex h-11 items-center gap-2 rounded-xl bg-[#15372c] px-5 font-black text-white disabled:opacity-40"
											disabled={createStep === 1 ? !title.trim() : !scheduleValid}
											on:click={nextCreateStep}>Continue <ChevronRight size={18} /></button
										>
									{:else}
										<button
											type="button"
											class="inline-flex h-11 items-center gap-2 rounded-xl bg-[#df725c] px-5 font-black text-white disabled:opacity-40"
											disabled={!canCreateEvent}
											on:click={createEvent}><Plus size={18} /> Publish event</button
										>
									{/if}
								</footer>
							</div>
						</section>

						<aside class="hidden">
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
									<div
										class="mt-4 flex items-start gap-3 rounded-xl bg-[#eef5f3] p-3 text-[#15372c]"
									>
										<LockKeyhole size={17} class="mt-0.5 shrink-0" />
										<p class="text-sm font-black leading-5">{admissionSummary}</p>
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
										<p class="mt-1 text-sm font-medium text-stone-500">
											Checking the community relay.
										</p>
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
											<p class="mt-4 text-sm font-medium leading-6 text-stone-500">
												{event.summary}
											</p>
										{/if}
									</div>
								{/each}
							</div>
						</aside>
					</div>
				</div>
			</div>{/if}
	</div>
</main>
