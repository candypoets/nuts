<script lang="ts">
	import Icon from '@iconify/svelte';
	import { updateVc } from 'src/lib';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import { notesSub, reactionSub, zapSub } from 'src/stores/notes';
	import { profile } from 'src/stores/profile';
	import { balance } from 'src/stores/wallet';
	import { onMount } from 'svelte';

	let profileOpen: boolean = false;

	onMount(() => {
		updateVc();
		const notes = notesSub.subscribe((n) => n);
		// const reactions = reactionSub.subscribe((r) => r);
		// const zaps = zapSub.subscribe((z) => z);
		return () => {
			notes();
			// reactions();
			// zaps();
		};
	});
</script>

<div
	class="px-4 lg:px-0 lg:w-1/3 w-full m-auto p-2 lg:mt-40 lg:relative fixed bg-basic z-10"
	id="top"
>
	<div class="flex justify-between items-start">
		<h1 class="text-2xl font-semibold">Explore</h1>
		<div class="flex gap-2 items-center">
			<!-- <div on:click={() => console.log('ohoh')}><Icon icon="ph:eye" class="text-2xl" /></div> -->
			<div on:click={() => (profileOpen = true)} class="cursor-pointer">
				<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
			</div>
		</div>
	</div>
	<span class="text-sm font-semibold">{$balance} Sats</span>
</div>
<div
	class="lg:h-auto lg:pt-0 overflow-scroll scrollbar-hide container-height-200 lg:w-1/3 m-auto !pt-16"
	id="container"
>
	<slot />
</div>

<ProfileModal bind:open={profileOpen} />
