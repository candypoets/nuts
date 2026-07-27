<script lang="ts">
	import { dev } from '$app/environment';
	import { page } from '$app/stores';
	import {
		extractTagValue,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isEoce, isParsedEvent } from '@candypoets/nipworker/utils';
	import imageCompression from 'browser-image-compression';
	import {
		Archive,
		ArrowDown,
		ArrowUp,
		CircleAlert,
		Coffee,
		ImagePlus,
		Loader2,
		Package,
		Pencil,
		Plus,
		RotateCcw,
		Search,
		Store,
		Ticket,
		UsersRound,
		X
	} from 'lucide-svelte';
	import type { EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key, selectedAdminRelayUrl } from 'src/controller';
	import {
		buildCatalogDefinitionTags,
		CATALOG_SELLABLE_TAG,
		catalogAddress,
		catalogAvailability,
		catalogBilling,
		catalogCurrency,
		catalogD,
		catalogDescription,
		catalogEditable,
		catalogImage,
		catalogMaxUses,
		catalogName,
		catalogPosition,
		catalogPrice,
		catalogPriceSats,
		catalogProductKind,
		catalogSection,
		catalogStripeAccountId,
		catalogType,
		catalogDFromName,
		type CatalogAvailability,
		type CatalogDefinitionInput,
		type CatalogDefinitionType,
		type MembershipBilling,
		type ProductKind,
		isStoreCatalogDefinition,
		sellableCatalogSubscriptionId,
		upsertCatalogEvent
	} from 'src/lib/catalog';
	import { COMMUNITY_PROFILE_D, COMMUNITY_PROFILE_KIND } from 'src/lib/communityProfile';
	import { isCommunityType, storePresetFor, type CommunityType } from 'src/lib/communityTypes';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { now } from 'src/lib/period';
	import { uploadFile } from 'src/lib/upload';
	import { onDestroy } from 'svelte';
	import CatalogPublishNotice from './CatalogPublishNotice.svelte';

	type StoreCatalogType = Exclude<CatalogDefinitionType, 'event_access'>;
	type AvailabilityFilter = 'current' | CatalogAvailability;
	type ItemPublishState = {
		attempt: number;
		input: CatalogDefinitionInput;
		phase: 'publishing' | 'failed';
		message: string;
	};

	let relayUrl = '';
	let loadedRelayUrl = '';
	let catalogEvents: ParsedEvent[] = [];
	let communityType: CommunityType = 'other';
	let profileCreatedAt = 0;
	let loading = true;
	let search = '';
	let typeFilter: 'all' | StoreCatalogType = 'all';
	let availabilityFilter: AvailabilityFilter = 'current';
	let sectionFilter = 'all';
	let appliedTypeQuery = '';
	let publishError = '';
	let itemPublishStates = new Map<string, ItemPublishState>();
	let publishAttempt = 0;
	let connectedStripeAccountId = '';
	let paymentStatusLoading = false;
	let paymentStatusError = '';
	let unsubscribeCatalog: (() => void) | undefined;
	let unsubscribeProfile: (() => void) | undefined;
	let publishUnsubscribers: Array<() => void> = [];
	let publishTimeouts: number[] = [];
	const lastPublishedAtByD = new Map<string, number>();

	let editorOpen = false;
	let editorEvent: ParsedEvent | undefined;
	let formType: StoreCatalogType = 'product';
	let formD = '';
	let formName = '';
	let formDescription = '';
	let formImage = '';
	let formImagePreview = '';
	let formProductKind: ProductKind = 'generic';
	let formPrice = '';
	let formCurrency = 'EUR';
	let formPriceSats = '';
	let formSection = '';
	let formPosition = 0;
	let formAvailability: CatalogAvailability = 'available';
	let formBilling: MembershipBilling = 'one_time';
	let formStripeAccountId = '';
	let formMaxUses = '';
	let editorError = '';
	let imageUploading = false;
	let imageUploadStatus = '';
	let publishing = false;
	let pendingPublishCount = 0;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		relayUrl = loadedRelayUrl ? normalizeURL(loadedRelayUrl) : '';
		subscribeStore();
	}
	$: preset = storePresetFor(communityType);
	$: requestedType = $page.url.searchParams.get('type') || '';
	$: if (requestedType !== appliedTypeQuery) {
		appliedTypeQuery = requestedType;
		if (requestedType === 'product' || requestedType === 'membership' || requestedType === 'pass') {
			typeFilter = requestedType;
		}
	}
	$: availableSections = Array.from(
		new Set(catalogEvents.map((event) => catalogSection(event)).filter(Boolean))
	).sort((a, b) => a.localeCompare(b));
	$: visibleEvents = filterCatalogEvents(
		catalogEvents,
		search,
		typeFilter,
		sectionFilter,
		availabilityFilter
	);
	$: hospitalityMenuEvents = visibleEvents.filter(
		(event) =>
			catalogType(event) === 'product' &&
			(catalogProductKind(event) === 'food' || catalogProductKind(event) === 'drink')
	);
	$: hospitalityOtherEvents = visibleEvents.filter(
		(event) => !hospitalityMenuEvents.includes(event)
	);
	$: hospitalitySections = Array.from(
		new Set(hospitalityMenuEvents.map((event) => catalogSection(event) || 'Other'))
	).sort((left, right) => {
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
	});
	$: canSave =
		Boolean(relayUrl && $key?.pub) &&
		formName.trim().length > 1 &&
		Number(formPrice) > 0 &&
		/^[a-zA-Z]{3}$/.test(formCurrency.trim()) &&
		(!formPriceSats.trim() ||
			(Number.isSafeInteger(Number(formPriceSats)) && Number(formPriceSats) > 0)) &&
		(formType !== 'pass' ||
			!formMaxUses.trim() ||
			(Number.isSafeInteger(Number(formMaxUses)) && Number(formMaxUses) > 0)) &&
		!imageUploading &&
		!publishing;
	$: if (
		editorOpen &&
		!editorEvent &&
		formType === 'membership' &&
		!formStripeAccountId &&
		connectedStripeAccountId
	) {
		formStripeAccountId = connectedStripeAccountId;
	}

	function subscribeStore() {
		unsubscribeCatalog?.();
		unsubscribeProfile?.();
		publishUnsubscribers.forEach((unsubscribe) => unsubscribe());
		publishTimeouts.forEach((timeout) => clearTimeout(timeout));
		publishUnsubscribers = [];
		publishTimeouts = [];
		pendingPublishCount = 0;
		publishing = false;
		lastPublishedAtByD.clear();
		itemPublishStates = new Map();
		catalogEvents = [];
		communityType = 'other';
		profileCreatedAt = 0;
		loading = Boolean(relayUrl);
		publishError = '';
		connectedStripeAccountId = '';
		paymentStatusError = '';
		closeEditor();
		if (!relayUrl) {
			loading = false;
			paymentStatusLoading = false;
			return;
		}
		void checkPaymentProvider(relayUrl);

		const catalogRequests: RequestObject[] = [
			{
				kinds: [30009],
				tags: { '#t': [CATALOG_SELLABLE_TAG] },
				limit: 500,
				relays: [relayUrl],
				cacheFirst: true
			}
		];
		unsubscribeCatalog = useSubscription(
			sellableCatalogSubscriptionId(relayUrl),
			catalogRequests,
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (event) {
					if (isStoreCatalogDefinition(event)) {
						catalogEvents = upsertCatalogEvent(catalogEvents, event);
					}
					loading = false;
					return;
				}
				if (isEoce(message)) loading = false;
			},
			{ bytesPerEvent: 12 * 1024 }
		);

		unsubscribeProfile = useSubscription(
			'admin_store_profile_' + relayUrl,
			[
				{
					kinds: [COMMUNITY_PROFILE_KIND],
					tags: { '#d': [COMMUNITY_PROFILE_D] },
					limit: 10,
					relays: [relayUrl],
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

		const timeout = window.setTimeout(() => (loading = false), 1800);
		publishTimeouts = [...publishTimeouts, timeout];
	}

	async function checkPaymentProvider(targetRelay: string) {
		paymentStatusLoading = true;
		paymentStatusError = '';
		connectedStripeAccountId = '';
		try {
			const body = JSON.stringify({ action: 'status', community: targetRelay });
			const url = new URL('/api/stripe/connect', window.location.origin).toString();
			const authorization = await makeInviteAuthorization(url, body, $key?.pub);
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization },
				body
			});
			const value: unknown = await response.json();
			if (relayUrl !== targetRelay) return;
			const status =
				value && typeof value === 'object'
					? (value as {
							connected?: unknown;
							accountId?: unknown;
							message?: unknown;
							error?: unknown;
						})
					: {};
			if (!response.ok) {
				const message =
					typeof status.message === 'string'
						? status.message
						: typeof status.error === 'string'
							? status.error
							: 'Could not check the payment connection.';
				throw new Error(message);
			}
			if (status.connected === true && typeof status.accountId === 'string') {
				connectedStripeAccountId = status.accountId;
			}
		} catch (error) {
			if (relayUrl !== targetRelay) return;
			paymentStatusError =
				error instanceof Error ? error.message : 'Could not check the payment connection.';
		} finally {
			if (relayUrl === targetRelay) paymentStatusLoading = false;
		}
	}

	function compareCatalogEvents(left: ParsedEvent, right: ParsedEvent) {
		return (
			catalogPosition(left) - catalogPosition(right) ||
			catalogName(left).localeCompare(catalogName(right))
		);
	}

	function filterCatalogEvents(
		events: ParsedEvent[],
		searchValue: string,
		selectedType: 'all' | StoreCatalogType,
		selectedSection: string,
		selectedAvailability: AvailabilityFilter
	) {
		return events
			.filter((event) =>
				matchesFilters(event, searchValue, selectedType, selectedSection, selectedAvailability)
			)
			.slice()
			.sort(compareCatalogEvents);
	}

	function matchesFilters(
		event: ParsedEvent,
		searchValue: string,
		selectedType: 'all' | StoreCatalogType,
		selectedSection: string,
		selectedAvailability: AvailabilityFilter
	) {
		const normalizedSearch = searchValue.trim().toLowerCase();
		const availability = catalogAvailability(event);
		if (selectedAvailability === 'current' && availability === 'archived') return false;
		if (selectedAvailability !== 'current' && availability !== selectedAvailability) return false;
		if (selectedType !== 'all' && catalogType(event) !== selectedType) return false;
		if (selectedSection !== 'all' && catalogSection(event) !== selectedSection) return false;
		if (
			normalizedSearch &&
			!`${catalogName(event)} ${catalogDescription(event)} ${catalogSection(event)}`
				.toLowerCase()
				.includes(normalizedSearch)
		) {
			return false;
		}
		return true;
	}

	function sectionEvents(section: string) {
		return hospitalityMenuEvents
			.filter((event) => (catalogSection(event) || 'Other') === section)
			.slice()
			.sort(compareCatalogEvents);
	}

	function typeLabel(event: ParsedEvent) {
		const type = catalogType(event);
		if (type === 'membership') return 'Membership';
		if (type === 'pass') return 'Pass';
		const kind = catalogProductKind(event);
		if (kind === 'food') return 'Food';
		if (kind === 'drink') return 'Drink';
		if (kind === 'merchandise') return 'Merchandise';
		return 'Product';
	}

	function formatPrice(event: ParsedEvent) {
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: catalogCurrency(event)
			}).format(Number(catalogPrice(event)));
		} catch {
			return `${catalogPrice(event)} ${catalogCurrency(event)}`;
		}
	}

	function canEditEvent(event: ParsedEvent) {
		return catalogEditable(event) && Boolean($key?.pub && event.pubkey() === $key.pub);
	}

	function nextPosition(section: string) {
		const positions = catalogEvents
			.filter((event) => catalogSection(event) === section)
			.map(catalogPosition);
		return positions.length ? Math.max(...positions) + 1 : 0;
	}

	function openNewEditor(type?: StoreCatalogType) {
		editorEvent = undefined;
		formType =
			type ||
			(typeFilter === 'product' || typeFilter === 'membership' || typeFilter === 'pass'
				? typeFilter
				: preset.suggestedDefinitionTypes[0] || 'product');
		formD = '';
		formName = '';
		formDescription = '';
		formImage = '';
		clearImagePreview();
		formProductKind = preset.suggestedProductKinds[0] || 'generic';
		formPrice = '';
		formCurrency = 'EUR';
		formPriceSats = '';
		formSection = preset.suggestedSections[0] || '';
		formPosition = nextPosition(formSection);
		formAvailability = 'available';
		formBilling = formType === 'membership' ? 'monthly' : 'one_time';
		formStripeAccountId = formType === 'membership' ? connectedStripeAccountId : '';
		formMaxUses = '';
		editorError = '';
		imageUploadStatus = '';
		editorOpen = true;
	}

	function openEditEditor(event: ParsedEvent) {
		if (!canEditEvent(event)) {
			publishError = 'Only the key that published this item can edit it.';
			return;
		}
		const type = catalogType(event);
		if (type !== 'product' && type !== 'membership' && type !== 'pass') return;
		editorEvent = event;
		formType = type;
		formD = catalogD(event);
		formName = catalogName(event);
		formDescription = catalogDescription(event);
		formImage = catalogImage(event);
		clearImagePreview();
		formProductKind = catalogProductKind(event) || 'generic';
		formPrice = catalogPrice(event);
		formCurrency = catalogCurrency(event) || 'EUR';
		formPriceSats = catalogPriceSats(event)?.toString() || '';
		formSection = catalogSection(event);
		formPosition = catalogPosition(event);
		formAvailability = catalogAvailability(event) || 'available';
		formBilling = catalogBilling(event) || 'one_time';
		formStripeAccountId = catalogStripeAccountId(event) || connectedStripeAccountId;
		formMaxUses = catalogMaxUses(event)?.toString() || '';
		editorError = '';
		imageUploadStatus = '';
		editorOpen = true;
	}

	function closeEditor() {
		if (publishing) return;
		dismissEditor();
	}

	function dismissEditor() {
		editorOpen = false;
		editorEvent = undefined;
		editorError = '';
		imageUploadStatus = '';
		clearImagePreview();
	}

	function clearImagePreview() {
		if (formImagePreview) URL.revokeObjectURL(formImagePreview);
		formImagePreview = '';
	}

	function selectImage(event: Event) {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement)) return;
		const file = input.files?.[0];
		if (file) void uploadImage(file);
		input.value = '';
	}

	function dropImage(event: DragEvent) {
		const file = event.dataTransfer?.files?.[0];
		if (file) void uploadImage(file);
	}

	async function uploadImage(file: File) {
		if (!file.type.startsWith('image/')) {
			editorError = 'Choose an image file.';
			return;
		}
		clearImagePreview();
		formImagePreview = URL.createObjectURL(file);
		imageUploading = true;
		editorError = '';
		imageUploadStatus = 'Preparing image…';
		try {
			const prepared = await imageCompression(file, {
				maxSizeMB: 0.8,
				maxWidthOrHeight: 1400,
				useWebWorker: true,
				fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
				initialQuality: 0.84
			});
			imageUploadStatus = 'Uploading to Blossom…';
			const uploaded = await uploadFile(prepared, {
				preferUserServers: true,
				alt: formName.trim() || file.name,
				includeMimeTag: true,
				includeDimensions: true
			});
			formImage = uploaded.url;
			imageUploadStatus = 'Image uploaded';
			clearImagePreview();
		} catch (error) {
			editorError = error instanceof Error ? error.message : 'Image upload failed.';
			imageUploadStatus = '';
		} finally {
			imageUploading = false;
		}
	}

	function uniqueD() {
		const base = catalogDFromName(formName) || 'item';
		const suffix =
			typeof crypto !== 'undefined' && 'randomUUID' in crypto
				? crypto.randomUUID().slice(0, 8)
				: Date.now().toString(36);
		return `${base}-${suffix}`;
	}

	function formInput(): CatalogDefinitionInput {
		const common = {
			d: formD || uniqueD(),
			name: formName,
			description: formDescription,
			image: formImage,
			price: formPrice,
			currency: formCurrency,
			...(formPriceSats.trim() ? { priceSats: Number(formPriceSats) } : {}),
			section: formSection,
			position: formPosition,
			availability: formAvailability
		};
		if (formType === 'membership') {
			return {
				...common,
				type: 'membership',
				billing: formBilling,
				stripeAccountId: formStripeAccountId
			};
		}
		if (formType === 'pass') {
			return {
				...common,
				type: 'pass',
				...(formMaxUses.trim() ? { maxUses: Number(formMaxUses) } : {})
			};
		}
		return { ...common, type: 'product', productKind: formProductKind };
	}

	function eventInput(
		event: ParsedEvent,
		overrides: Partial<{
			section: string;
			position: number;
			availability: CatalogAvailability;
		}> = {}
	): CatalogDefinitionInput | undefined {
		const type = catalogType(event);
		const priceSats = catalogPriceSats(event);
		const common = {
			d: catalogD(event),
			name: catalogName(event),
			description: catalogDescription(event),
			image: catalogImage(event),
			price: catalogPrice(event),
			currency: catalogCurrency(event),
			...(priceSats ? { priceSats } : {}),
			section: overrides.section ?? catalogSection(event),
			position: overrides.position ?? catalogPosition(event),
			availability: overrides.availability ?? catalogAvailability(event) ?? 'available'
		};
		if (type === 'membership') {
			return {
				...common,
				type,
				billing: catalogBilling(event) || 'one_time',
				stripeAccountId: catalogStripeAccountId(event)
			};
		}
		if (type === 'pass') {
			const maxUses = catalogMaxUses(event);
			return { ...common, type, ...(maxUses ? { maxUses } : {}) };
		}
		if (type === 'product') {
			return { ...common, type, productKind: catalogProductKind(event) || 'generic' };
		}
		return undefined;
	}

	function publishDefinition(input: CatalogDefinitionInput, label: string) {
		if (!relayUrl || !$key?.pub) return false;
		let tags: string[][];
		try {
			tags = [...buildCatalogDefinitionTags(input), ['r', relayUrl]];
		} catch (error) {
			const message = error instanceof Error ? error.message : 'This item is invalid.';
			if (editorOpen) editorError = message;
			else publishError = message;
			return false;
		}

		const template: EventTemplate = {
			kind: 30009,
			content: input.description?.trim() || '',
			created_at: nextCatalogCreatedAt(input.d),
			tags
		};
		const attempt = ++publishAttempt;
		let settled = false;
		const failPublish = (statusValue = '', statusRelay = '', statusMessage = '') => {
			if (settled) return;
			settled = true;
			pendingPublishCount = Math.max(0, pendingPublishCount - 1);
			publishing = pendingPublishCount > 0;
			setItemPublishState(input.d, {
				attempt,
				input,
				phase: 'failed',
				message: itemPublishFailureMessage(statusValue, statusRelay, statusMessage)
			});
		};
		pendingPublishCount += 1;
		publishing = true;
		publishError = '';
		setItemPublishState(input.d, {
			attempt,
			input,
			phase: 'publishing',
			message: `${label}…`
		});
		try {
			const unsubscribe = usePublish(
				`admin_store_${relayUrl}_${input.d}_${template.created_at}`,
				template,
				(message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					const value = status?.status()?.toString();
					const normalizedValue = value?.toLowerCase();
					if (settled || !status) return;
					if (normalizedValue === 'false') {
						failPublish(
							value || '',
							status.relayUrl()?.toString() || message.url()?.toString() || relayUrl,
							status.message()?.toString() || ''
						);
						return;
					}
					if (normalizedValue !== 'true' && normalizedValue !== 'ok') return;
					settled = true;
					pendingPublishCount = Math.max(0, pendingPublishCount - 1);
					publishing = pendingPublishCount > 0;
					clearItemPublishState(input.d, attempt);
				},
				{
					trackStatus: true,
					defaultRelays: [relayUrl],
					subId: sellableCatalogSubscriptionId(relayUrl)
				}
			);
			publishUnsubscribers = [...publishUnsubscribers, unsubscribe];
		} catch (error) {
			settled = true;
			pendingPublishCount = Math.max(0, pendingPublishCount - 1);
			publishing = pendingPublishCount > 0;
			clearItemPublishState(input.d, attempt);
			publishError = error instanceof Error ? error.message : 'Could not publish this change.';
			return false;
		}
		const timeout = window.setTimeout(() => {
			failPublish();
		}, 5000);
		publishTimeouts = [...publishTimeouts, timeout];
		return true;
	}

	function itemPublishFailureMessage(status: string, relay: string, relayMessage: string) {
		const message =
			'This item is still shown optimistically. Publish it again before relying on it.';
		if (!dev || (!status && !relay && !relayMessage)) return message;

		const response = [
			relay ? `relay=${relay}` : '',
			status ? `status=${status}` : '',
			relayMessage ? `message=${relayMessage}` : ''
		]
			.filter(Boolean)
			.join(' · ');
		return `${message} Relay response: ${response}`;
	}

	function setItemPublishState(d: string, state: ItemPublishState) {
		const current = itemPublishStates.get(d);
		if (current && current.attempt > state.attempt) return;
		itemPublishStates = new Map(itemPublishStates).set(d, state);
	}

	function clearItemPublishState(d: string, attempt: number) {
		if (itemPublishStates.get(d)?.attempt !== attempt) return;
		const next = new Map(itemPublishStates);
		next.delete(d);
		itemPublishStates = next;
	}

	function retryPublish(d: string) {
		const state = itemPublishStates.get(d);
		if (!state || state.phase !== 'failed') return;
		publishDefinition(state.input, 'Publishing item');
	}

	function nextCatalogCreatedAt(d: string) {
		const eventCreatedAt =
			catalogEvents
				.find((event) => event.pubkey() === $key?.pub && catalogD(event) === d)
				?.createdAt() || 0;
		const createdAt = Math.max(now(), eventCreatedAt + 1, (lastPublishedAtByD.get(d) || 0) + 1);
		lastPublishedAtByD.set(d, createdAt);
		return createdAt;
	}

	function saveEditor() {
		if (!canSave) return;
		editorError = '';
		const input = formInput();
		formD = input.d;
		if (publishDefinition(input, editorEvent ? 'Updating item' : 'Creating item')) {
			dismissEditor();
		}
	}

	function changeAvailability(event: ParsedEvent, availability: CatalogAvailability) {
		const input = eventInput(event, { availability });
		if (!input) return;
		publishDefinition(
			input,
			availability === 'archived'
				? 'Archiving item'
				: availability === 'available'
					? 'Making item available'
					: 'Marking item unavailable'
		);
	}

	function archiveEvent(event: ParsedEvent) {
		if (!canEditEvent(event)) return;
		if (!window.confirm(`Archive “${catalogName(event)}”? It can be restored later.`)) return;
		changeAvailability(event, 'archived');
	}

	function moveEvent(event: ParsedEvent, direction: -1 | 1) {
		if (!canEditEvent(event)) return;
		const peers = catalogEvents
			.filter(
				(candidate) =>
					catalogType(candidate) === catalogType(event) &&
					catalogSection(candidate) === catalogSection(event) &&
					catalogAvailability(candidate) !== 'archived'
			)
			.slice()
			.sort(compareCatalogEvents);
		const index = peers.findIndex(
			(candidate) => catalogAddress(candidate) === catalogAddress(event)
		);
		const targetIndex = index + direction;
		const target = peers[targetIndex];
		if (index < 0 || !target || !canEditEvent(target)) return;
		const reordered = peers.slice();
		reordered.splice(index, 1);
		reordered.splice(targetIndex, 0, event);
		for (const [position, candidate] of reordered.entries()) {
			const input = eventInput(candidate, { position });
			if (input) publishDefinition(input, 'Reordering item');
		}
	}

	function renameSection(section: string) {
		const next = window.prompt(`Rename “${section}”`, section)?.trim();
		if (!next || next === section) return;
		const editable = catalogEvents.filter(
			(event) => catalogSection(event) === section && canEditEvent(event)
		);
		if (!editable.length) {
			publishError = 'No items in this section are editable by the active key.';
			return;
		}
		for (const event of editable) {
			const input = eventInput(event, { section: next });
			if (input) publishDefinition(input, 'Renaming section');
		}
	}

	function itemIcon(event: ParsedEvent) {
		const type = catalogType(event);
		if (type === 'membership') return UsersRound;
		if (type === 'pass') return Ticket;
		if (catalogProductKind(event) === 'food' || catalogProductKind(event) === 'drink') {
			return Coffee;
		}
		return Package;
	}

	onDestroy(() => {
		unsubscribeCatalog?.();
		unsubscribeProfile?.();
		publishUnsubscribers.forEach((unsubscribe) => unsubscribe());
		publishTimeouts.forEach((timeout) => clearTimeout(timeout));
		clearImagePreview();
	});
</script>

<svelte:head><title>{preset.title} · Community admin</title></svelte:head>

<main class="mx-auto max-w-[1240px] px-5 py-10 text-stone-950 sm:px-6 lg:py-14">
	<header
		class="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between"
	>
		<div>
			<p class="text-sm font-black uppercase tracking-[0.15em] text-emerald-800">
				Community catalog
			</p>
			<h1 class="mt-2 text-4xl font-black tracking-tight">{preset.title}</h1>
			<p class="mt-3 max-w-2xl font-semibold leading-7 text-stone-500">{preset.intro}</p>
		</div>
		<button
			type="button"
			class="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#073c32] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#0a4b3e] disabled:cursor-not-allowed disabled:bg-stone-300"
			disabled={!relayUrl || !$key?.pub}
			on:click={() => openNewEditor()}
		>
			<Plus size={19} /> Add {preset.itemLabel}
		</button>
	</header>

	{#if publishError}
		<div
			class="mt-5 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800"
		>
			<CircleAlert size={18} />
			<span>{publishError}</span>
		</div>
	{/if}

	<section
		class="mt-7 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm shadow-stone-950/5"
	>
		<div class="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_180px]">
			<label class="relative">
				<span class="sr-only">Search catalog</span>
				<Search
					size={17}
					class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
				/>
				<input
					type="search"
					class="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 pl-11 pr-4 text-sm font-semibold outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15"
					placeholder={`Search ${preset.itemsLabel}`}
					bind:value={search}
				/>
			</label>
			<label>
				<span class="sr-only">Filter by type</span>
				<select
					class="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold"
					bind:value={typeFilter}
				>
					<option value="all">All types</option>
					<option value="product">Products</option>
					<option value="membership">Memberships</option>
					<option value="pass">Passes</option>
				</select>
			</label>
			<label>
				<span class="sr-only">Filter by section</span>
				<select
					class="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold"
					bind:value={sectionFilter}
				>
					<option value="all">All {preset.sectionLabel}s</option>
					{#each availableSections as section (section)}
						<option value={section}>{section}</option>
					{/each}
				</select>
			</label>
			<label>
				<span class="sr-only">Filter by availability</span>
				<select
					class="h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-bold"
					bind:value={availabilityFilter}
				>
					<option value="current">Current items</option>
					<option value="available">Available</option>
					<option value="unavailable">Unavailable</option>
					<option value="archived">Archived</option>
				</select>
			</label>
		</div>
	</section>

	{#if loading}
		<div class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each [1, 2, 3] as placeholder (placeholder)}
				<div class="h-48 animate-pulse rounded-2xl bg-stone-100"></div>
			{/each}
		</div>
	{:else if !relayUrl}
		<section class="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
			<CircleAlert size={30} class="mx-auto text-amber-700" />
			<h2 class="mt-4 text-xl font-black">Select a community first</h2>
		</section>
	{:else if !visibleEvents.length}
		<section
			class="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center"
		>
			<Store size={34} class="mx-auto text-emerald-800" />
			<h2 class="mt-4 text-2xl font-black">No matching {preset.itemsLabel}</h2>
			<p class="mx-auto mt-2 max-w-lg font-semibold leading-7 text-stone-500">
				{catalogEvents.length
					? 'Change the filters to see more of the catalog.'
					: `Add the first ${preset.itemLabel} for this community.`}
			</p>
			<button
				type="button"
				class="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#073c32] px-5 text-sm font-black text-white"
				on:click={() => openNewEditor()}
			>
				<Plus size={18} /> Add {preset.itemLabel}
			</button>
		</section>
	{:else if preset.presentation === 'menu'}
		<div class="mt-8 space-y-6">
			{#each hospitalitySections as section (section)}
				<section
					class="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm shadow-stone-950/5"
				>
					<header
						class="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-5 py-4"
					>
						<div>
							<p class="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">
								Menu section
							</p>
							<h2 class="mt-1 text-xl font-black">{section}</h2>
						</div>
						<button
							type="button"
							class="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-600 hover:bg-stone-100"
							on:click={() => renameSection(section)}
						>
							Rename
						</button>
					</header>
					<div class="divide-y divide-stone-100">
						{#each sectionEvents(section) as event, index (event.id())}
							{@const priceSats = catalogPriceSats(event)}
							{@const itemPublishState = itemPublishStates.get(catalogD(event))}
							<div class={catalogAvailability(event) === 'unavailable' ? 'bg-stone-50' : ''}>
								<div
									class={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${catalogAvailability(event) === 'unavailable' ? 'opacity-70' : ''}`}
								>
									<div class="flex min-w-0 flex-1 items-center gap-4">
										<div
											class="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-50 text-emerald-800"
										>
											{#if catalogImage(event)}
												<img src={catalogImage(event)} alt="" class="h-full w-full object-cover" />
											{:else}
												<svelte:component this={itemIcon(event)} size={25} />
											{/if}
										</div>
										<div class="min-w-0">
											<div class="flex flex-wrap items-center gap-2">
												<h3 class="truncate text-lg font-black">{catalogName(event)}</h3>
												<span
													class="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-stone-600"
													>{typeLabel(event)}</span
												>
												{#if catalogAvailability(event) !== 'available'}
													<span
														class="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800"
														>{catalogAvailability(event)}</span
													>
												{/if}
											</div>
											<p class="mt-1 line-clamp-1 text-sm font-semibold text-stone-500">
												{catalogDescription(event) || 'No description'}
											</p>
										</div>
									</div>
									<div class="shrink-0 text-right">
										<p class="text-lg font-black text-emerald-950">{formatPrice(event)}</p>
										{#if priceSats}
											<p class="mt-0.5 text-xs font-bold text-amber-700">
												₿ {priceSats.toLocaleString()} sats
											</p>
										{/if}
									</div>
									<div class="flex shrink-0 flex-wrap items-center gap-2">
										<button
											type="button"
											class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white disabled:opacity-30"
											disabled={index === 0 || !canEditEvent(event)}
											aria-label="Move item up"
											on:click={() => moveEvent(event, -1)}><ArrowUp size={16} /></button
										>
										<button
											type="button"
											class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white disabled:opacity-30"
											disabled={index === sectionEvents(section).length - 1 || !canEditEvent(event)}
											aria-label="Move item down"
											on:click={() => moveEvent(event, 1)}><ArrowDown size={16} /></button
										>
										{#if catalogAvailability(event) === 'available'}
											<button
												type="button"
												class="h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-black disabled:opacity-40"
												disabled={!canEditEvent(event)}
												on:click={() => changeAvailability(event, 'unavailable')}
												>Unavailable</button
											>
										{:else}
											<button
												type="button"
												class="h-9 rounded-lg bg-emerald-800 px-3 text-xs font-black text-white disabled:opacity-40"
												disabled={!canEditEvent(event)}
												on:click={() => changeAvailability(event, 'available')}>Available</button
											>
										{/if}
										<button
											type="button"
											class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white disabled:opacity-30"
											disabled={!canEditEvent(event)}
											aria-label="Edit item"
											on:click={() => openEditEditor(event)}><Pencil size={16} /></button
										>
										<button
											type="button"
											class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white text-rose-700 disabled:opacity-30"
											disabled={!canEditEvent(event)}
											aria-label="Archive item"
											on:click={() => archiveEvent(event)}><Archive size={16} /></button
										>
									</div>
								</div>
								{#if itemPublishState}
									<div class="px-5 pb-5">
										<CatalogPublishNotice
											phase={itemPublishState.phase}
											message={itemPublishState.message}
											onRetry={() => retryPublish(catalogD(event))}
										/>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}

			{#if hospitalityOtherEvents.length}
				<section>
					<h2 class="text-xl font-black">Other offers</h2>
					<p class="mt-1 text-sm font-semibold text-stone-500">
						Memberships, passes and other products.
					</p>
					<div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{#each hospitalityOtherEvents as event (event.id())}
							{@const priceSats = catalogPriceSats(event)}
							{@const itemPublishState = itemPublishStates.get(catalogD(event))}
							<article
								class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-950/5"
							>
								<div class="flex items-start justify-between gap-4">
									<div
										class="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-emerald-50 text-emerald-800"
									>
										{#if catalogImage(event)}<img
												src={catalogImage(event)}
												alt=""
												class="h-full w-full object-cover"
											/>{:else}<svelte:component this={itemIcon(event)} size={22} />{/if}
									</div>
									<span
										class="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-stone-600"
										>{typeLabel(event)}</span
									>
								</div>
								<h3 class="mt-4 text-lg font-black">{catalogName(event)}</h3>
								<p
									class="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-stone-500"
								>
									{catalogDescription(event) || 'No description'}
								</p>
								<div class="mt-5 flex items-center justify-between gap-3">
									<div>
										<p class="font-black text-emerald-950">{formatPrice(event)}</p>
										{#if priceSats}
											<p class="mt-0.5 text-xs font-bold text-amber-700">
												₿ {priceSats.toLocaleString()} sats
											</p>
										{/if}
									</div>
									<button
										type="button"
										class="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-200 px-3 text-xs font-black disabled:opacity-30"
										disabled={!canEditEvent(event)}
										on:click={() => openEditEditor(event)}><Pencil size={14} /> Edit</button
									>
								</div>
								{#if itemPublishState}
									<div class="mt-4">
										<CatalogPublishNotice
											phase={itemPublishState.phase}
											message={itemPublishState.message}
											onRetry={() => retryPublish(catalogD(event))}
										/>
									</div>
								{/if}
							</article>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{:else}
		<div class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each visibleEvents as event (event.id())}
				{@const priceSats = catalogPriceSats(event)}
				{@const itemPublishState = itemPublishStates.get(catalogD(event))}
				<article
					class={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-950/5 ${catalogAvailability(event) === 'archived' ? 'opacity-60' : ''}`}
				>
					<div class="flex items-start justify-between gap-4">
						<div
							class="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-emerald-50 text-emerald-800"
						>
							{#if catalogImage(event)}<img
									src={catalogImage(event)}
									alt=""
									class="h-full w-full object-cover"
								/>{:else}<svelte:component this={itemIcon(event)} size={24} />{/if}
						</div>
						<div class="flex flex-col items-end gap-2">
							<span
								class="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-stone-600"
								>{typeLabel(event)}</span
							>
							{#if catalogAvailability(event) !== 'available'}
								<span
									class="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800"
									>{catalogAvailability(event)}</span
								>
							{/if}
						</div>
					</div>
					<h2 class="mt-5 text-xl font-black">{catalogName(event)}</h2>
					<p
						class="mt-1 line-clamp-2 min-h-[2.75rem] text-sm font-semibold leading-6 text-stone-500"
					>
						{catalogDescription(event) || 'No description'}
					</p>
					<div class="mt-4 flex items-end justify-between gap-3">
						<div>
							<p class="text-lg font-black text-emerald-950">{formatPrice(event)}</p>
							{#if priceSats}
								<p class="mt-0.5 text-xs font-bold text-amber-700">
									₿ {priceSats.toLocaleString()} sats
								</p>
							{/if}
							<p class="mt-1 text-xs font-bold text-stone-400">
								{catalogSection(event) || `No ${preset.sectionLabel}`}
							</p>
						</div>
						<div class="flex items-center gap-2">
							{#if catalogAvailability(event) === 'archived'}
								<button
									type="button"
									class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 disabled:opacity-30"
									disabled={!canEditEvent(event)}
									aria-label="Restore item"
									on:click={() => changeAvailability(event, 'unavailable')}
									><RotateCcw size={16} /></button
								>
							{:else}
								<button
									type="button"
									class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 disabled:opacity-30"
									disabled={!canEditEvent(event)}
									aria-label="Edit item"
									on:click={() => openEditEditor(event)}><Pencil size={16} /></button
								>
								<button
									type="button"
									class={`h-9 rounded-lg px-3 text-xs font-black ${catalogAvailability(event) === 'available' ? 'border border-stone-200 bg-white text-stone-700' : 'bg-emerald-800 text-white'}`}
									disabled={!canEditEvent(event)}
									on:click={() =>
										changeAvailability(
											event,
											catalogAvailability(event) === 'available' ? 'unavailable' : 'available'
										)}>{catalogAvailability(event) === 'available' ? 'Pause' : 'Activate'}</button
								>
								<button
									type="button"
									class="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 text-rose-700 disabled:opacity-30"
									disabled={!canEditEvent(event)}
									aria-label="Archive item"
									on:click={() => archiveEvent(event)}><Archive size={16} /></button
								>
							{/if}
						</div>
					</div>
					{#if !canEditEvent(event)}
						<p class="mt-4 border-t border-stone-100 pt-3 text-xs font-semibold text-stone-400">
							Published by another community key
						</p>
					{/if}
					{#if itemPublishState}
						<div class="mt-4">
							<CatalogPublishNotice
								phase={itemPublishState.phase}
								message={itemPublishState.message}
								onRetry={() => retryPublish(catalogD(event))}
							/>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</main>

{#if editorOpen}
	<div
		class="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/45 p-0 sm:items-center sm:p-5"
	>
		<button
			class="absolute inset-0 cursor-default"
			aria-label="Close item editor"
			on:click={closeEditor}
		></button>
		<section
			class="relative z-10 max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
		>
			<header
				class="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7"
			>
				<div>
					<p class="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">
						{editorEvent ? 'Edit' : 'New'} catalog item
					</p>
					<h2 class="mt-1 text-2xl font-black">
						{editorEvent ? formName : `Add ${preset.itemLabel}`}
					</h2>
				</div>
				<button
					type="button"
					class="grid h-10 w-10 place-items-center rounded-full hover:bg-stone-100"
					aria-label="Close"
					on:click={closeEditor}><X size={21} /></button
				>
			</header>

			<div class="grid gap-5 p-5 sm:p-7">
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="grid gap-2">
						<span class="text-sm font-black text-stone-700">Item type</span>
						<select
							class="h-12 rounded-xl border border-stone-200 bg-white px-3 font-bold disabled:bg-stone-100"
							bind:value={formType}
							disabled={Boolean(editorEvent)}
						>
							{#each preset.suggestedDefinitionTypes as type (type)}
								<option value={type}
									>{type === 'product'
										? 'Standard product'
										: type === 'membership'
											? 'Membership'
											: 'Pass'}</option
								>
							{/each}
						</select>
					</label>
					{#if formType === 'product'}
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Product kind</span>
							<select
								class="h-12 rounded-xl border border-stone-200 bg-white px-3 font-bold"
								bind:value={formProductKind}
							>
								{#each preset.suggestedProductKinds as kind (kind)}
									<option value={kind}>{kind[0].toUpperCase() + kind.slice(1)}</option>
								{/each}
							</select>
						</label>
					{:else if formType === 'membership'}
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700">Billing</span>
							<select
								class="h-12 rounded-xl border border-stone-200 bg-white px-3 font-bold"
								bind:value={formBilling}
							>
								<option value="one_time">One time</option>
								<option value="monthly">Monthly</option>
								<option value="yearly">Yearly</option>
							</select>
						</label>
					{:else}
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-700"
								>Maximum uses <span class="font-semibold text-stone-400">· optional</span></span
							>
							<input
								class="h-12 rounded-xl border border-stone-200 px-4 font-bold"
								type="number"
								min="1"
								step="1"
								placeholder="Unlimited"
								bind:value={formMaxUses}
							/>
						</label>
					{/if}
				</div>

				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-700">Name</span>
					<input
						class="h-12 rounded-xl border border-stone-200 px-4 font-bold outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15"
						placeholder="Flat white"
						bind:value={formName}
					/>
				</label>

				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-700">Description</span>
					<textarea
						class="min-h-24 rounded-xl border border-stone-200 px-4 py-3 font-semibold leading-6 outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15"
						placeholder="What customers should know…"
						bind:value={formDescription}
					></textarea>
				</label>

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="grid gap-2">
						<span class="text-sm font-black text-stone-700">Price</span>
						<input
							class="h-12 rounded-xl border border-stone-200 px-4 font-bold"
							type="number"
							min="0.01"
							step="0.01"
							placeholder="4.50"
							bind:value={formPrice}
						/>
					</label>
					<label class="grid gap-2">
						<span class="text-sm font-black text-stone-700">Currency</span>
						<input
							class="h-12 rounded-xl border border-stone-200 px-4 font-bold uppercase"
							maxlength="3"
							placeholder="EUR"
							bind:value={formCurrency}
						/>
					</label>
				</div>

				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-700">
						Price in sats <span class="font-semibold text-stone-400">· optional</span>
					</span>
					<input
						class="h-12 rounded-xl border border-stone-200 px-4 font-bold"
						type="number"
						min="1"
						step="1"
						placeholder="8500"
						bind:value={formPriceSats}
					/>
				</label>

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="grid gap-2">
						<span class="text-sm font-black text-stone-700"
							>{preset.sectionLabel[0].toUpperCase() + preset.sectionLabel.slice(1)}</span
						>
						<input
							class="h-12 rounded-xl border border-stone-200 px-4 font-bold"
							list="store-sections"
							placeholder="Drinks"
							bind:value={formSection}
						/>
						<datalist id="store-sections">
							{#each Array.from(new Set( [...preset.suggestedSections, ...availableSections] )) as section (section)}
								<option value={section}></option>
							{/each}
						</datalist>
					</label>
					<label class="grid gap-2">
						<span class="text-sm font-black text-stone-700">Availability</span>
						<select
							class="h-12 rounded-xl border border-stone-200 bg-white px-3 font-bold"
							bind:value={formAvailability}
						>
							<option value="available">Available</option>
							<option value="unavailable">Unavailable</option>
							{#if editorEvent}<option value="archived">Archived</option>{/if}
						</select>
					</label>
				</div>

				<label
					class="grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 p-5 text-center transition hover:border-emerald-700"
					on:drop|preventDefault={dropImage}
					on:dragover|preventDefault
				>
					<input class="sr-only" type="file" accept="image/*" on:change={selectImage} />
					{#if formImagePreview || formImage}
						<img
							src={formImagePreview || formImage}
							alt=""
							class="h-36 w-full rounded-xl object-cover"
						/>
						<p class="mt-3 text-sm font-black text-stone-700">
							{imageUploading ? 'Uploading…' : 'Change image'}
						</p>
					{:else}
						<ImagePlus size={28} class="text-emerald-800" />
						<p class="mt-2 text-sm font-black text-stone-700">Drop an image or choose a file</p>
					{/if}
					{#if imageUploadStatus}<p class="mt-1 text-xs font-bold text-stone-500">
							{imageUploadStatus}
						</p>{/if}
				</label>

				{#if formType === 'membership' && !formStripeAccountId}
					<p
						class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-900"
					>
						{paymentStatusLoading
							? 'Checking the community payment connection…'
							: paymentStatusError
								? 'The payment connection could not be verified. You can save this membership and retry from Settings.'
								: 'You can prepare this membership now. Connect payments from Settings before selling it.'}
					</p>
				{:else if formType === 'pass'}
					<p
						class="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-900"
					>
						Pass redemption and use tracking will be connected in the later storefront and order
						phases.
					</p>
				{/if}

				{#if editorError}
					<p
						class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800"
					>
						{editorError}
					</p>
				{/if}
			</div>

			<footer
				class="sticky bottom-0 flex items-center justify-end gap-3 border-t border-stone-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7"
			>
				<button
					type="button"
					class="h-11 rounded-xl border border-stone-200 px-5 text-sm font-black"
					disabled={publishing}
					on:click={closeEditor}>Cancel</button
				>
				<button
					type="button"
					class="inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-xl bg-[#073c32] px-5 text-sm font-black text-white disabled:bg-stone-300"
					disabled={!canSave}
					on:click={saveEditor}
				>
					{#if publishing}<Loader2 size={17} class="animate-spin" /> Saving{:else}{editorEvent
							? 'Save changes'
							: 'Add item'}{/if}
				</button>
			</footer>
		</section>
	</div>
{/if}
