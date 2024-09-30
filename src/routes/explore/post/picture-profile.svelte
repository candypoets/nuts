<script lang="ts">
	import { liveQuery } from 'dexie';
	import { type Contact } from 'src/model/contact';
	import { fetchProfile } from 'src/stores/contacts';
	import { contactsCache, db, usersCache } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';

	export let pubkey: string;
	export let className: string;

	// $: user = liveQuery(() => $db.users.get(pubkey));
	// $: contact = liveQuery(() => $db.contacts.get(pubkey));

	let profile: Contact | undefined;
	// $: contact = $contactsCache.get(npub);
	onMount(() => {
		profile = $usersCache.get(pubkey) || $contactsCache.get(pubkey);
		console.log('picture mount', $usersCache.get(pubkey), $contactsCache.get(pubkey));
		let abortController = new AbortController();
		if (!profile?.createdAt) {
			console.log('fetching picture', pubkey);
			fetchProfile($pool, pubkey, abortController).then((res) => {
				profile = res;
			});
		}
		return () => {
			abortController.abort();
		};
	});
	// $: profile = $user || $contact;
</script>

<img
	src={profile?.picture}
	alt={profile?.name}
	class={'border w-6 h-6 rounded-full mx-auto ' + className}
/>
