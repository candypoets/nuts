<script lang="ts">
	import { ParsedEvent, WorkerMessage, type ConnectionStatus } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { fbArray, isConnectionStatus, isKind1, isParsedEvent } from '@candypoets/nipworker/utils';
	import Loader from 'src/components/Loader.svelte';
	import PollCreator from 'src/components/PollCreator.svelte';
	import Icon from '@iconify/svelte';
	import { nip19, type EventTemplate, type NostrEvent } from 'nostr-tools';
	import EditorComponent from 'src/components/Editor.svelte';
	import type { Editor as TiptapEditor } from 'svelte-tiptap';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { isMobile, readRelays, relayRoleSets, writeRelays } from 'src/controller';
	import { get } from 'svelte/store';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { prepareEvent } from 'src/editor/utils';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { now } from 'src/lib/period';
	import { getContext, onDestroy, onMount } from 'svelte';
	import type { Readable } from 'svelte/store';
	import { fly } from 'svelte/transition';
	import Note from '../explore/note.svelte';
	import User from '../explore/user.svelte';
	import { getUserRelays } from '../queries/user';
	import { decode } from 'nostr-tools/nip19';
	import { normalizeURL } from 'nostr-tools/utils';
	import { parsedEventTags, relayRoleFromSet, relayUrlsFromRelaySet } from 'src/lib/adminRelays';

	export let placeholder = "Speak your mind it's Nostr";
	export let initialContent = '';
	export let onSubmit = (event: NostrEvent) => {};
	export let reply: string | undefined = undefined;
	export let note: ParsedEvent | undefined = undefined;
	export let repost: string | undefined = undefined;

	$: noteId = reply || repost;
	$: hexId = (() => {
		if (!noteId) return undefined;
		try {
			const decoded = decode(noteId);
			if (decoded?.type === 'nevent') {
				return decoded.data.id;
			}
		} catch {
			// Not an nevent, assume it's already a hex id
		}
		return noteId;
	})();

	type DraftEventTemplate = EventTemplate & { id?: string };

	let editor: Readable<TiptapEditor>;
	let viewport: HTMLElement;
	let isSubmitting = false;
	let pagerAnimator: PagerAnimator | undefined = getContext('animator');
	let showPicker = false;
	let isPollMode = false;
	let pollOptions: string[] = ['', ''];
	let pollType: 'singlechoice' | 'multiplechoice' = 'singlechoice';
	let pollEndsAt: number | null = null;
	type PostKind = 'note' | 'media' | 'event';
	type EventCategory = 'training' | 'match' | 'meeting' | 'social';
	type MediaItem = {
		src: string;
		uploading: boolean;
		error: string;
	};

	let step: 'setup' | 'compose' = reply || repost ? 'compose' : 'setup';
	let selectedKind: PostKind = 'note';
	let selectedRelay = '';
	let eventTitle = '';
	let eventSummary = '';
	let eventLocation = '';
	let eventCategory: EventCategory = 'social';
	let eventStartsAt = defaultDateTimeLocal(24);
	let eventEndsAt = '';
	let eventCapacity = '';

	let replySub: (() => void) | undefined;
	let editorUpdateUnsubscribe: (() => void) | undefined;
	let observedEditor: TiptapEditor | undefined;
	let editorRevision = 0;
	let referencedRelayHints: string[] = [];

	$: communityOptions = communityRelays($relayRoleSets);
	$: destinationLabel = selectedRelay ? relayLabel(selectedRelay) : 'Public';
	$: canSubmitEvent = Boolean(selectedRelay && eventTitle.trim() && eventStartsAt);
	$: composeMode = isPollMode ? 'poll' : selectedKind;
	$: (editorRevision, (mediaItems = mediaItemsFromEditor()));
	$: hasMedia = mediaItems.some((item) => item.src && !item.uploading && !item.error);
	$: editorText = $editor?.getText().trim() || '';
	$: canSubmitPost =
		selectedKind === 'event'
			? canSubmitEvent
			: isPollMode
				? Boolean(editorText && pollOptions.filter((o) => o.trim()).length >= 2)
				: selectedKind === 'media'
					? hasMedia
					: Boolean(editorText || repost);
	let mediaItems: MediaItem[] = [];

	$: if ($editor && $editor !== observedEditor) {
		editorUpdateUnsubscribe?.();
		observedEditor = $editor;
		const updateEditorRevision = () => {
			editorRevision += 1;
		};
		$editor.on('update', updateEditorRevision);
		$editor.on('transaction', updateEditorRevision);
		updateEditorRevision();
		editorUpdateUnsubscribe = () => {
			observedEditor?.off('update', updateEditorRevision);
			observedEditor?.off('transaction', updateEditorRevision);
		};
	}

	onMount(async () => {
		if (noteId) {
			// Try to decode as nevent to get hex id and relay hints
			let hexId = noteId;
			let relayHints: string[] = [];
			try {
				const decoded = decode(noteId);
				if (decoded && decoded.type === 'nevent') {
					hexId = decoded.data.id;
					relayHints = decoded.data.relays || [];
					referencedRelayHints = relayHints;
				}
			} catch {
				// Not an nevent, use noteId as-is (it's already a hex id)
			}

			// Add user's read and write relays as fallback
			const userReadRelays = get(readRelays);
			const userWriteRelays = get(writeRelays);
			const allRelays = [...new Set([...relayHints, ...userReadRelays, ...userWriteRelays])].filter(
				(relay): relay is string => Boolean(relay)
			);

			replySub = useSubscription(
				'post_' + hexId,
				[
					{
						ids: [hexId],
						limit: 5,
						relays: allRelays,
						cacheFirst: true
					}
				],
				(message) => {
					const parsedEvent = isParsedEvent(message);
					const kind1 = isKind1(message);
					if (kind1 && parsedEvent && parsedEvent.id() === hexId) {
						note = parsedEvent;
					}
				}
			);
		}
	});

	onDestroy(() => {
		replySub?.();
		editorUpdateUnsubscribe?.();
	});

	async function handleSubmit() {
		let content = $editor.getText();
		if (isSubmitting) return;

		// Check if we have content (for regular posts) or valid poll (for poll posts)
		const validPollOptions = isPollMode ? pollOptions.filter((o) => o.trim().length > 0) : [];
		const hasValidPoll = isPollMode && validPollOptions.length >= 2;

		if (selectedKind === 'event') {
			handleEventSubmit();
			return;
		}

		if (selectedKind === 'media' && !hasMedia) return;
		if (!content && !repost && !hasValidPoll && selectedKind !== 'media') return;
		isSubmitting = true;
		const referencedReadRelays = await resolveReferencedReadRelays();

		// Get tags from the editor (nprofile -> p tags, nevent -> q tags, etc.)
		const editorTags = $editor.storage.nostr?.getEditorTags() || [];

		let post: DraftEventTemplate;

		if (isPollMode) {
			// Store poll-specific tags to add after prepareEvent
			const pollTags = [
				['polltype', pollType === 'singlechoice' ? 'singlechoice' : 'multiplechoice'],
				...validPollOptions.map((opt, i) => ['option', i.toString(), opt.trim()]),
				...(pollEndsAt ? [['endsAt', pollEndsAt.toString()]] : [])
			];

			// Create kind 1068 poll with base tags only (editor tags + reply/repost context)
			post = {
				kind: 1068,
				created_at: now(),
				content: content.trim(), // Poll question
				tags: [...editorTags]
			};

			if (note && reply) {
				if (hexId) post.id = hexId;
				const parentTags = fbArray(note, 'tags').map((sv) =>
					fbArray(sv, 'items').map((item) => String(item || ''))
				);
				post.tags = [...post.tags, ...parentTags];
			}

			if (note && repost) {
				const repostId = hexId || '';
				const repostPubkey = note.pubkey() || '';
				post.content += '\n\nnostr:' + nip19.neventEncode({ id: repostId });

				const relayHint = referencedReadRelays[0] || '';

				post.tags = [...post.tags, ['q', repostId, relayHint, repostPubkey], ['p', repostPubkey]];
			}

			post = prepareEvent(post);
			post.tags = addThreadRelayTag(post.tags);

			// Add poll-specific tags after prepareEvent
			post.tags = [...post.tags, ...pollTags];
		} else {
			// Create kind 1 or kind 20 post
			post = {
				kind: selectedKind === 'media' ? 20 : 1,
				created_at: now(),
				content: content.trim(),
				tags: editorTags
			};

			if (note && reply) {
				if (hexId) post.id = hexId;
				const parentTags = fbArray(note, 'tags').map((sv) =>
					fbArray(sv, 'items').map((item) => String(item || ''))
				);
				post.tags = [...parentTags, ...editorTags];
			}

			if (note && repost) {
				const repostId = hexId || '';
				const repostPubkey = note.pubkey() || '';
				post.content += '\n\nnostr:' + nip19.neventEncode({ id: repostId });

				const relayHint = referencedReadRelays[0] || '';

				post.tags = [...editorTags, ['q', repostId, relayHint, repostPubkey], ['p', repostPubkey]];
			}

			post = prepareEvent(post);
			post.tags = addThreadRelayTag(post.tags);

			if (selectedKind === 'media') {
				post.tags = [...post.tags, ...imageTagsFromEditor()];
			}
		}

		onSubmit(post as NostrEvent);

		let sendStatus: { [url: string]: ConnectionStatus } = {};
		const id = Math.random().toString(36).substring(2, 9);
		const defaultRelays = publishTargets(referencedReadRelays);
		console.info('[post-publish] relay destinations', {
			mode: reply ? 'reply' : repost ? 'repost-or-quote' : 'post',
			selectedRelay: selectedRelay || undefined,
			publisherWriteRelays: get(writeRelays).filter(Boolean),
			referencedReadRelays,
			destinations: defaultRelays
		});

		// Determine which subscriptions to optimistically update
		const optimisticSubIds: string[] = [];
		if (hexId) {
			optimisticSubIds.push('f_' + hexId);
			optimisticSubIds.push('replies_' + hexId);
		}

		usePublish(
			id,
			post,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl();
					if (!relayUrl) return;
					console.log('relay url', status.relayUrl(), status.message(), status.status(), post);
					sendStatus[relayUrl] = status;
					updateSendStatus(id, sendStatus);
				}
			},
			{ subId: optimisticSubIds.length > 0 ? optimisticSubIds : undefined, defaultRelays }
		);

		isSubmitting = false;
		pagerAnimator?.goBack();
	}

	function toggleGifPicker() {
		showPicker = !showPicker;
		// $editor?.commands.focus();
	}

	function selectMediaFiles() {
		if (!$editor) return;
		$editor.commands.selectFiles();
		$editor.commands.focus();
	}

	function selectKind(kind: string) {
		if (kind !== 'note' && kind !== 'media' && kind !== 'event') return;
		selectedKind = kind;
		isPollMode = false;
	}

	function selectComposeMode(mode: string) {
		if (mode !== 'note' && mode !== 'media' && mode !== 'event' && mode !== 'poll') return;
		if (mode === 'poll') {
			selectedKind = 'note';
			isPollMode = true;
			return;
		}
		selectKind(mode);
	}

	function selectEventCategory(category: string) {
		if (
			category !== 'training' &&
			category !== 'match' &&
			category !== 'meeting' &&
			category !== 'social'
		) {
			return;
		}
		eventCategory = category;
	}

	function selectDestination(relay: string) {
		selectedRelay = relay;
		step = 'compose';
	}

	async function resolveReferencedReadRelays() {
		const referencedPubkey = note?.pubkey();
		if ((!reply && !repost) || !referencedPubkey) return [];

		const discoveredRelays = await new Promise<string[]>((resolve) => {
			getUserRelays(referencedPubkey, resolve, 'read');
		});

		return [...new Set([...referencedRelayHints, ...discoveredRelays])].filter(Boolean);
	}

	function publishTargets(referencedReadRelays: string[] = []) {
		if (selectedRelay) return [selectedRelay];
		return [
			...new Set([
				...get(writeRelays).filter((relay): relay is string => Boolean(relay)),
				...referencedReadRelays
			])
		];
	}

	function getVirtualItemId(item: { id: string }) {
		return item.id;
	}

	function communityRelays(roleSets: ParsedEvent[]) {
		const seen = new Set<string>();
		return roleSets
			.flatMap((event) => {
				const relayRole = relayRoleFromSet(event);
				if (!relayRole || relayRole === 'purchase') return [];
				const role =
					relayRole === 'admin' ? 'Admin' : relayRole === 'member' ? 'Member' : 'Following';
				return relayUrlsFromRelaySet(event).map((url) => ({ url: normalizeURL(url), role }));
			})
			.filter((item) => {
				if (seen.has(item.url)) return false;
				seen.add(item.url);
				return true;
			});
	}

	function relayLabel(url: string) {
		return url
			.replace(/^wss?:\/\//, '')
			.replace(/^relay\./, '')
			.replace(/\/$/, '');
	}

	function defaultDateTimeLocal(hoursFromNow: number) {
		const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
		date.setMinutes(0, 0, 0);
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

	function imageTagsFromEditor() {
		const json = ($editor as any)?.getJSON?.();
		const images: string[][] = [];
		function visit(node: any) {
			if (!node) return;
			if (node.type === 'image' && node.attrs?.src) {
				const tag = ['imeta', 'url ' + node.attrs.src];
				if (node.attrs.alt) tag.push('alt ' + node.attrs.alt);
				if (node.attrs.title) tag.push('summary ' + node.attrs.title);
				images.push(tag);
			}
			if (Array.isArray(node.content)) node.content.forEach(visit);
		}
		visit(json);
		return images;
	}

	function parentRelayTag() {
		if (!note) return '';
		return (
			parsedEventTags(note).find((tag) => tag[0] === 'r' && tag[1]?.startsWith('wss://'))?.[1] || ''
		);
	}

	function threadRelayTag() {
		return selectedRelay || parentRelayTag();
	}

	function addThreadRelayTag(tags: string[][]) {
		const relay = threadRelayTag();
		if (!relay) return tags;
		const normalized = normalizeURL(relay);
		if (tags.some((tag) => tag[0] === 'r' && tag[1] && normalizeURL(tag[1]) === normalized)) {
			return tags;
		}
		return [...tags, ['r', normalized]];
	}

	function mediaItemsFromEditor() {
		const json = ($editor as any)?.getJSON?.();
		const items: MediaItem[] = [];
		function visit(node: any) {
			if (!node) return;
			if (node.type === 'image') {
				items.push({
					src: node.attrs?.src || '',
					uploading: Boolean(node.attrs?.uploading),
					error: node.attrs?.uploadError || ''
				});
			}
			if (Array.isArray(node.content)) node.content.forEach(visit);
		}
		visit(json);
		return items;
	}

	function handleEventSubmit() {
		if (isSubmitting || !canSubmitEvent) return;
		isSubmitting = true;

		const startsAtTimestamp = timestampFromLocal(eventStartsAt);
		const endsAtTimestamp = eventEndsAt ? timestampFromLocal(eventEndsAt) : undefined;
		const capacity = eventCapacity ? Math.max(1, Math.floor(Number(eventCapacity))) : undefined;
		const title = eventTitle.trim();
		const summary = eventSummary.trim();
		const d = slugFromTitle(title);
		const tags: string[][] = [
			['d', d],
			['title', title],
			['summary', summary],
			['start', String(startsAtTimestamp)],
			['t', eventCategory]
		];
		if (endsAtTimestamp) tags.push(['end', String(endsAtTimestamp)]);
		if (eventLocation.trim()) tags.push(['location', eventLocation.trim()]);
		if (capacity) tags.push(['capacity', String(capacity)]);
		const eventTags = addThreadRelayTag(tags);

		const post: EventTemplate = {
			kind: 31923,
			content: summary,
			created_at: now(),
			tags: [...eventTags, ['client', 'nutscash']]
		};

		onSubmit(post as NostrEvent);
		const id = 'community_event_' + selectedRelay + '_' + d;
		usePublish(
			id,
			post,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (!status) return;
				const relayUrl = status.relayUrl();
				if (!relayUrl) return;
				updateSendStatus(id, { [relayUrl]: status });
			},
			{ defaultRelays: [selectedRelay], trackStatus: true }
		);

		isSubmitting = false;
		pagerAnimator?.goBack();
	}
</script>

<div class="flex items-start md:items-center h-screen">
	<VirtualListBottom
		items={[{ id: 'content' }]}
		height="auto"
		maxHeight={$isMobile ? '100vh' : '90vh'}
		bind:viewport
		backdrop={false}
		getItemId={getVirtualItemId}
	>
		<slot name="item-content">
			<div
				class="bg-base-300 md:border border-primary-content bg-opacity-85 rounded-xl px-4 w-feed md:h-auto md:min-h-fit min-h-screen backdrop-blur-sm overflow-visible"
			>
				<div class="md:px-0 pt-safe flex justify-between h-20 items-center">
					<button
						type="button"
						class="rounded-full p-2 hover:bg-base-100"
						on:click={() => pagerAnimator?.goBack()}
					>
						<Icon icon="mingcute:down-line" class="text-xl" />
					</button>
				</div>
				{#if step === 'setup'}
					<div class="pb-safe md:pb-4">
						<div class="mb-4">
							<p class="text-sm font-semibold text-base-content/60">New post</p>
							<h2 class="text-xl font-bold text-base-content">Where should it go?</h2>
						</div>

						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
							<button
								type="button"
								class="group min-h-28 rounded-lg border border-blue-500/70 bg-blue-500/10 p-3 text-left transition hover:-translate-y-0.5 hover:bg-blue-500/15 focus:outline-none focus:ring-2 focus:ring-blue-400/60 active:translate-y-0"
								on:click={() => selectDestination('')}
							>
								<span class="flex h-full flex-col justify-between">
									<span>
										<Icon icon="mdi:earth" class="h-5 w-5 text-blue-500" />
										<span class="mt-2 block font-bold text-base-content">Public</span>
									</span>
									<span class="text-xs leading-4 text-base-content/50">Your write relays</span>
								</span>
							</button>

							{#each communityOptions as community (community.url)}
								<button
									type="button"
									class="group min-h-28 rounded-lg border border-primary-content/30 bg-base-200/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-primary-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-blue-400/60 active:translate-y-0"
									on:click={() => selectDestination(community.url)}
								>
									<span class="flex h-full flex-col justify-between">
										<span>
											<Icon icon="mdi:account-group-outline" class="h-5 w-5 text-base-content/60" />
											<span class="mt-2 block truncate font-bold text-base-content"
												>{relayLabel(community.url)}</span
											>
										</span>
										<span class="truncate text-xs leading-4 text-base-content/50"
											>{community.role}</span
										>
									</span>
								</button>
							{/each}
						</div>

						{#if !communityOptions.length}
							<p class="mt-3 text-sm text-base-content/50">
								No communities found yet. Public is available.
							</p>
						{/if}
					</div>
				{:else}
					{#if noteId && note}
						<Note
							noteId={hexId}
							depth={1}
							showRoot={false}
							footer={false}
							showQuote={false}
							context={[note]}
						/>
						<br />
					{:else if noteId}
						<!-- Loading state -->
						<div class="h-32 flex items-center justify-center">
							<Loader size="lg" className="text-gray-400" />
						</div>
					{:else if $isMobile}
						<div class="h-32"></div>
					{/if}

					{#if selectedKind === 'event'}
						<div
							class="mb-3 grid gap-3 rounded-lg border border-primary-content/30 bg-base-200/70 p-3"
						>
							<div class="grid grid-cols-[auto_1fr] items-start gap-3">
								<div
									class="grid h-11 w-11 place-items-center rounded-md bg-blue-500/10 text-blue-500"
								>
									<Icon icon="mdi:calendar-plus-outline" class="h-6 w-6" />
								</div>
								<div class="min-w-0">
									<p class="font-bold text-base-content">Community event</p>
									<p class="mt-0.5 text-sm leading-5 text-base-content/55">
										Publish a dated event to {destinationLabel}.
									</p>
								</div>
							</div>

							<input
								class="rounded-md border border-primary-content/40 bg-base-300 px-3 py-2.5 font-semibold text-base-content outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
								placeholder="Event title"
								bind:value={eventTitle}
							/>
							<textarea
								class="min-h-24 resize-none rounded-md border border-primary-content/40 bg-base-300 px-3 py-2 text-base-content outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
								placeholder="Short summary"
								bind:value={eventSummary}
							></textarea>
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<label class="grid gap-1 text-xs font-semibold text-base-content/55">
									<span>Starts</span>
									<input
										type="datetime-local"
										class="rounded-md border border-primary-content/40 bg-base-300 px-3 py-2 text-sm text-base-content outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
										bind:value={eventStartsAt}
									/>
								</label>
								<label class="grid gap-1 text-xs font-semibold text-base-content/55">
									<span>Ends</span>
									<input
										type="datetime-local"
										class="rounded-md border border-primary-content/40 bg-base-300 px-3 py-2 text-sm text-base-content outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
										bind:value={eventEndsAt}
									/>
								</label>
							</div>
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px]">
								<input
									class="rounded-md border border-primary-content/40 bg-base-300 px-3 py-2 text-base-content outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
									placeholder="Location"
									bind:value={eventLocation}
								/>
								<input
									type="number"
									min="1"
									class="rounded-md border border-primary-content/40 bg-base-300 px-3 py-2 text-base-content outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
									placeholder="Capacity"
									bind:value={eventCapacity}
								/>
							</div>
							<div class="grid grid-cols-4 gap-1 rounded-md bg-base-300 p-1">
								{#each ['training', 'match', 'meeting', 'social'] as category (category)}
									<button
										type="button"
										class="rounded px-2 py-2 text-xs font-bold capitalize transition {eventCategory ===
										category
											? 'bg-blue-500 text-highlight shadow-sm'
											: 'text-base-content/60 hover:bg-base-100'}"
										on:click={() => selectEventCategory(category)}
									>
										{category}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if selectedKind === 'media' && !isPollMode}
						<div
							class="mb-3 grid gap-3 rounded-lg border border-primary-content/30 bg-base-200/70 p-3"
						>
							<div class="grid grid-cols-[1fr_auto] items-start gap-3">
								<div class="min-w-0">
									<p class="font-bold text-base-content">Media post</p>
									<p class="mt-0.5 text-sm leading-5 text-base-content/55">
										Add images first, then write a short caption.
									</p>
								</div>
								<button
									type="button"
									class="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-2 text-sm font-bold text-highlight transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400/60 active:translate-y-px"
									on:click={selectMediaFiles}
								>
									<Icon icon="mdi:image-plus-outline" class="h-5 w-5" />
									<span>Add</span>
								</button>
							</div>

							<button
								type="button"
								class="group grid min-h-44 place-items-center rounded-md border border-dashed border-primary-content/40 bg-base-300/70 px-4 py-6 text-center transition hover:-translate-y-0.5 hover:border-blue-500/80 hover:bg-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-400/60 active:translate-y-0"
								on:click={selectMediaFiles}
							>
								<span class="grid justify-items-center gap-2">
									<span
										class="grid h-12 w-12 place-items-center rounded-md bg-base-100 text-base-content/70 transition group-hover:text-blue-500"
									>
										<Icon icon="mdi:image-multiple-outline" class="h-7 w-7" />
									</span>
									<span class="font-bold text-base-content">Choose photos or GIFs</span>
									<span class="max-w-56 text-sm leading-5 text-base-content/50">
										Uploaded media will appear below for review.
									</span>
								</span>
							</button>
						</div>
					{/if}

					{#if selectedKind !== 'event'}
						<!-- Editor container -->
						<div
							class:selected-media-compose={selectedKind === 'media' && !isPollMode}
							class="min-h-[120px] rounded-md relative transition-all duration-200"
							tabindex="-1"
							role="presentation"
							on:keydown|stopPropagation
						>
							<EditorComponent
								{initialContent}
								class={selectedKind === 'media' && !isPollMode
									? 'media-post-editor min-h-14 rounded-lg border border-primary-content/30 bg-base-300/80 focus:outline-none focus:ring-0 focus:border-primary-content focus-visible:outline-none focus-visible:ring-0 focus-visible:border-primary-content'
									: 'min-h-32 rounded-md border border-primary-content focus:outline-none focus:ring-0 focus:border-primary-content focus-visible:outline-none focus-visible:ring-0 focus-visible:border-primary-content'}
								onSubmit={handleSubmit}
								bind:editor
								{showPicker}
								autoFocus
							>
								{#if selectedKind === 'media' && !isPollMode}
									Add a caption
								{:else if reply}
									Reply to
									{#if note}
										<User pubkey={note.pubkey() || ''} />
									{/if}
								{:else if repost}
									Add a quote?
								{:else}
									{placeholder}
								{/if}
							</EditorComponent>
						</div>
					{/if}

					<!-- Poll Creator (shown when poll mode is enabled) -->
					{#if isPollMode}
						<PollCreator
							bind:options={pollOptions}
							bind:pollType
							bind:endsAt={pollEndsAt}
							disabled={isSubmitting}
						/>
					{/if}

					<!-- Actions section -->
					<div
						class="flex items-center justify-end mt-3 pt-2 border-t border-primary-content dark:border-gray-700 transition-opacity duration-200 pb-safe md:pb-4"
						transition:fly={{ y: 20, duration: 200 }}
					>
						<div class="flex items-center space-x-1 mr-4">
							<!-- Image upload button -->
							<button
								type="button"
								class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
								title={selectedKind === 'media' ? 'Add media' : 'Upload image'}
								on:click={selectMediaFiles}
							>
								<Icon icon="carbon:image" class="w-5 h-5" />
							</button>

							<!-- Emoji picker button -->
							<!-- <div class="relative">
							<EmojiPicker onEmojiSelect={handleEmojiSelect} position="bottom" />
						</div> -->

							<!-- GIF button -->
							<button
								type="button"
								class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
								title="Insert GIF"
								on:click={toggleGifPicker}
								data-gif-trigger
							>
								<Icon icon="mage:gif" class="w-5 h-5" />
							</button>
						</div>

						<!-- Cancel & Post buttons -->
						<div class="flex items-center space-x-2">
							{#if editorText || hasMedia}
								<button
									type="button"
									class="px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
									on:click|stopPropagation={() => {
										$editor.commands.clearContent();
									}}
								>
									Cancel
								</button>
							{/if}

							<button
								type="button"
								class="px-4 py-2 bg-blue-500 text-highlight rounded-full font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
								on:click={handleSubmit}
								disabled={isSubmitting || !canSubmitPost}
							>
								<div class="flex items-center space-x-1">
									{#if isSubmitting}
										<span>Signing...</span>
										<Loader size="sm" />
									{:else if isPollMode}
										<span>Poll</span>
									{:else if reply}
										<span>Reply</span>
									{:else if repost}
										<span>Repost</span>
									{:else if selectedKind === 'event'}
										<span>Event</span>
									{:else if selectedKind === 'media'}
										<span>Media</span>
									{:else}
										<span>Post</span>
									{/if}
									<Icon icon="carbon:send" class="w-4 h-4" />
								</div>
							</button>
						</div>
					</div>

					{#if !reply && !repost}
						<div class="compose-kind-switcher-wrap">
							<div
								class="grid gap-3 border-t border-primary-content/20 bg-base-200/80 px-4 py-3 text-sm backdrop-blur-sm"
							>
								<div class="flex items-center justify-between gap-3">
									<div class="min-w-0">
										<p class="text-xs font-semibold text-base-content/50">Publishing to</p>
										<p class="truncate font-bold text-base-content">{destinationLabel}</p>
									</div>
									<button
										type="button"
										class="rounded-md px-2 py-1 text-xs font-semibold text-blue-500 transition hover:bg-blue-500/10"
										on:click={() => (step = 'setup')}
									>
										Change
									</button>
								</div>
								<div class="grid grid-cols-4 gap-1">
									{#each [{ id: 'note', label: 'Note', icon: 'mdi:text-box-outline' }, { id: 'media', label: 'Media', icon: 'mdi:image-multiple' }, { id: 'event', label: 'Event', icon: 'mdi:calendar-outline' }, { id: 'poll', label: 'Poll', icon: 'mdi:poll' }] as mode (mode.id)}
										<button
											type="button"
											class="flex min-w-0 items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-bold transition {composeMode ===
											mode.id
												? 'bg-blue-500 text-highlight shadow-sm'
												: 'bg-base-300 text-base-content/65 hover:bg-base-100'}"
											on:click={() => selectComposeMode(mode.id)}
										>
											<Icon icon={mode.icon} class="h-4 w-4 shrink-0" />
											<span class="truncate">{mode.label}</span>
										</button>
									{/each}
								</div>
							</div>
						</div>

						{#if selectedKind === 'event' && !selectedRelay}
							<div
								class="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-base-content"
							>
								Events need a community. Choose a community destination to publish an event.
							</div>
						{/if}
					{/if}
				{/if}
			</div>
		</slot>
	</VirtualListBottom>
</div>

<style>
	:global(.media-post-editor) {
		align-items: stretch;
		justify-content: flex-start;
	}

	:global(.media-post-editor .ProseMirror) {
		display: grid;
		min-height: 2.75rem;
		width: 100%;
		grid-template-columns: 1fr;
		align-content: start;
		text-align: left;
	}

	:global(.media-post-editor [data-node-view-wrapper]) {
		display: flex;
		width: 100%;
		min-height: 120px;
		justify-content: stretch;
	}

	.compose-kind-switcher-wrap {
		position: relative;
		left: 50%;
		width: 100vw;
		margin-left: -50vw;
		margin-top: 0.75rem;
	}

	:global(.media-post-editor img) {
		height: 100% !important;
		min-height: 120px;
		max-height: 280px;
		width: 100%;
		max-width: 100%;
		border-radius: 0.5rem;
		object-fit: cover;
	}

	:global(.media-post-editor p) {
		margin: 0;
		max-width: 100%;
		text-align: left;
		color: hsl(var(--bc) / 0.7);
	}

	:global(.media-post-editor p:not(:has(img))) {
		grid-column: 1 / -1;
		min-height: 1.5rem;
	}

	@media (max-width: 640px) {
		:global(.media-post-editor) {
			min-height: 3.5rem;
		}
	}
</style>
