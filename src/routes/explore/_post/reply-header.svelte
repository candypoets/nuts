<script lang="ts">
	import User from 'src/routes/explore/user.svelte';
	import type { NIP10Parsed } from 'src/workers/nip10';
	import type { ParsedEvent } from 'src/workers/nipworker';

	export let note: ParsedEvent<NIP10Parsed>;
</script>

{#if note?.parsed?.root?.author}
	<div class="text-sm">
		<span class="opacity-50"> Reply to</span>
		<User npub={note?.parsed?.root?.author} />
	</div>
{/if}
