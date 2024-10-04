<script lang="ts">
	import Icon from '@iconify/svelte';
	import { liveQuery } from 'dexie';
	import { type NostrEvent } from 'nostr-tools';
	import { selectedPost } from 'src/stores';
	import { fetchProfile } from 'src/stores/contacts';
	import { contacts, contactsCache, db, key, usersCache, type Note } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import User from 'src/routes/explore/user.svelte';
	import { fetchNote } from 'src/stores/notes';
	import { signAndSend } from 'src/actions/relay';
	import { signer } from 'src/stores/signer';

	export let note: Note;

	export let oneline: boolean = true;

	let profile: Contact;

	// let user = liveQuery(() => $db.users.get(note?.pubkey));
	// let contact = liveQuery(() => $db.contacts.get(note?.pubkey));
	// $: contact = $contactsCache.get(npub);
	onMount(() => {
		profile = $usersCache.get(note.pubkey) || $contactsCache.get(note.pubkey);
		let abortController = new AbortController();
		if (!profile?.createdAt) {
			fetchProfile($pool, note?.pubkey, abortController).then((r) => (profile = r));
		}

		return () => {
			abortController.abort();
		};
	});
	// $: profile = $user || $contact;
	// $: console.log('user', user, note.pubkey, $usersCache);
</script>

<div class="flex gap-2">
	<div class="w-8 min-w-8">
		<img
			src={profile?.picture || '/ns-naked.svg'}
			alt={profile?.name}
			class="border w-8 h-8 rounded-full space-x-4 mx-auto"
		/>
	</div>
	<!-- <div>unknown</div> -->
	<div class="w-full">
		<div class="flex items-start" class:items-center={oneline}>
			{#if oneline}
				<div class="whitespace-nowrap overflow-hidden text-ellipsis font-semibold">
					{profile?.name}
				</div>
				{#if profile?.nip05}
					<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
					<p class="text-xs opacity-50">{profile?.nip05}</p>
				{/if}
			{:else}
				<div class="flex-grow">
					<div class="flex items-center">
						<div class="whitespace-nowrap overflow-hidden text-ellipsis">{profile?.name}</div>
						<Icon icon="bitcoin-icons:verify-filled" class="inline text-lg text-primary" />
						<p class="text-xs opacity-50 ml-2">
							{#if Date.now() / 1000 - note?.created_at < 60}
								{Math.floor(Date.now() / 1000 - note?.created_at)}s
							{:else if Date.now() / 1000 - note?.created_at < 3600}
								{Math.floor((Date.now() / 1000 - note?.created_at) / 60)}m
							{:else if Date.now() / 1000 - note?.created_at < 86400}
								{Math.floor((Date.now() / 1000 - note?.created_at) / 3600)}h
							{:else}
								{Math.floor((Date.now() / 1000 - note?.created_at) / 86400)}d
							{/if}
						</p>
					</div>
					{#if profile?.nip05}
						<p class="text-xs opacity-50">{profile?.nip05}</p>
					{/if}
				</div>
			{/if}
			{#if oneline}
				<p class="text-xs opacity-50 ml-2">
					{#if Date.now() / 1000 - note?.created_at < 60}
						{Math.floor(Date.now() / 1000 - note?.created_at)}s
					{:else if Date.now() / 1000 - note?.created_at < 3600}
						{Math.floor((Date.now() / 1000 - note?.created_at) / 60)}m
					{:else if Date.now() / 1000 - note?.created_at < 86400}
						{Math.floor((Date.now() / 1000 - note?.created_at) / 3600)}h
					{:else}
						{Math.floor((Date.now() / 1000 - note?.created_at) / 86400)}d
					{/if}
				</p>
			{/if}
			{#if !oneline}
				<div class="flex-grow text-right w-full pr-4">
					<button
						class="btn btn-primary btn-xs"
						disabled={!!$contactsCache.get(note.pubkey)}
						class:disabled={!!$contactsCache.get(note.pubkey)}
						on:click={async () => {
							console.log('add friend');
							if (!profile) return;
							await contactsCache.add({
								...profile,
								pubkey: note.pubkey,
								createdAt: Math.floor(Date.now() / 1000)
							});
							await signAndSend($signer, {
								kind: 3,
								pubkey: $key?.pub,
								created_at: Math.floor(Date.now() / 1000),
								// tags: [['p', pubkey]],
								tags: $contacts.map((c) => ['p', c.pubkey]),
								content: ''
							});
						}}
					>
						{!$contactsCache.get(note.pubkey) ? 'Follow' : 'Unfollow'}
					</button>
				</div>
			{/if}
		</div>
		<!-- {:catch}
     <div>unknown</div> -->
	</div>
</div>
