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
	import { getContext, onDestroy } from 'svelte';

	import { asConnectionStatus, asKind1, asParsedEvent, fbArray } from '@candypoets/nipworker/utils';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { toRequestObject } from 'src/lib/request';
	import Content from 'src/routes/explore/_post/content.svelte';
	import Footer from 'src/routes/explore/_post/footer.svelte';
	import Header from 'src/routes/explore/_post/header.svelte';
	import Zap from 'src/routes/explore/_post/zap.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import { getUserRelays } from 'src/routes/queries/user';
	import { go } from '../modals/modal';
	import _, { uniqBy } from 'lodash';

	export let main: boolean = false;
	// if the note is a repost, this is the reposter pubkey
	export let repost: string | undefined = undefined;
	export let noteId: string | undefined = undefined;
	export let context: ParsedEvent[] = [];
	export let note: ParsedEvent | undefined = undefined;
	export let zaps: boolean = false;
	export let footer: boolean = true;
	export let visible: boolean = false;
	export let showQuote = true;
	export let showReplies:
		| ((post: ParsedEvent) => (events: ParsedEvent[]) => ParsedEvent[])
		| undefined = undefined;
	// for replies, show the original post above
	export let showRoot: boolean = true;
	export let depth = 0;

	$: kind1 = note && asKind1(note as ParsedEvent);

	$: nid = noteId || note?.id()?.toString();

	$: decoded = {
		noteId: nid,
		replyID: kind1?.reply()?.id()?.toString(),
		mentions: fbArray(kind1 as Kind1Parsed, 'mentions').map((m) => m?.id()?.toString())
	};

	// is the note leading in a thread
	export let leading: boolean | undefined = undefined;
	// is the note tailing in a thread
	export let tailing: boolean | undefined = undefined;

	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;
	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	let replies: ParsedEvent[] = [];

	$: visibleReplies = showReplies && note ? showReplies(note)(replies) : [];

	let timeout: NodeJS.Timeout | undefined;

	let isImageContext = getContext('imageContext');

	export let relays: string[] = [];

	let subscribing = false;

	$: {
		if (!note && noteId && context) {
			note = context.find((event) => event?.id()!.toString() === noteId) as ParsedEvent;
		}
	}

	function handleEvents(message: WorkerMessage) {
		switch (message.type()) {
			case MessageType.ConnectionStatus:
				const status = asConnectionStatus(message);
				connectionStatus[status?.relayUrl()!.toString() as string] = status as ConnectionStatus;
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message) as ParsedEvent;
				context = uniqBy([...context, parsedEvent], (c) => c?.id()?.fnv1aHash());
				// console.log('parsedEvent', parsedEvent?.id()?.toString(), decoded.noteId);
				if (
					parsedEvent?.id()?.toString() !== decoded.noteId &&
					!replies.some((r) => r.id()?.fnv1aHash() === parsedEvent.id()?.fnv1aHash())
				) {
					// console.log('reply', parsedEvent?.id()?.toString(), decoded.noteId, relays);
					replies = [...replies, parsedEvent];
				}
				break;
		}
	}

	let subed = 0;

	function subscribe() {
		timeout = setTimeout(async () => {
			if (visible) {
				if (!sub && nid) {
					subed++;
					sub = useSubscription(
						nid,
						[
							{
								kinds: [1],
								ids: [nid],
								limit: 5,
								relays: relays || [],
								cacheFirst: true
							},
							// fetch some replies
							{ kinds: [1], limit: 10, tags: { '#e': [nid] }, relays: relays || [] },
							...fbArray(note, 'requests').map((r) => toRequestObject(r))
						],
						handleEvents
					);
					if (showRoot && kind1?.reply()) {
						const pubkey = kind1?.reply()?.author()?.toString();
						const id = kind1?.reply()?.id()?.toString();
						if (pubkey && id) {
							getUserRelays(pubkey, (relays) => {
								useSubscription(
									'root_' + nid,
									[{ kinds: [1], ids: [id], limit: 5, relays }],
									handleEvents
								);
							});
						}
					}

					if (showQuote && kind1?.mentionsLength()) {
						const mentions = [];
						for (let i = 0; i < kind1.mentionsLength(); i++) {
							const mention = kind1.mentions(i);
							const pubkey = mention?.author()?.toString();
							const id = mention?.id()?.toString();
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
								relays.forEach((r) => allRelays.add(r));
								fetched++;
								if (fetched === total) {
									useSubscription(
										'quote_' + nid,
										[
											{
												kinds: [1],
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
						note?.pubkey()?.toString() as string,
						(result) => {
							relays = result;
						},
						'read'
					);
				}
			}
		}, 200);
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

	$: visible == true && nid ? subscribe() : unsubscribe();

	$: hasRoot =
		decoded.replyID &&
		!(decoded.mentions || []).some((mId) => mId == decoded.replyID) &&
		!depth &&
		showRoot;

	function goto() {
		if (isImageContext) return;
		const nip19Event = nip19.neventEncode({ id: decoded.noteId || nid || '', relays });
		const eventPath = `nevent:${nip19Event}`;
		go(eventPath);
	}

	onDestroy(unsubscribe);
</script>

{#if hasRoot}
	<svelte:self noteId={decoded.replyID} {context} {visible} zaps leading />
{/if}

<div
	class="py-2 rounded-tl-md border-primary-content relative cursor-pointer bg-base-300 bg-opacity-85 backdrop-blur-gpu mt-1 rounded-lg"
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
		{context.map((c) => c?.id()?.toString())}
	</div>
	<div class="break-words">
		requests
		{fbArray(note, 'requests').map((r) => toRequestObject(r).ids?.[0])}
	</div> -->
	{#if note}
		<!--
		{note.id}
		{JSON.stringify(note.requests)} -->
		{#if zaps && !depth}
			<Zap {note} {visible} />
		{/if}
		{#if leading || visibleReplies.length}
			<div class="absolute border-primary-content left-4 h-full border-r-2" />
		{/if}
		{#if hasRoot || tailing}
			<div class="absolute border-primary-content left-4 h-8 border-r-2 -mt-8" />
		{/if}
		{#if repost}
			<div class="translate-x-1">
				<Avatar pubkey={repost} {context} size="sm" />
			</div>
		{/if}
		<Header {note} {context} {depth} {main}>
			{#if !main}
				<RelaysList {relays} {connectionStatus} mini />
			{/if}
		</Header>
		<!-- {#if main}
			<div class="main">main</div>
		{/if} -->
		<div class="flex gap-2">
			<!-- {#if !depth} -->
			<div class:!min-w-0={!!main} class="min-w-8" class:!min-w-2={!!depth} />
			<!-- {/if} -->
			<div class="-mt-3" class:!mt-0={!!depth || isImageContext} class:!mt-2={!!main}>
				<!-- {kind1?.reply()?.id()?.toString()} -->
				<!-- {!!showReplies && note?.id()?.toString()} -->
				<Content {note} {context} {visible} {depth} {main} {showQuote} />
			</div>
		</div>
		{#if footer && !depth}
			<Footer bind:connectionStatus {note} {visible} {main} />
		{/if}
		<!-- {#if leading}
			<div
				class={(!depth ? 'w-post' : 'w-post-' + (depth + 1)) +
					' border-b border-primary-content absolute right-3 mt-2'}
			/>
		{/if} -->
	{:else}
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 shimmer rounded-full"></div>
				<div class="h-4 shimmer rounded w-24"></div>
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
