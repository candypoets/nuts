<script lang="ts">
	import {
		Kind1Parsed,
		MessageType,
		type ConnectionStatus,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { nip19 } from 'nostr-tools';
	import type { AddressPointer } from 'nostr-tools/nip19';
	import { getContext, onDestroy } from 'svelte';

	import {
		asConnectionStatus,
		asKind1,
		asKind4,
		asKind6,
		asKind1111,
		asParsedEvent,
		ConnectionTracker,
		fbArray
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { isEqual, uniqBy } from 'lodash';
	import { normalizeURL } from 'nostr-tools/utils';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { isMobile } from 'src/controller';
	import { readRelays } from 'src/controller/nostr';
	import { relayStatusMap, relaySub, setSubRelays } from 'src/controller/relay';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import { toRequestObject } from 'src/lib/request';
	import ContentBlocks from 'src/routes/explore/_post/ContentBlocks.svelte';
	import Footer from 'src/routes/explore/_post/footer.svelte';
	import Header from 'src/routes/explore/_post/header.svelte';
	import Kind1068Content from 'src/routes/explore/_post/kind1068Content.svelte';
	import Kind20Content from 'src/routes/explore/_post/kind20Content.svelte';
	import Kind30023Content from 'src/routes/explore/_post/kind30023Content.svelte';
	import Kind30311Content from 'src/routes/explore/_post/kind30311Content.svelte';
	import Zap from 'src/routes/explore/_post/zap.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import { getUserRelays } from 'src/routes/queries/user';
	import { get } from 'svelte/store';
	import { go } from '../modals/modal';

	export let main: boolean = false;
	export let noteId: string | undefined = undefined;
	export let naddr: string | undefined = undefined;
	export let context: ParsedEvent[] = [];
	export let note: ParsedEvent | undefined = undefined;
	export let zaps: boolean = false;
	export let footer: boolean = true;
	export let visible: boolean = false;
	export let showQuote = true;
	export let showReplies:
		| ((post: ParsedEvent) => (events: ParsedEvent[]) => ParsedEvent[])
		| undefined = undefined;
	export let showRoot: boolean = true;
	export let depth = 0;

	// Repost handling variables
	let kind6: ReturnType<typeof asKind6> | undefined;
	let isRepost = false;
	let displayNote: ParsedEvent | undefined | null;
	let reposterPubkey: string | undefined;
	let effectiveShowRoot = showRoot;
	let kind1: ReturnType<typeof asKind1> | undefined;
	let isKind20 = false;

	// Check if this is a repost (kind 6) and extract the reposted event
	// Grouped in a single reactive statement to avoid false positive cycle detection
	$: {
		kind6 = note && asKind6(note as ParsedEvent);
		isRepost = !!kind6 && typeof kind6?.repostedEvent === 'function';
		displayNote = isRepost ? kind6?.repostedEvent?.() : note;
		reposterPubkey = isRepost ? note?.pubkey()! : undefined;
		effectiveShowRoot = isRepost ? false : showRoot;
		kind1 = displayNote && asKind1(displayNote as ParsedEvent);
		isKind20 = displayNote?.kind?.() === 20;
	}
	// Extract content blocks for ContentBlocks component - single reactive statement
	$: {
		// Get the source for content blocks (repost wraps another note, so unwrap it)
		// First try kind6's reposted event, then the already-computed kind1, then try kind4/kind1111
		let contentSource: any = null;
		
		const repostedEvent = kind6?.repostedEvent?.();
		if (repostedEvent) {
			// For reposts, narrow the reposted event to kind1
			contentSource = asKind1(repostedEvent);
		} else if (kind1) {
			// Use the already-computed kind1 if available
			contentSource = kind1;
		} else if (displayNote) {
			// Fallback: try kind4 or kind1111
			contentSource = asKind4(displayNote) || asKind1111(displayNote);
		}
		
		parsedContent = fbArray(contentSource, 'parsedContent') || [];
		shortContent = fbArray(contentSource, 'shortenedContent') || [];
	}

	// Reactive declarations for parsedContent and shortContent
	let parsedContent: any[] = [];
	let shortContent: any[] = [];
	// Decode naddr when provided
	$: naddrDecoded = (() => {
		if (!naddr) return null;
		try {
			const result = nip19.decode(naddr);
			if (result.type === 'naddr') {
				const data = result.data as AddressPointer;
				// Use relay hints from naddr if available
				if (data.relays?.length && relays.length === 0) {
					relays = data.relays.slice(0, 5);
				}
				return data;
			}
		} catch (e) {
			console.error('Failed to decode naddr:', e);
		}
		return null;
	})();

	$: nid = noteId || displayNote?.id()!;

	// Effective ID for subscriptions - uses synthetic ID for naddr
	$: effectiveNid = naddrDecoded
		? `naddr:${naddrDecoded.pubkey}:${naddrDecoded.kind}:${naddrDecoded.identifier}`
		: (nid ?? '');

	$: decoded = {
		noteId: nid,
		replyID: kind1?.reply()?.id()!,
		mentions: fbArray(kind1 as Kind1Parsed, 'mentions')
	};

	// is the note leading in a thread
	export let leading: boolean | undefined = undefined;
	// is the note tailing in a thread
	export let tailing: boolean | undefined = undefined;

	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;
	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let replies: ParsedEvent[] = [];

	$: visibleReplies = showReplies && displayNote ? showReplies(displayNote)(replies) : [];

	let timeout: ReturnType<typeof setTimeout> | undefined;

	let isImageContext = getContext('imageContext');

	export let relays: string[] = [];

	let subscribing = false;

	// Find note from context if not provided directly
	// Note: This runs when noteId/context changes, not when displayNote changes (avoids cycle)
	$: if ((noteId || naddr) && context && !note) {
		const foundNote = context.find((event) => {
			if (noteId) {
				return event?.id()! === noteId;
			}
			// For naddr: match by kind, author, and d-tag
			if (naddrDecoded && event?.kind() === naddrDecoded.kind) {
				const tags = fbArray(event, 'tags');
				const dTag = tags.find((t) => fbArray(t, 'items')[0] === 'd');
				const identifier = dTag ? fbArray(dTag, 'items')[1] : '';
				return identifier === naddrDecoded.identifier && event?.pubkey()! === naddrDecoded.pubkey;
			}
			return false;
		});
		if (foundNote) note = foundNote;
	}

	const connectionTracker = new ConnectionTracker();

	function handleEvents(message: WorkerMessage) {
		switch (message.type()) {
			case MessageType.ConnectionStatus:
				const status = asConnectionStatus(message);
				connectionTracker.handleMessage(message);
				if (connectionTracker.resolutionRate > 0.5 && !note) {
					setSubRelays(nid as string, [
						'wss://nostr.wine',
						'wss://relay.snort.social',
						'wss://relay.damus.io',
						'wss://relay.primal.net'
					]);
				}
				// Check resolution rate to handle EOSE equivalent behavior
				if (connectionTracker.resolutionRate >= 0.5) {
					handleEose();
				}
				connectionStatus[normalizeURL(status?.relayUrl()! as string)] = status as ConnectionStatus;
				break;
			case MessageType.Eoce:
				// EOCE is just for tracking - EOSE detection is done via ConnectionTracker
				break;
			case MessageType.ParsedNostrEvent:
				eventsReceived++;
				const parsedEvent = asParsedEvent(message) as ParsedEvent;
				context = uniqBy([...context, parsedEvent], (c) => c?.id());
				if (
					parsedEvent?.id()! !== decoded.noteId &&
					!replies.some((r) => r.id() === parsedEvent.id())
				) {
					replies = [...replies, parsedEvent];
				}
				break;
		}
	}

	let subed = 0;

	function subscribe(subId?: string) {
		timeout = setTimeout(
			async () => {
				if (visible) {
					// Start tracking search state
					startSearchTimeout();

					if (!sub && (nid || naddrDecoded)) {
						subed++;

						// Build the main request based on whether it's naddr or regular note
						// Skip loading note by ID if we already have it (naddr always needs loading)
						const mainRequest = naddrDecoded
							? {
									// Naddr: query by kind + author + d-tag
									kinds: [naddrDecoded.kind],
									authors: [naddrDecoded.pubkey],
									tags: { '#d': [naddrDecoded.identifier] },
									limit: 5,
									relays: relays.slice(0, 5) || [],
									cacheFirst: true
								}
							: note
								? null // Already have the note, skip the ids request
								: {
										// Regular note: query by id
										ids: nid ? [nid] : [],
										limit: 5,
										relays: relays.slice(0, 5) || [],
										cacheFirst: true
									};

						// Collect ancestor IDs to bulk load (up to 5 levels deep)
						const ancestorIds: string[] = [];
						let currentReply = kind1?.reply?.();
						while (currentReply && ancestorIds.length < 5) {
							const replyId = currentReply?.id?.();
							if (replyId && !context.some((e) => e?.id() === replyId)) {
								ancestorIds.push(replyId);
							}
							// Access the next reply in chain (if currentReply has its own reply)
							currentReply = (currentReply as any)?.reply?.() || undefined;
						}

						const requests = [
							// Only include main request if we need to load the note
							...(mainRequest ? [mainRequest] : []),
							// Bulk load ancestors if any (not already in context)
							...(ancestorIds.length > 0
								? [{ ids: ancestorIds, limit: ancestorIds.length * 2, relays: relays || [] }]
								: []),
							// For naddr, replies work differently (no #e tag to query)
							...(naddrDecoded ? [] : [{ limit: 10, tags: { '#e': [nid] }, relays: relays || [] }]),
							...(displayNote
								? fbArray(displayNote, 'requests').map((r) => toRequestObject(r))
								: [])
						];

						// Only subscribe if there are requests to make
						if (requests.length > 0) {
							sub = useSubscription(subId || effectiveNid || 'unknown', requests, handleEvents);
						}
						// Fallback: if displayNote not yet available, load direct ancestor separately
						// This handles cases where kind1 is parsed but the note hasn't loaded yet
						if (effectiveShowRoot && kind1?.reply() && !displayNote) {
							const pubkey = kind1?.reply()?.author()!;
							const id = kind1?.reply()?.id()!;
							if (pubkey && id) {
								getUserRelays(pubkey, (relays) => {
									useSubscription(
										'root_' + (subId || nid || 'unknown'),
										[{ ids: [id], limit: 5, relays }],
										handleEvents
									);
								});
							}
						}

						if (showQuote && kind1?.mentionsLength()) {
							const mentions = [];
							for (let i = 0; i < kind1.mentionsLength(); i++) {
								const mention = kind1.mentions(i);
								const pubkey = mention?.author()!;
								const id = mention?.id()!;
								if (pubkey && id) {
									mentions.push({ pubkey, id });
								}
							}
							const uniquePubkeys = [...new Set(mentions.map((m) => m.pubkey))];
							const allIds = mentions.map((m) => m.id);
							let allRelays = new Set<string>();
							let fetched = 0;
							const total = uniquePubkeys.length;
							if (total === 0) return;
							uniquePubkeys.forEach((pubkey) => {
								getUserRelays(pubkey, (relays) => {
									relays.slice(0, 3).forEach((r) => allRelays.add(r));
									fetched++;
									if (fetched === total) {
										useSubscription(
											'quote_' + (subId || nid || 'unknown'),
											[
												{
													ids: allIds,
													limit: 5 * allIds.length,
													relays: Array.from(allRelays)
												}
											],
											handleEvents
										);
									}
								});
							});
						}
					}
					if (!relays.length && !relaysub) {
						relaysub = getUserRelays(
							displayNote?.pubkey()! as string,
							(result) => {
								relays = result.slice(0, $isMobile ? 3 : 5);
							},
							'read'
						);
					}
				}
			},
			!depth ? 500 : 0
		);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = undefined;
		}
		sub?.();
		sub = undefined;
		subed--;
		relaysub?.();
		relaysub = undefined;
	}

	$: visible == true && (nid || naddrDecoded) ? subscribe() : unsubscribe();

	$: hasRoot =
		decoded.replyID &&
		!(decoded.mentions || []).some((mId) => mId == decoded.replyID) &&
		!depth &&
		effectiveShowRoot;

	function goto() {
		// Prevent navigation if user has selected text
		const selection = window.getSelection();
		if (selection && selection.toString().trim().length > 0) {
			return;
		}
		// if (isImageContext) return;
		if (naddr) {
			go(`naddr:${naddr}`);
		} else {
			const nip19Event = nip19.neventEncode({ id: decoded.noteId || nid || '', relays });
			go(`nevent:${nip19Event}`);
		}
	}

	onDestroy(unsubscribe);

	let relayCounter = 0;

	// Search state tracking
	let searchState: 'loading' | 'found' | 'not-found' | 'unrenderable' = 'loading';
	let searchTimeout: ReturnType<typeof setTimeout> | undefined;
	let eventsReceived = 0;

	// Fallback relays for retry
	const FALLBACK_RELAYS = [
		'wss://nostr.wine',
		'wss://relay.snort.social',
		'wss://relay.damus.io',
		'wss://relay.primal.net',
		'wss://nos.lol'
	];

	// Get additional working relays from global relay status for deep search
	function getWorkingRelays(): string[] {
		const working: string[] = [];
		const statusMap = relayStatusMap; // imported from relay.ts
		// We'll use the connectionStatus we already track in this component
		// plus we could subscribe to relayStatusMap
		return working;
	}

	// Check if the found note can be rendered
	function checkRenderability(
		note: ParsedEvent | undefined | null
	): 'found' | 'not-found' | 'unrenderable' {
		if (!note) return 'not-found';

		const kind = note.kind();

		// Kind 1 is always renderable (via Content component)
		if (kind === 1) return 'found';

		// Kind 30023, 30311, and 1068 have dedicated components
		if (kind === 30023 || kind === 30311 || kind === 1068) return 'found';

		// Kind 6 needs a valid reposted event
		if (kind === 6) {
			const k6 = asKind6(note);
			if (k6?.repostedEvent?.()) return 'found';
			return 'unrenderable';
		}

		// Kind 20 (image posts) is renderable
		if (kind === 20) return 'found';

		return 'unrenderable';
	}

	// Start search timeout when subscribing
	function startSearchTimeout() {
		// Clear any existing timeout
		if (searchTimeout) clearTimeout(searchTimeout);

		// Reset state
		searchState = 'loading';
		eventsReceived = 0;

		// Set timeout for not-found detection (2.5 seconds - sweet spot)
		searchTimeout = setTimeout(() => {
			if (!displayNote && searchState === 'loading') {
				searchState = 'not-found';
			}
		}, 2500);
	}

	// Handle EOSE - wait for sufficient resolution rate before marking not found
	function handleEose() {
		// Only mark as not-found if we have a decent resolution rate (half or more relays responded)
		// and still haven't found the event
		if (!displayNote && searchState === 'loading' && connectionTracker.resolutionRate >= 0.5) {
			if (searchTimeout) clearTimeout(searchTimeout);
			searchState = 'not-found';
		}
	}

	// Retry search with fallback relays + any currently working relays from global pool
	function retryWithFallbackRelays() {
		// Get currently working relays from global relay status (connected/open)
		const workingRelays: string[] = [];
		const globalStatus = get(relayStatusMap);
		globalStatus.forEach((status, url) => {
			if ((status === 'open' || status === 'connected') && !relays.includes(url)) {
				workingRelays.push(url);
			}
		});

		// Also check our own connection status for working relays not yet in the list
		Object.entries(connectionStatus).forEach(([url, status]) => {
			if (status?.status?.() !== 'FAILED' && !relays.includes(url)) {
				workingRelays.push(url);
			}
		});

		// Get user's read relays from kind 10002
		const userReadRelays = get(readRelays) || [];

		// Get default/app relays (from .env - includes ditto)
		const defaultRelays = DEFAULT_RELAYS || [];

		// Combine all relay sources:
		// 1. Existing relays (already tried)
		// 2. Working relays from global pool (newly connected since last attempt)
		// 3. User's read relays from NIP-65
		// 4. Default/app relays (including ditto)
		// 5. Fallback relays (well-known public relays)
		const allRelaySources = [
			...workingRelays,
			...userReadRelays,
			...defaultRelays,
			...FALLBACK_RELAYS
		];

		// Filter out already-used relays, shuffle for better distribution, take up to 15
		const unusedRelays = allRelaySources
			.filter((url) => !relays.includes(url))
			.sort(() => Math.random() - 0.5) // Shuffle
			.slice(0, 15);

		// Combine: existing + up to 15 new unique relays
		const newRelays = [...new Set([...relays, ...unusedRelays])];

		// Always retry - even with same relays, the previous attempt might have timed out
		// Only skip if we have absolutely no relays (shouldn't happen with fallbacks)
		if (newRelays.length > 0) {
			const hasNewRelays = newRelays.length > relays.length;
			relays = newRelays;
			// Reset and re-subscribe with a new subId
			unsubscribe();
			startSearchTimeout();
			subscribe(effectiveNid + '_retry_' + relayCounter);
			relayCounter++;
		}
	}

	// Update search state when displayNote changes
	$: if (displayNote) {
		const renderable = checkRenderability(displayNote);
		searchState = renderable;
		if (searchTimeout) clearTimeout(searchTimeout);
	} else if (searchState === 'found' || searchState === 'unrenderable') {
		// Note was lost (shouldn't happen often)
		searchState = 'not-found';
	}

	$: effectiveNid &&
		relaySub(effectiveNid).subscribe((subRelays) => {
			if (subRelays && !isEqual(relays, subRelays)) {
				relays = subRelays;
				unsubscribe();
				subscribe(effectiveNid + relayCounter);
				relayCounter++;
				connectionStatus = {};
			}
		});
</script>

{#if hasRoot}
	<svelte:self noteId={decoded.replyID} {context} {visible} zaps leading />
{/if}

<!-- {JSON.stringify(fbArray(displayNote, 'requests').map((r) => toRequestObject(r)))}
{subed} -->
<div
	class="py-2 rounded-tl-md backdrop-saturate-150 border-primary-content relative cursor-pointer bg-base-300 bg-opacity-85 mt-1 rounded-lg w-full shadow-widget"
	class:!mt-0={hasRoot || tailing}
	class:px-2={!!depth}
	on:click|stopPropagation={goto}
	class:border-l={!!depth}
	class:border-t={!!depth}
	class:!rounded-t-none={hasRoot || tailing}
	class:!rounded-b-none={leading || visibleReplies.length}
	class:hidden={depth > 3}
>
	<!-- <div class="break-words">
		{noteId} <br />
	</div>
	<div class="break-words">
		context
		{context.map((c) => c?.id()!)}
	</div>
	<div class="break-words">
		requests
		{fbArray(note, 'requests').map((r) => toRequestObject(r).ids?.[0])}
	</div> -->
	{#if displayNote}
		<!--
		{note.id}
		{JSON.stringify(note.requests)} -->
		{#if zaps && !depth}
			<Zap note={displayNote} {visible} class={isRepost && 'absolute'} />
		{/if}
		{#if leading || visibleReplies.length}
			<div
				class="absolute border-primary-content left-4 h-full border-r-2"
				class:hidden={isKind20}
			/>
		{/if}
		{#if hasRoot || tailing}
			<div
				class="absolute border-primary-content left-4 h-8 border-r-2 -mt-8"
				class:hidden={isKind20}
			/>
		{/if}
		{#if isRepost}
			<!-- Repost indicator with reposter's avatar -->
			<div class="flex items-center gap-2 px-1 text-sm text-secondary opacity-80">
				<!-- <span>Reposted by</span> -->
				<Avatar pubkey={reposterPubkey} {context} size="sm" />
				<!-- <Icon icon="mdi:repeat" class="text-lg text-white" /> -->
			</div>
		{/if}
		<Header note={displayNote} {context} {depth} {main}>
			{#if !main}
				<RelaysList subId={nid} {relays} {connectionStatus} mini />
			{/if}
		</Header>
		<!-- {#if main}
			<div class="main">main</div>
		{/if} -->
		<div class="flex gap-2 w-full" class:!gap-0={!!depth}>
			<div class:!min-w-0={!!main || !!depth} class="min-w-8" class:hidden={isKind20} />
			<div
				class="-mt-3 pr-2 flex-grow"
				class:!mt-0={!!depth || isImageContext}
				class:!mt-2={!!main}
				class:!pr-0={isKind20}
			>
				{#if displayNote?.kind?.() === 20}
					{#key displayNote.id()}
						<Kind20Content note={displayNote} />
					{/key}
				{:else if displayNote?.kind?.() === 1068}
					{#key displayNote.id()}
						<Kind1068Content note={displayNote} {visible} />
					{/key}
				{:else if displayNote?.kind?.() === 30023}
					<Kind30023Content note={displayNote} />
				{:else if displayNote?.kind?.() === 30311}
					<Kind30311Content note={displayNote} />
				{:else if !!displayNote.parsed}
					<!-- Debug -->
					<!-- {console.log('[note] displayNote kind:', displayNote?.kind?.(), 'parsed:', !!displayNote.parsed)} -->
					<!-- {kind1?.reply()?.id()!} -->
					<!-- {!!showReplies && note?.id()!} -->
					<ContentBlocks
						content={parsedContent}
						{shortContent}
						note={displayNote}
						{context}
						{visible}
						{depth}
						{showQuote}
					/>
				{:else}
					<div class="p-3 rounded-lg bg-info-content text-sm flex items-center gap-2 mt-2">
						<Icon icon="mdi:information-outline" class="shrink-0 w-6 h-6 text-info" />
						<span>Oups, we can't show you this kind yet (kind {displayNote.kind()})</span>
					</div>
				{/if}
			</div>
		</div>
		{#if footer && !depth}
			<Footer bind:connectionStatus note={displayNote} {visible} {main} />
		{/if}
		<!-- {#if leading}
			<div
				class={(!depth ? 'w-post' : 'w-post-' + (depth + 1)) +
					' border-b border-primary-content absolute right-3 mt-2'}
			/>
		{/if} -->
	{:else if searchState === 'not-found'}
		<!-- Not found state - compact -->
		{#if leading || visibleReplies.length}
			<div class="absolute border-primary-content left-4 h-full border-r-2" />
		{/if}
		{#if hasRoot || tailing}
			<div class="absolute border-primary-content left-4 h-8 border-r-2 -mt-8" />
		{/if}
		<div class="flex items-center gap-2 px-2 py-2" class:ml-10={!depth}>
			<Icon icon="mdi:cloud-off-outline" class="w-4 h-4 opacity-50 shrink-0" />
			<div class="flex-1 min-w-0">
				<span class="text-xs opacity-60 truncate block">Not found</span>
				<span class="text-[10px] opacity-40 truncate block font-mono" title={effectiveNid}
					>{effectiveNid.slice(0, 12)}...</span
				>
			</div>
			<button
				class="btn btn-xs btn-primary gap-1"
				on:click|stopPropagation={retryWithFallbackRelays}
			>
				<Icon icon="mdi:reload" />
				Deep search
			</button>
		</div>
	{:else if searchState === 'unrenderable'}
		<!-- Unrenderable state - compact -->
		{#if leading || visibleReplies.length}
			<div class="absolute border-primary-content left-4 h-full border-r-2" />
		{/if}
		{#if hasRoot || tailing}
			<div class="absolute border-primary-content left-4 h-8 border-r-2 -mt-8" />
		{/if}
		<div class="flex items-center gap-2 px-2 py-2" class:ml-10={!depth}>
			<Icon icon="mdi:alert-circle-outline" class="w-4 h-4 text-warning shrink-0" />
			<span class="text-xs opacity-60 truncate flex-1"
				>Kind {displayNote?.kind?.() || note?.kind?.() || '?'} not supported</span
			>
			<button
				class="btn btn-xs btn-ghost px-1"
				on:click|stopPropagation={() => goto()}
				title="Open in app"
			>
				<Icon icon="mdi:open-in-new" />
			</button>
		</div>
	{:else}
		<!-- Loading state - compact to match not-found -->
		{#if leading || visibleReplies.length}
			<div class="absolute border-primary-content left-4 h-full border-r-2" />
		{/if}
		{#if hasRoot || tailing}
			<div class="absolute border-primary-content left-4 h-8 border-r-2 -mt-8" />
		{/if}
		<div class="flex gap-2 px-2 py-2">
			<div class="w-8 min-w-8">
				<div class="w-8 h-8 shimmer rounded-full shrink-0"></div>
			</div>
			<div class="flex items-center gap-2 flex-1">
				<div class="h-3 shimmer rounded w-20 flex-1 max-w-[100px]"></div>
				<div class="w-16 h-3 shimmer rounded shrink-0"></div>
			</div>
		</div>
	{/if}
</div>

{#each visibleReplies as reply}
	<svelte:self note={reply} {context} {visible} {showReplies} zaps tailing showRoot={false} />
{/each}
