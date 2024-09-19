<script lang="ts">
	import User from 'src/routes/explore/user.svelte';
	import { type Note } from 'src/stores/db';

	export let note: Note;
</script>

{#if !!note.reposted_by}
	<div class="text-sm">
		<User npub={note?.reposted_by} /> <span class="opacity-50">Reposted</span>
	</div>
{/if}
