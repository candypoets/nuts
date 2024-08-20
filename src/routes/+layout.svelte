<!-- <script context="module">
	export { load } from './+layout'; // Adjust the path if necessary
</script> -->

<script lang="ts">
	import { page } from '$app/stores';
	import { addMint } from 'src/actions/mint';
	import { updateVc } from 'src/lib';
	import 'src/stores/contacts';
	import 'src/stores/nuts';
	import { onMount } from 'svelte';
	import '../app.css';
	import MobileNav from '../comp/MobileNav.svelte';
	import StorageManager from '../comp/plugin/StorageManager.svelte';
	import Toasts from '../comp/Toasts.svelte';
	import { nostrPubKey } from '../stores/nostr';
	import Login from './login.svelte';
	import { goto } from '$app/navigation';

	// Watch for route changes
	onMount(() => {
		goto('/home');
		// console.log('Route changed to:', $page.route.id);
		page.subscribe((p) => {
			// console.log('Route changed to:', $page.route.id);
			updateVc();
			// You can add your custom logic here
			addMint('https://mint.minibits.cash/Bitcoin');
			addMint('https://mint.lnserver.com/');
		});

		// $: console.log(c);
		// You can add your custom logic here
	});

	$: homepage = $page.route.id == '/';
</script>

<StorageManager>
	<!-- {#if $useNostr} -->
	<!-- <NostrSocket /> -->
	<!-- {/if} -->
	{#if $nostrPubKey}
		<slot />
		<Toasts />
		<MobileNav />
	{:else}
		<Login />
	{/if}
</StorageManager>
