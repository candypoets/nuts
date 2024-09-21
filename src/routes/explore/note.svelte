<script lang="ts">
	import { liveQuery } from 'dexie';
	import { db, notesCache } from 'src/stores/db';
	import { fetchNote } from 'src/stores/notes';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/header.svelte';

	export let noteId: string;

	$: console.log('note-------', noteId);

	$: note = $notesCache.get(noteId);

	onMount(() => {
		let abortController = new AbortController();
		fetchNote($pool, noteId, abortController);

		return () => {
			abortController.abort();
		};
	});

	$: console.log(note);
</script>

{#if note}
	<div class="p-4 rounded-2xl my-2" style="background-color: #cbcccf66;">
		<div class="px-2">
			<Header {note} />
			<Content content={note.content} />
		</div>
		<!-- <Footer note={$selectedPost} /> -->
	</div>
{/if}
