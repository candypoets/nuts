<script lang="ts">
	import { type Contact } from 'src/model/contact';
	import { onMount } from 'svelte';

	export let pubkey: string;
	export let className: string = undefined;

	let profile: Contact | undefined;
	onMount(async () => {
		// const result = await getProfile(await nostrDb, pubkey);
		// profile = JSON.parse(result?.content || '{}');
	});
</script>

<img
	src={profile?.picture}
	alt={profile?.name}
	class={'border w-6 h-6 rounded-full mx-auto ' + className}
/>
