<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { updateVc } from 'src/lib';
	import 'src/stores/contacts';
	import 'src/stores/nuts';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import MobileNav from '../comp/MobileNav.svelte';

	import { nostrPubKey } from '../stores/nostr';
	import Login from './login.svelte';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';
	// Watch for route changes
	onMount(() => {
		updateVc();
		updateVh();
		if ($page.route.id === '/') {
			goto('/home');
		}
		// console.log('Route changed to:', $page.route.id);
		page.subscribe((p) => {
			// console.log('Route changed to:', $page.route.id);
			updateVc();
			updateVh();
			// You can add your custom logic here
		});
	});

	$: homepage = $page.route.id == '/';

	function updateVh() {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
	}
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>

{#if $nostrPubKey}
	<slot />
	<MobileNav />
{:else}
	<Login />
{/if}
