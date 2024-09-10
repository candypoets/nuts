<script lang="ts">
	import { liveQuery } from 'dexie';
	import { type NostrEvent } from 'nostr-tools';
	import { db } from 'src/stores/db';
	import { fetchNote } from 'src/stores/notes';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import Post from './post.svelte';

	export let noteId: string;

	$: note = liveQuery(() => $db.notes.get(noteId));

	onMount(() => {
		let abortController = new AbortController();
		fetchNote($pool, noteId, abortController);

		return () => {
			abortController.abort();
		};
	});
</script>

<div class="p-4 rounded-2xl my-2" style="background-color: #cbcccf66;">
	{#if $note}
		<Post note={$note} />
	{/if}
</div>
