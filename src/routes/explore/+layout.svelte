<script lang="ts">
	import { updateVc } from 'src/lib';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import { posting } from 'src/stores';
	import { balance } from 'src/stores/wallet';
	import { getContext, onMount } from 'svelte';
	import Post from './post.svelte';
	import Reply from './reply.svelte';

	import type { Kind0Parsed } from 'src/parsers';
	import type { Writable } from 'svelte/store';
	import { page } from '$app/stores';

	let profileOpen: boolean = false;

	let profile: Writable<Kind0Parsed | null> = getContext('profile');

	onMount(() => {
		updateVc();
		return () => {};
	});
</script>

<slot />

<!-- <ProfileModal bind:open={profileOpen} /> -->
<Post bind:open={$posting} />
<Reply />
