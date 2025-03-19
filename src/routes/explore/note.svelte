<script lang="ts">
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';
	import { goto } from '$app/navigation';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import type { AnyKind, Kind1Parsed } from 'src/parsers';
	import Zap from './post/zap.svelte';
	import _ from 'lodash';
	import { nostrManager } from 'src/wasm/manager';

	export let noteId: string | undefined = undefined;
	export let context: ParsedEvent<AnyKind>[] = [];
	export let note: ParsedEvent<Kind1Parsed> | undefined = undefined;
	export let zaps: boolean = false;
	export let footer: boolean = true;
	export let visible: boolean = false;
	export let root: boolean = false;

	// is the note leading in a thread
	export let leading: boolean | undefined = undefined;
	// is the note tailing in a thread
	export let tailing: boolean | undefined = undefined;

	let timeout: NodeJS.Timeout | undefined;

	// let randomId = Math.floor(Math.random() * 100) + 1;

	$: {
		if (!note && noteId) {
			// console.log('note events context', noteId, randomId, context);
			note = context.find((event) => event.id === noteId) as ParsedEvent<Kind1Parsed>;
		}
	}

	function handleEvents(events: ParsedEvent<AnyKind>[]) {
		const [event] = events;
		if (!event.parsed) return;
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

	$: console.log('noteId', noteId, visible);
</script>

{#if note?.parsed?.root && !(note.parsed.mentions || []).some((m) => m.id == note?.parsed?.root?.id)}
	<svelte:self noteId={note.parsed.root.id} {context} {visible} zaps leading />
{/if}
<div class="py-2 rounded-2xl relative">
	{#if leading}
		<div class="absolute border-gray-300 left-4 h-full border-r-2" />
	{/if}
	<!-- <span class="text-xs">{noteId || note?.id}</span> -->
	{#if note}
		<!-- <div class="text-xs">{randomId} - {context.length}</div> -->
		{#if zaps}
			<Zap {note} {visible} />
		{/if}
		<Header {note} {context} />
		<div
			class="flex gap-2"
			on:click={(e) => {
				e.stopPropagation();

				goto(`/explore/${note?.parsed?.root?.id ? note?.parsed.root.id : note?.id}`);
			}}
		>
			<div class="min-w-8" />
			<div class="-mt-2">
				<Content parsedContent={note.parsed?.parsedContent || []} {context} {visible} />
			</div>
		</div>
		{#if footer}
			<Footer {note} visible />
		{/if}
	{:else}
		<div class="flex flex-col gap-2 animate-pulse">
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 bg-gray-200 rounded-full"></div>
				<div class="h-4 bg-gray-200 rounded w-24"></div>
			</div>
			<div class="flex gap-2">
				<div class="min-w-8"></div>
				<div class="flex-1 space-y-2">
					<div class="h-4 bg-gray-200 rounded w-3/4"></div>
					<div class="h-4 bg-gray-200 rounded w-1/2"></div>
				</div>
			</div>
		</div>
	{/if}
</div>
