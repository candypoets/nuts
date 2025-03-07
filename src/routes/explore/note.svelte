<script lang="ts">
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';
	import { goto } from '$app/navigation';
	import { getEvent, isInitialized, nostrDb } from 'src/db';
	import type { NIP10Parsed } from 'src/workers/nip10';
	import type { ParsedEvent } from 'src/workers/nipworker';

	export let noteId: string;

	// is the note leading in a thread
	export let leading: boolean | undefined = undefined;
	// is the note tailing in a thread
	export let tailing: boolean | undefined = undefined;

	let note: ParsedEvent<NIP10Parsed> | undefined;

	$: {
		if (!note && noteId && $isInitialized) {
			(async () => {
				note = await getEvent((await nostrDb) as any, noteId);
			})();
		}
	}
</script>

{#if note}
	<div class="py-2 rounded-2xl relative">
		{#if leading}
			<div class="absolute border-gray-300 left-4 h-full border-r-2" />
		{/if}
		<Header {note} />
		<div
			class="flex gap-2"
			on:click={(e) => {
				e.stopPropagation();

				goto(`/explore/${note?.parsed?.root?.id ? note?.parsed.root.id : note?.id}`);
			}}
		>
			<div class="min-w-8" />
			<div class="-mt-2">
				<Content parsedContent={note.parsed?.parsedContent || []} />
			</div>
		</div>
		<!-- <Content content={note.content} /> -->
		<Footer {note} visible />
	</div>
{/if}
