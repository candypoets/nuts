<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { timestamp1 } from 'src/controller';
	import Content from 'src/routes/explore/_post/content.svelte';

	export let message: ParsedEvent;

	export let sent: number | undefined;
	export let incoming = false;
	export let isFirst = false;
	export let isLast = false;
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

<div
	class="mx-2 mr-0 pb-0 w-full flex chat"
	class:justify-start={incoming}
	class:justify-end={!incoming}
>
	<!-- {#if !last}
		<div class="chat-image avatar">
			<div class="w-10 rounded-full">
				<Avatar pubkey={message.pubkey} {context} />
			</div>
		</div>
	{/if} -->

	<div
		class="px-4 py-2 bg-base-200 text-base-content rounded-2xl bg-gradient-to-br from-base-300 to-base-100 max-w-[80%] relative"
		class:mr-4={!incoming}
		class:!from-sky-600={!incoming}
		class:!to-sky-500={!incoming}
		class:overflow-hidden={!isLast}
		class:!rounded-l-md={!isFirst && incoming}
		class:!rounded-r-md={!isFirst && !incoming}
		class:!rounded-br-none={isLast && !incoming}
		class:!rounded-bl-none={isLast && incoming}
		class:!rounded-br-md={isFirst && !incoming}
		class:!rounded-bl-md={isFirst && incoming}
	>
		<Content note={message} class="!w-auto" visible={true} showMedia={false} />
		{#if !incoming && sent != undefined}
			<div class="chat-footer absolute bottom-1 -left-5">
				{#if sent === 0}
					{#if isLast}
						<Icon icon="lets-icons:check-fill" class="w-4 h-4" />
					{/if}
				{:else if $timestamp1 - sent > 5000}
					<Icon icon="heroicons:x-mark" class="w-4 h-4 text-red-500" />
				{:else}
					<Icon icon="heroicons:clock" class="w-4 h-4 text-primary-content" />
				{/if}
			</div>
		{/if}
	</div>
</div>
