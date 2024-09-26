<script lang="ts">
	import { liveQuery } from 'dexie';
	import { db, notesCache, type Note } from 'src/stores/db';
	import { fetchNote } from 'src/stores/notes';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/header.svelte';
	import { selectedPost } from 'src/stores';

	export let noteId: string;

	$: console.log('note-------', noteId);

	let note: Note | undefined;

	onMount(() => {
		note = $notesCache.get(noteId);
		let abortController = new AbortController();
		fetchNote($pool, noteId, abortController).then((res) => (note = res));

		return () => {
			abortController.abort();
		};
	});

	$: console.log(note);
</script>

{#if note}
	<div class="px-1 py-2 rounded-2xl -ml-10" style="background-color: #cbcccf1a;">
		<div class="px-2">
			<Header {note} />
			<div
				class="flex gap-2"
				on:click={(e) => {
					e.stopPropagation();

					if (note?.reply_to) {
						$selectedPost = $notesCache.get(note.reply_to);
					} else {
						$selectedPost = note;
					}
				}}
			>
				<div class="min-w-8" />
				<div class="-mt-3">
					<Content content={note.content} />
				</div>
			</div>
			<!-- <Content content={note.content} /> -->
		</div>
		<!-- <Footer note={$selectedPost} /> -->
	</div>
{/if}
