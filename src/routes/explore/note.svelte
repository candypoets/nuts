<script lang="ts">
	import Header from './_post/header.svelte';
	import Content from './_post/content.svelte';
	import Footer from './_post/footer.svelte';
	import { goto } from '$app/navigation';
	import type { ParsedEvent } from 'src/types';
	import type { AnyKind, Kind1Parsed } from 'src/types';
	import Zap from './_post/zap.svelte';
	import _ from 'lodash';
	import { nostrManager } from 'src/model/nostr';
	import { page } from '$app/stores';

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

	let replies: ParsedEvent<Kind1Parsed>[] = [];

	$: visibleReplies = showReplies ? showReplies(replies) : [];

	let timeout: NodeJS.Timeout | undefined;

	// let randomId = Math.floor(Math.random() * 100) + 1;

	$: {
		if (!note && noteId) {
			note = context.find((event) => event.id === noteId) as ParsedEvent<Kind1Parsed>;
		}
	}

	function handleEvents(events: ParsedEvent<AnyKind>[]) {
		const [event] = events;
		if (!event?.parsed) return;
		// console.log('note events', note?.id, randomId, events, context);
		context = _.uniqBy([...context, ...events], 'id');
	}

	function subscribe() {
		timeout = setTimeout(async () => {
			if (note && note.requests && visible) {
				// console.log('note requests', note.id || noteId, randomId, note.requests);
				nostrManager.subscribe(note.id, note.requests, handleEvents);
			}
		}, 200);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			note && nostrManager.unsubscribe(note.id);
		}
	}

	$: visible && note ? subscribe() : unsubscribe();

	function go() {
		const currentPath = $page.url.pathname;
		const eventPath = `nevent:${note?.id}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(eventPath)) {
			goto(`${currentPath}/${eventPath}`);
		}
	}
</script>

{#if note?.parsed?.reply && !(note.parsed.mentions || []).some((m) => m.id == note?.parsed?.reply?.id) && !depth && showRoot}
	<svelte:self noteId={note.parsed.reply.id} {context} {visible} zaps leading />
{/if}
<div class="py-2 rounded-2xl relative cursor-pointer" on:click|stopPropagation={go}>
	{#if note}
		{#if zaps && !depth}
			<Zap {note} {visible} />
		{/if}
		{#if leading || visibleReplies.length}
			<div class="absolute border-gray-300 left-4 h-full border-r-2" />
		{/if}
		<Header {note} {context} {depth} />
		<div class="flex gap-2">
			<!-- {#if !depth} -->
			<div class="min-w-8" class:!min-w-4={!!depth} />
			<!-- {/if} -->
			<div class="-mt-2" class:!mt-0={!!depth}>
				<Content parsedContent={note.parsed?.parsedContent || []} {context} {visible} {depth} />
			</div>
		</div>
		{#if footer && !depth}
			<Footer bind:replies {note} {visible} />
		{/if}
		{#if leading}
			<div
				class={(!depth ? 'w-post' : 'w-post-' + (depth + 1)) +
					' border-b border-gray-200 absolute right-0 mt-2'}
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
