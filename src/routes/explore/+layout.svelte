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

<div
	class="px-4 lg:px-0 lg:w-full w-full m-auto p-2 lg:mt-0 fixed bg-basic z-10"
	id={$page.url.pathname === '/explore' ? 'top' : undefined}
>
	<div class="flex justify-between items-start w-feed lg:m-auto lg:relative">
		<h1 class="text-2xl font-semibold">Explore</h1>
		<div class="flex gap-2 items-center">
			<span class="text font-semibold">{$balance} Sats</span>
			<div on:click={() => (profileOpen = true)} class="cursor-pointer">
				<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
			</div>
		</div>
	</div>
</div>

<slot />

<ProfileModal bind:open={profileOpen} />
<Post bind:open={$posting} />
<Reply />
