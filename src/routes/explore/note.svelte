<script lang="ts">
	import _ from 'lodash';
	import { getContext, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import { useSubscription, type SubscribeKind } from 'src/model/nostr-main';
	import type { AnyKind, Kind1Parsed } from 'src/types';
	import { type ParsedEvent } from 'src/types';
	import Content from 'src/routes/explore/_post/content.svelte';
	import Footer from 'src/routes/explore/_post/footer.svelte';
	import Header from 'src/routes/explore/_post/header.svelte';
	import Zap from 'src/routes/explore/_post/zap.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import { nip19 } from 'nostr-tools';

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

	let sub: () => void;

	let replies: ParsedEvent<Kind1Parsed>[] = [];

	$: visibleReplies = showReplies ? showReplies(replies) : [];

	let timeout: NodeJS.Timeout | undefined;

	let isImageContext = getContext('imageContext');

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
			if (note && note.requests && visible) {
				sub = useSubscription(note.id, note.requests, handleEvents);
			}
		}, 200);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			sub?.();
		}
	}

	$: visible == true ? subscribe() : unsubscribe();

	// $: note && useSharedSubscription("u_" + note.pubkey, [])

	function go() {
		if (isImageContext) return;
		const currentPath = $page.url.pathname;
		// const nip10Event = nip19.neventEncode({id: note?.id || noteId || "", relays: })
		const eventPath = `nevent:${note?.id || noteId}`;

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
		<Header {note} {context} {depth} />
		<div class="flex gap-2">
			<!-- {#if !depth} -->
			<div class="min-w-8" class:!min-w-4={!!depth} />
			<!-- {/if} -->
			<div class="-mt-2" class:!mt-0={!!depth || isImageContext}>
				<Content {note} {context} {visible} {depth} />
			</div>
		</div>
		{#if footer && !depth}
			<Footer bind:replies {note} {visible} />
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
	<svelte:self note={reply} {context} {visible} zaps tailing showRoot={false} />
{/each}
