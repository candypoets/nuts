<script lang="ts">
	import { type Contact } from 'src/model/contact';
	import { fetchProfile } from 'src/stores/contacts';
	import { contactsCache, db, usersCache } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';

	export let pubkey: string;
	export let className: string;

	let profile: Contact | undefined;
	onMount(() => {
		profile = $usersCache.get(pubkey) || $contactsCache.get(pubkey);
		let abortController = new AbortController();
		if (!profile?.createdAt) {
			fetchProfile($pool, pubkey, abortController).then((res) => {
				profile = res;
			});
		}
		return () => {
			abortController.abort();
		};
	});
</script>

<img
	src={profile?.picture}
	alt={profile?.name}
	class={'border w-6 h-6 rounded-full mx-auto ' + className}
/>
