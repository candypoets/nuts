<script lang="ts">
	import Icon from '@iconify/svelte';
	import { type NostrEvent } from 'nostr-tools';
	import { selectedPost } from 'src/stores';
	import { fetchProfile } from 'src/stores/contacts';
	import { contactsCache, usersCache } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';

	export let note: NostrEvent;

	$: user = $usersCache.get(note.pubkey) || $contactsCache.get(note.pubkey);
	// $: contact = $contactsCache.get(npub);
	onMount(() => {
		let abortController = new AbortController();
		if (!$usersCache.get(note.pubkey) && !$contactsCache.get(note.pubkey)) {
			fetchProfile($pool, note.pubkey, abortController);
		}
		return () => {
			abortController.abort();
		};
	});

	// $: console.log('user', user, note.pubkey, $usersCache);
</script>

<div class="flex gap-2 mt-2">
	<div class="w-8 min-w-8">
		<img
			src={user?.picture || '/ns-naked.svg'}
			alt={user?.name}
			class="border w-8 h-8 rounded-full space-x-4 mx-auto"
		/>
	</div>
	<!-- <div>unknown</div> -->
	<div class="flex-grow">
		<div class="flex items-center">
			{user?.name}
			{#if user?.nip05}
				<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
				<p class="text-xs opacity-50">{user?.nip05}</p>
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
