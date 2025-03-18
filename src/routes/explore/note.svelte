<script lang="ts">
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';
	import { goto } from '$app/navigation';
	import { getEvent, nostrDb } from 'src/db';
	import type { NIP10Parsed } from 'src/workers/nip10';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import type { AnyKind, Kind1Parsed } from 'src/parsers';
	import Zap from './post/zap.svelte';

	export let noteId: string | undefined = undefined;
	export let context: ParsedEvent<AnyKind>[] = [];
	export let note: ParsedEvent<Kind1Parsed> | undefined = undefined;
	export let zaps: boolean = false;
	export let footer: boolean = true;
	export let visible: boolean = false;

	// is the note leading in a thread
	export let leading: boolean | undefined = undefined;
	// is the note tailing in a thread
	export let tailing: boolean | undefined = undefined;

	$: {
		if (!note && noteId) {
			note = (context || []).find((event) => event.id === noteId) as ParsedEvent<Kind1Parsed>;
			// (async () => {
			// note = await getEvent((await nostrDb) as any, noteId);
			// })();
		}
	}
</script>

{#if note}
	<div class="py-2 rounded-2xl relative">
		{#if leading}
			<div class="absolute border-gray-300 left-4 h-full border-r-2" />
		{/if}
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
				<Content parsedContent={note.parsed?.parsedContent || []} {context} />
			</div>
		</div>
		{#if footer}
			<Footer {note} visible />
		{/if}
	</div>
{/if}
