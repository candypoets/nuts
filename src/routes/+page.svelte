<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import Nutscash from 'src/components/Nutscash.svelte';
	import { writable, type Writable } from 'svelte/store';
	import Login from './login.svelte';

	let showMenu = false;
	let scrollY: Writable<number> = writable(0);

	// onMount(() => {
	// 	const unsubscribe = scrollY.subscribe((value) => {
	// 		if (value > 50) {
	// 			document.body.classList.add('scrolled');
	// 		} else {
	// 			document.body.classList.remove('scrolled');
	// 		}
	// 	});

	// 	return unsubscribe;
	// });

	function toggleMenu() {
		showMenu = !showMenu;
	}

	let progress = 0;

	// let items: HistoryItem<HistoryData>[] = [
	// 	{
	// 		type: HistoryItemType.SEND,
	// 		date: Math.floor(Date.now() / 1000) - 86400,
	// 		amount: 50,
	// 		data: { to: '49c3f0ee826a80010c75a66a3e2fb75324302a6969ad62f1e557a6b6dc667777' }
	// 	},
	// 	{
	// 		type: HistoryItemType.SEND,
	// 		date: Math.floor(Date.now() / 1000) - 86400,
	// 		amount: 50,
	// 		data: { to: '49c3f0ee826a80010c75a66a3e2fb75324302a6969ad62f1e557a6b6dc667777' }
	// 	},
	// 	{
	// 		type: HistoryItemType.RECEIVE_NOSTR,
	// 		date: new Date().setDate(new Date().getDate() - 1) / 1000,
	// 		amount: 50,
	// 		data: { from: '6a72db8ef3f3b9ee5ecd808ed6d0631d1e4dda5c5dadf07887104d33957eba48' }
	// 	}
	// ];
</script>

<svelte:window bind:scrollY={$scrollY} />

<Login />

<style>
	/* Any additional custom styles can go here */
</style>
