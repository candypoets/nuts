<script lang="ts">
	import Content from 'src/routes/explore/_post/content.svelte';
	import type { AnyKind, Kind4Parsed } from 'src/types';
	import type { ParsedEvent } from 'src/types';
	import User from '../explore/user.svelte';
	import { formatDistanceToNow } from 'date-fns';
	import Avatar from '../explore/avatar.svelte';

	export let message: ParsedEvent<Kind4Parsed>;
	export let context: ParsedEvent<AnyKind>[] = [];
	export let status = 'sent';
</script>

<div
	class="chat ml-2 mr-4 pb-0"
	class:chat-start={message.incoming}
	class:chat-end={!message.incoming}
>
	<!-- {#if !last}
		<div class="chat-image avatar">
			<div class="w-10 rounded-full">
				<Avatar pubkey={message.pubkey} {context} />
			</div>
		</div>
	{/if} -->
	{#if message.isFirst}
		<div class="chat-header">
			<time class="text-xs opacity-50"
				>{formatDistanceToNow(message.created_at * 1000, { addSuffix: true })}</time
			>
		</div>
	{/if}
	<div
		class="chat-bubble chat-bubble-primary bg-base-300 text-base-content rounded-2xl"
		class:overflow-hidden={!message.isLast}
		class:!rounded-l-md={!message.isFirst && message.incoming}
		class:!rounded-r-md={!message.isFirst && !message.incoming}
		class:!rounded-br-none={message.isLast && !message.incoming}
		class:!rounded-bl-none={message.isLast && message.incoming}
		class:!rounded-br-md={message.isFirst && !message.incoming}
		class:!rounded-bl-md={message.isFirst && message.incoming}
	>
		<Content note={message} class="!w-auto" />
	</div>
	{#if !message.incoming && message.isLast}
		<div class="chat-footer opacity-50">{message.status || status}</div>
	{/if}
</div>
