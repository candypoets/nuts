<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { formatDistanceToNow } from 'date-fns';
	import Content from 'src/routes/explore/_post/content.svelte';

	export let message: ParsedEvent;

	export let status = 'sent';
	export let incoming = false;
	export let isFirst = false;
	export let isLast = false;
	export let lastSent = false;
	export let date = false;
</script>

{#if date}
	<div class="flex justify-center my-2">
		<div class="bg-base-300 px-2 py-1 rounded-full">
			<div class="text-xs">
				{formatDistanceToNow(message.createdAt() * 1000, { addSuffix: true })}
			</div>
		</div>
	</div>
{/if}

<div class="chat ml-2 mr-4 pb-0" class:chat-start={incoming} class:chat-end={!incoming}>
	<!-- {#if !last}
		<div class="chat-image avatar">
			<div class="w-10 rounded-full">
				<Avatar pubkey={message.pubkey} {context} />
			</div>
		</div>
	{/if} -->

	<div
		class="px-4 py-2 bg-base-200 text-base-content rounded-2xl bg-gradient-to-br from-base-100 to-base-300 max-w-[85%]"
		class:!from-blue-400={!incoming}
		class:!to-blue-300={!incoming}
		class:overflow-hidden={!isLast}
		class:!rounded-l-md={!isFirst && incoming}
		class:!rounded-r-md={!isFirst && !incoming}
		class:!rounded-br-none={isLast && !incoming}
		class:!rounded-bl-none={isLast && incoming}
		class:!rounded-br-md={isFirst && !incoming}
		class:!rounded-bl-md={isFirst && incoming}
	>
		<Content note={message} class="!w-auto" />
	</div>
	{#if !incoming && lastSent}
		<div class="chat-footer opacity-50">{status || status}</div>
	{/if}
</div>
