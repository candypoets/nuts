<script lang="ts">
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

<Transactions bind:top />
