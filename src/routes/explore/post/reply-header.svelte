<script lang="ts">
	import User from 'src/routes/explore/user.svelte';
	import { type Note } from 'src/stores/db';
	import { fetchNote } from 'src/stores/notes';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';

	export let note: Note;

	onMount(() => {
		let abortController = new AbortController();
		if (note?.reply_to) {
			fetchNote($pool, note?.reply_to, abortController);
		}
		return () => {
			abortController.abort();
		};
	});
</script>

{#if note.reply_to_pubkey}
	<div class="text-sm">
		<span class="opacity-50"> Reply to</span>
		<User npub={note?.reply_to_pubkey} />
	</div>
{/if}
