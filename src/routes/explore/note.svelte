<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { AnyKind, Kind1Parsed, ParsedEvent, SubscribeKind } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import _ from 'lodash';
	import { nip19 } from 'nostr-tools';
	import { getContext, onDestroy } from 'svelte';

	import Content from 'src/routes/explore/_post/content.svelte';
	import Footer from 'src/routes/explore/_post/footer.svelte';
	import Header from 'src/routes/explore/_post/header.svelte';
	import Zap from 'src/routes/explore/_post/zap.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import { getUserRelays } from 'src/routes/queries/user';

	export let main: boolean = false;
	// if the note is a repost, this is the reposter pubkey
	export let repost: string | undefined = undefined;
	export let noteId: string | undefined = undefined;
	export let context: ParsedEvent<AnyKind>[] = [];
	export let note: ParsedEvent<Kind1Parsed> | undefined = undefined;
	export let zaps: boolean = false;
	export let footer: boolean = true;
	export let visible: boolean = false;
	export let showReplies:
		| ((events: ParsedEvent<Kind1Parsed>[]) => ParsedEvent<Kind1Parsed>[])
		| undefined = undefined;
	// for replies, show the original post above
	export let showRoot: boolean = true;
	export let depth = 0;

	// is the note leading in a thread
	export let leading: boolean | undefined = undefined;
	// is the note tailing in a thread
	export let tailing: boolean | undefined = undefined;

	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	let replies: ParsedEvent<Kind1Parsed>[] = [];

	$: visibleReplies = showReplies ? showReplies(replies) : [];

	let timeout: NodeJS.Timeout | undefined;

	let isImageContext = getContext('imageContext');

	let relays: string[] = [];

	let subscribing = false;

	$: {
		if (!note && noteId && context) {
			note = context.find((event) => event.id === noteId) as ParsedEvent<Kind1Parsed>;
		}
	}

	function handleEvents(events: ParsedEvent<AnyKind>[], kind: SubscribeKind) {
		if (kind == 'EOSE') {
			return;
		}
		const [event] = events;
		if (!event?.parsed) return;
		context = _.uniqBy([...context, ...events], 'id');
	}

	function subscribe() {
		timeout = setTimeout(async () => {
			if (note && visible) {
				if (!sub && note.requests) {
					sub = useSubscription(note.id, note.requests, handleEvents);
				}
				if (!relays.length && !relaysub) {
					relaysub = getUserRelays(
						note.pubkey,
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
			relaysub?.();
			relaysub = undefined;
		}
	}

	$: visible == true ? subscribe() : unsubscribe();

	function go() {
		if (isImageContext) return;
		const currentPath = $page.url.pathname;
		const nip19Event = nip19.neventEncode({ id: note?.id || noteId || '', relays });
		const eventPath = `nevent:${nip19Event}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(eventPath)) {
			goto(`${currentPath}/${eventPath}`);
		}
	}

	onDestroy(unsubscribe);
</script>

{#if note?.parsed?.reply && !(note.parsed.mentions || []).some((m) => m.id == note?.parsed?.reply?.id) && !depth && showRoot}
	<svelte:self noteId={note.parsed.reply.id} {context} {visible} zaps leading />
{/if}

<div
	class="py-2 rounded-2xl relative cursor-pointer"
	on:click|stopPropagation={go}
	class:hidden={depth > 3}
>
	{#if note}
		<!-- <div class="break-words">{nip19.neventEncode({ id: note?.id || noteId || '', relays })}</div>
		{note.id} -->
		{#if zaps && !depth}
			<Zap {note} {visible} />
		{/if}
		{#if leading || visibleReplies.length}
			<div class="absolute border-gray-400 border-opacity-50 left-4 h-full border-r-2" />
		{/if}
		{#if repost}
			<div class="translate-x-1">
				<Avatar pubkey={repost} {context} size="sm" />
			</div>
		{/if}
		<Header {note} {context} {depth} {main} />
		<!-- {#if main}
			<div class="main">main</div>
		{/if} -->
		<div class="flex gap-2">
			<!-- {#if !depth} -->
			<div class:!min-w-0={!!main} class="min-w-8" class:!min-w-4={!!depth} />
			<!-- {/if} -->
			<div class="-mt-2" class:!mt-0={!!depth || isImageContext} class:!mt-2={!!main}>
				<Content {note} {context} {visible} {depth} {main} />
			</div>
		</div>
		{#if footer && !depth}
			<Footer bind:replies {note} {visible} {main} />
		{/if}
		{#if leading}
			<div
				class={(!depth ? 'w-post' : 'w-post-' + (depth + 1)) +
					' border-b border-gray-400 border-opacity-50 absolute right-3 mt-2'}
			/>
		{/if}
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
