<script lang="ts">
	import { fetchProfile } from 'src/stores/contacts';
	import { usersCache, db, contactsCache } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import { liveQuery } from 'dexie';
	import { type Contact } from 'src/model/contact';

	export let npub: string;

	let user: Contact | undefined;

	onMount(() => {
		let abortController = new AbortController();
		user = $usersCache.get(npub) || $contactsCache.get(npub);
		if (!user?.createdAt) {
			fetchProfile($pool, npub, abortController).then((res) => (user = res));
		}
		return () => {
			abortController.abort();
		};
	});

	// $: console.log('user', user, npub, $usersCache);
</script>

<strong class="text-primary">@{user?.name || npub}</strong>
