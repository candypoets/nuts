<script lang="ts">
	import type { AnyKind, Kind0Parsed } from 'src/parsers';
	import type { ParsedEvent } from 'src/workers/nipworker';

	export let pubkey: string;
	export let link: boolean = true;
	export let context: ParsedEvent<AnyKind>[];

	let user: Kind0Parsed | undefined;

	$: {
		if (!user && pubkey) {
			user = (context || []).find((event) => event.kind === 0 && event.pubkey === pubkey)
				?.parsed as Kind0Parsed | undefined;
		}
	}

	$: console.log(context, pubkey);
</script>

{#if link}
	<strong class="text-violet-700">@{user?.name || pubkey?.slice(0, 15) + '...'}</strong>
{:else}
	<span>{user?.name || pubkey?.slice(0, 15) + '...'}</span>
{/if}
