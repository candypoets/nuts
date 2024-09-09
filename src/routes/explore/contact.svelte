<script lang="ts">
	import Icon from '@iconify/svelte';
	import { type NostrEvent } from 'nostr-tools';
	import { type Contact } from 'src/model/contact';

	export let note: NostrEvent;
	export let author: Contact;
</script>

<div class="flex gap-2 mt-2">
	<div class="w-8 min-w-8">
		<img
			src={author?.picture || '/ns-naked.svg'}
			alt={author?.name}
			class="border w-8 h-8 rounded-full space-x-4 mx-auto"
		/>
	</div>
	<!-- <div>unknown</div> -->
	<div class="flex-grow">
		<div class="flex items-center">
			{author.name}
			{#if author.nip05}
				<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
				<p class="text-xs opacity-50">{author.nip05}</p>
			{/if}
			<p class="text-xs opacity-50 ml-2">
				{#if Date.now() / 1000 - note.created_at < 60}
					{Math.floor(Date.now() / 1000 - note.created_at)}s
				{:else if Date.now() / 1000 - note.created_at < 3600}
					{Math.floor((Date.now() / 1000 - note.created_at) / 60)}m
				{:else if Date.now() / 1000 - note.created_at < 86400}
					{Math.floor((Date.now() / 1000 - note.created_at) / 3600)}h
				{:else}
					{Math.floor((Date.now() / 1000 - note.created_at) / 86400)}d
				{/if}
			</p>
		</div>
		<!-- {:catch}
     <div>unknown</div> -->
	</div>
</div>
