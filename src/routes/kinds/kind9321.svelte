<script lang="ts">
	import type { AnyKind, Kind9321Parsed } from 'src/parsers';
	import { key } from 'src/stores/db';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import Avatar from '../explore/avatar.svelte';
	import User from '../explore/user.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	export let zap: ParsedEvent<Kind9321Parsed>;
	export let context: ParsedEvent<AnyKind>[];

	function go() {
		const currentPath = $page.url.pathname;
		const eventPath = `nevent:${zap?.parsed?.eventId}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(eventPath)) {
			goto(`${currentPath}/${eventPath}`);
		}
	}
</script>

<div class="bg-base-200 p-4 rounded-lg my-2" on:click|stopPropagation={go}>
	<div class="flex items-center justify-between gap-2">
		{#if zap.pubkey === $key?.pub}
			<div class="flex items-center gap-2">
				<Avatar pubkey={zap?.parsed?.recipient} {context} size="lg" />
				<span class="font-medium"
					>You zapped
					<User pubkey={zap?.parsed?.recipient} {context} />
				</span>
			</div>
			<!-- <Icon icon="ph:arrow-right" /> -->
			<span class="text-primary font-bold">{zap?.parsed?.amount} sats</span>
		{:else}
			<div class="flex items-center gap-2">
				<Avatar pubkey={zap?.pubkey} {context} size="lg" />
				<span class="font-medium">
					<span class="font-bold"><User pubkey={zap?.pubkey} {context} /></span>
					<span class="font-bold">zapped you</span>
				</span>
			</div>
			<!-- <Icon icon="ph:arrow-right" /> -->
			<span class="text-primary font-bold">{zap?.parsed?.amount} sats</span>
		{/if}
	</div>
	{#if zap.content}
		<div class="mt-2 text-sm text-gray-600 ml-12">
			"{zap.content}"
		</div>
	{/if}
</div>
