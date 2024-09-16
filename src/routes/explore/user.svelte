<script lang="ts">
	import { fetchProfile } from 'src/stores/contacts';
	import { usersCache, db, contactsCache } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import { liveQuery } from 'dexie';

	export let npub: string;

	$: user = $usersCache.get(npub) || $contactsCache.get(npub);

	onMount(() => {
		let abortController = new AbortController();
		if (!user?.createdAt) {
			fetchProfile($pool, npub, abortController);
		}
		return () => {
			abortController.abort();
		};
	});

	// $: console.log('user', user, npub, $usersCache);
</script>

<strong class="text-primary">@{user?.name || npub}</strong>
