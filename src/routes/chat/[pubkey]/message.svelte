<script lang="ts">
	import Content from 'src/routes/explore/post/content.svelte';
	import { type NostrEvent } from 'nostr-tools';

	export let message: string | NostrEvent;
</script>

{#if typeof message === 'string'}
	<div class="text-center my-2">
		<strong>{message}</strong>
	</div>
{:else if message?.incoming}
	<div class="text-left">
		<div
			class="max-w-11-12 break-words inline-block p-4 bg-base-200 my-1 rounded-t-2xl rounded-br-2xl rounded-bl-md"
		>
			<Content content={message.content} />
			<!-- {m.content} -->
		</div>
	</div>
{:else}
	<div class="text-right">
		<div
			class="break-words max-w-11-12 inline-block p-4 my-1 rounded-t-2xl rounded-bl-2xl rounded-br-md bg-info text-left"
		>
			<Content content={message.content} />
		</div>
	</div>
{/if}

<style>
	.max-w-11-12 {
		max-width: 92%;
	}
</style>
