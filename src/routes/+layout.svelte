<!-- <script context="module">
	export { load } from './+layout'; // Adjust the path if necessary
</script> -->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { addMint } from 'src/actions/mint';
	import { updateVc } from 'src/lib';
	import 'src/stores/contacts';
	import 'src/stores/nuts';
	import { getNuts } from 'src/stores/nuts';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import '../app.css';
	import MobileNav from '../comp/MobileNav.svelte';
	import StorageManager from '../comp/plugin/StorageManager.svelte';
	import Toasts from '../comp/Toasts.svelte';
	import { nostrPubKey } from '../stores/nostr';
	import Login from './login.svelte';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';
	// Watch for route changes
	onMount(() => {
		if ($page.route.id === '/') {
			goto('/home');
		}
		// console.log('Route changed to:', $page.route.id);
		page.subscribe((p) => {
			// console.log('Route changed to:', $page.route.id);
			updateVc();
			updateVh();
			// You can add your custom logic here
			addMint('https://mint.minibits.cash/Bitcoin');
			addMint('https://mint.lnserver.com/');
		});

		while (!$nostrPubKey) {
			let isSaved = false;
			setTimeout(async () => {
				// console.log('Waiting for profile');
				isSaved = await getNuts();
			}, 10000);
			if (isSaved) {
				break;
			}
		}

		// $: console.log(c);
		// You can add your custom logic here
	});

	$: homepage = $page.route.id == '/';

	function updateVh() {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
	}
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>

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
