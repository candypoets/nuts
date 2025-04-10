<script lang="ts">
	import Icon from '@iconify/svelte';
	import QrScanner from 'src/comp/QRScanner.svelte';

	import { onMount } from 'svelte';
	import { mints } from '../../stores/mints';

	import Transactions from './transactions/index.svelte';

	let active = 'base';
	let encodedToken = '';
	let selectedMint = $mints[0];

	let top = 0;

	let addOpen: boolean = false;
	let sendOpen: boolean = false;
	let addFriend: boolean = false;

	onMount(() => {
		const keyDown = (e: KeyboardEvent) => {
			if (e.key === 'R') {
				active = 'receive';
			} else if (e.key === 'S') {
				if ($mints.length) {
					active = 'send';
				}
			} else if (e.key === 'B') {
				active = 'base';
			}
		};
		window.addEventListener('keydown', keyDown);

		return () => {
			// this function is called when the component is destroyed
			window.removeEventListener('keydown', keyDown);
		};
	});
</script>

<div class="flex lg:gap-8 gap-4 px-4 py-4 w-feed lg:m-auto" class:shadow-md={top > 0}>
	<div class="text-center">
		<button class="btn w-14 h-14 btn-primary btn-circle" on:click={() => (addOpen = true)}>
			<Icon icon="teenyicons:add-outline" class="text-2xl" />
		</button>
		<div class="text-sm mt-1 font-semibold">Receive</div>
	</div>
	<div class="text-center">
		<button class="btn w-14 h-14 btn-primary btn-circle" on:click={() => (sendOpen = true)}>
			<Icon icon="ph:arrow-right-thin" class="w-8 h-8" />
		</button>
		<div class="text-sm mt-1 font-semibold">Send</div>
	</div>
	<div class="text-center">
		<!-- <button class="btn w-14 h-14 btn-circle btn-outline" on:click={() => (addFriend = true)}>
			<Icon icon="carbon:user" class="w-8 h-8" />
		</button> -->
		<button class="btn w-14 h-14 btn-outline btn-circle">
			<QrScanner />
		</button>
		<div class="text-sm mt-1 font-semibold">Scan</div>
	</div>
	<div class="flex-grow w-1/4" />
</div>

<Transactions bind:top />
