<script lang="ts">
	import { cachedProfile, isInitialized } from 'src/db';
	import type { NostrProfile } from 'src/workers/nip01';

	export let npub: string;
	export let link: boolean = true;

	let user: NostrProfile | undefined;

	$: {
		if (!user && npub && $isInitialized) {
			user = JSON.parse(cachedProfile(npub)?.content || '{}');
		}
	}
</script>

{#if link}
	<strong class="text-primary break-all">@{user?.name || npub?.slice(0, 15) + '...'}</strong>
{:else}
	<span class="break-all">{user?.name || npub?.slice(0, 15) + '...'}</span>
{/if}
