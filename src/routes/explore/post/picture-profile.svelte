<script lang="ts">
	import { liveQuery } from 'dexie';
	import { fetchProfile } from 'src/stores/contacts';
	import { contactsCache, db, usersCache } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';

	export let pubkey: string;

	$: user = liveQuery(() => $db.users.get(pubkey));
	$: contact = liveQuery(() => $db.contacts.get(pubkey));
	// $: contact = $contactsCache.get(npub);
	onMount(() => {
		console.log('picture mount', $usersCache.get(pubkey), $contactsCache.get(pubkey));
		let abortController = new AbortController();
		if (!$usersCache.get(pubkey)?.createdAt && !$contactsCache.get(pubkey)?.createdAt) {
			console.log('fetching picture', pubkey);
			fetchProfile($pool, pubkey, abortController);
		}
		return () => {
			abortController.abort();
		};
	});
	$: profile = $user || $contact;
</script>

<img
	src={profile?.picture || '/ns-naked.svg'}
	alt={profile?.name}
	class="border w-6 h-6 rounded-full mx-auto"
/>
