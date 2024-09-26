<script lang="ts">
	import { fetchProfile } from 'src/stores/contacts';
	import { usersCache, db, contactsCache } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import { type Contact } from 'src/model/contact';

	export let npub: string;
	export let link: boolean = true;

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

{#if link}
	<strong class="text-primary break-all">@{user?.name || npub.slice(0, 15) + '...'}</strong>
{:else}
	<span class="break-all">{user?.name || npub.slice(0, 15) + '...'}</span>
{/if}
