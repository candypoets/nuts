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
	import { getContext, onDestroy, onMount, setContext } from 'svelte';

	import {
		asConnectionStatus,
		asKind1,
		asKind6,
		asParsedEvent,
		ConnectionTracker,
		fbArray
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { isEqual, uniqBy } from 'lodash';
	import { normalizeURL } from 'nostr-tools/utils';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { isMobile } from 'src/controller';
	import { relaySub, setSubRelays } from 'src/controller/relay';
	import { toRequestObject } from 'src/lib/request';
	import {
		calculateNoteHeight,
		estimateNoteHeight,
		getContentWidth,
		getNoteCompositeId,
		LAYOUT
	} from 'src/lib/heightCalculator';
	import Content from 'src/routes/explore/_post/content.svelte';
	import Footer from 'src/routes/explore/_post/footer.svelte';
	import Header from 'src/routes/explore/_post/header.svelte';
	import Kind30023Content from 'src/routes/explore/_post/kind30023Content.svelte';
	import Kind30311Content from 'src/routes/explore/_post/kind30311Content.svelte';
	import Zap from 'src/routes/explore/_post/zap.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import { getUserRelays } from 'src/routes/queries/user';
	import { go } from '../modals/modal';
	import { dimensions } from 'src/controller';

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

	// Get parent context - always exists (Feed provides global, parents provide theirs)
	const parentContext = getContext<{
		register: (id: string, calc: () => number) => void;
		getHeight: (id: string) => number;
	}>('noteHeights');

	// Create our own context for children (quoted notes, ancestors, replies)
	const childCalculators = new Map<string, () => number>();
	const childContext = {
		register: (id: string, calc: () => number) => {
			childCalculators.set(id, calc);
		},
		getHeight: (id: string): number => {
			const calc = childCalculators.get(id);
			if (calc) {
				try {
					return calc();
				} catch (e) {
					console.error('Height calculation failed for', id, e);
					return LAYOUT.skeletonHeight;
				}
			}
			return LAYOUT.skeletonHeight;
		}
	};

	// Override context for our children
	setContext('noteHeights', childContext);

	// Repost handling variables
	let kind6: ReturnType<typeof asKind6> | undefined;
	let isRepost = false;
	let displayNote: ParsedEvent | undefined | null;
	let reposterPubkey: string | undefined;
	let effectiveShowRoot = showRoot;
	let kind1: ReturnType<typeof asKind1> | undefined;

	// Check if this is a repost (kind 6) and extract the reposted event
	// Grouped in a single reactive statement to avoid false positive cycle detection
	$: {
		kind6 = note && asKind6(note as ParsedEvent);
		isRepost = !!kind6 && typeof kind6?.repostedEvent === 'function';
		displayNote = isRepost ? kind6?.repostedEvent?.() : note;
		reposterPubkey = isRepost ? note?.pubkey()! : undefined;
		effectiveShowRoot = isRepost ? false : showRoot;
		kind1 = displayNote && asKind1(displayNote as ParsedEvent);
	}

	// Decode naddr when provided
	$: naddrDecoded = (() => {
		if (!naddr) return null;
		try {
			const result = nip19.decode(naddr);
			if (result.type === 'naddr') {
				return result.data as AddressPointer;
			}
		} catch (e) {
			console.error('Failed to decode naddr:', e);
		}
		return null;
	})();

	$: nid = noteId || note?.id()!;

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
				connectionStatus[normalizeURL(status?.relayUrl()! as string)] = status as ConnectionStatus;
				break;
			case MessageType.ParsedNostrEvent:
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
					if (!sub && (nid || naddrDecoded)) {
						subed++;

						// Build the main request based on whether it's naddr or regular note
						// Skip loading note by ID if we already have it (naddr always needs loading)
						const mainRequest = naddrDecoded
							? {
									// Naddr: query by kind + author + d-tag
									// kinds: [naddrDecoded.kind],
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
			sub?.();
			sub = undefined;
			subed--;
			relaysub?.();
			relaysub = undefined;
		}
	}

	$: visible == true && (nid || naddrDecoded) ? subscribe() : unsubscribe();

	$: hasRoot =
		decoded.replyID &&
		!(decoded.mentions || []).some((mId) => mId == decoded.replyID) &&
		!depth &&
		effectiveShowRoot;

	function goto() {
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

	// Height calculation function - registered with context on mount
	// Recomputes displayNote inside to avoid closure capture issues
	function calculateHeight(): number {
		if (displayNote) {
			const contentWidth = getContentWidth($dimensions?.width || 600, depth);

			// Calculate self height (content blocks including quoted notes)
			const result = calculateNoteHeight(
				displayNote,
				contentWidth,
				// Get quote heights from our child context (quoted notes register here)
				(id) => childContext.getHeight(id),
				depth
			);

			let totalHeight = result.totalHeight;

			// Add ancestor height if present (registered in our child context)
			if (hasRoot && decoded.replyID) {
				totalHeight += childContext.getHeight(decoded.replyID);
			}

			// Add replies heights if present (registered in our child context)
			for (const reply of visibleReplies) {
				totalHeight += childContext.getHeight(reply.id()!);
			}

			return totalHeight;
		}
		// Skeleton/loading state uses fixed height - matches the shimmer UI structure
		return LAYOUT.skeletonHeight;
	}

	// Register height calculator on mount
	// calculateHeight uses getDisplayNote() to get current value, avoiding closure issues
	onMount(() => {
		if (noteId || note) {
			parentContext.register(noteId || note.id(), calculateHeight);
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
			<Zap note={displayNote} {visible} />
		{/if}
		{#if leading || visibleReplies.length}
			<div class="absolute border-primary-content left-4 h-full border-r-2" />
		{/if}
		{#if hasRoot || tailing}
			<div class="absolute border-primary-content left-4 h-8 border-r-2 -mt-8" />
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
			<!-- {#if !depth} -->
			<div class:!min-w-0={!!main || !!depth} class="min-w-8" />
			<!-- {/if} -->
			<div
				class="-mt-3 pr-2 flex-grow"
				class:!mt-0={!!depth || isImageContext}
				class:!mt-2={!!main}
			>
				{#if note?.kind() === 30023}
					<Kind30023Content note={displayNote} />
				{:else if note?.kind() === 30311}
					<Kind30311Content note={displayNote} />
				{:else if !!displayNote.parsed}
					<!-- {kind1?.reply()?.id()!} -->
					<!-- {!!showReplies && note?.id()!} -->
					<Content note={displayNote} {context} {visible} {depth} {main} {showQuote} />
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
	{:else}
		<div class="flex flex-col gap-2">
			<div class="flex items-start justify-between gap-2">
				<div class="flex gap-2 items-center">
					<div class="w-8 h-8 shimmer rounded-full"></div>
					<div class="h-4 shimmer rounded w-24"></div>
				</div>
				<RelaysList subId={nid} {relays} {connectionStatus} mini />
			</div>
			{#if leading}
				<div class="absolute border-gray-300 left-4 h-full border-r-2" />
			{/if}
			<div class="flex gap-2 w-full">
				<div class="min-w-8"></div>
				<div class="flex-1 space-y-2">
					<div class="h-4 shimmer rounded w-3/4"></div>
					<div class="h-4 shimmer rounded w-1/2"></div>
				</div>
			</div>
		</div>
	{/if}
</div>

{#each visibleReplies as reply}
	<svelte:self note={reply} {context} {visible} {showReplies} zaps tailing showRoot={false} />
{/each}
