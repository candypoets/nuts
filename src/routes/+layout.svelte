<script lang="ts">
	import '../app.css';
	import 'photoswipe/style.css';
	import { page } from '$app/stores';
	import { updateVc } from 'src/lib';

	import Landing from './+page.svelte';
	import { followingSub } from 'src/stores/contacts';
	import { claimInvoicesSub, claimPendingSub, proofSpentSub, nostrEventSub } from 'src/stores/nuts';
	// // import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import MobileNav from 'src/comp/MobileNav.svelte';
	import DesktopNav from 'src/comp/DesktopNav.svelte';
	import Theme from 'src/comp/Theme.svelte';
	import Alert from 'src/comp/Alert.svelte';

	import Login from './login.svelte';

	import { activeAccount, initialize, key, keysCache } from 'src/stores/db';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { mint, mints } from 'src/stores/mints';
	import { nutzapSub } from 'src/stores/zaps';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';
	// Watch for route changes
	onMount(() => {
		// 	// console.log('Route changed to:', $page.route.id);
		if (!$mint) $mint = $mints[0];
		updateVc();
		updateVh();
		// 	// if ($page.route.id === '/') {
		// 	// 	goto('/home');
		// 	// }
		// 	// console.log('Route changed to:', $page.route.id);
		page.subscribe((p) => {
			console.log('Route changed to:', $page.route.id);
			updateVc();
			updateVh();
			// You can add your custom logic here
		});
		const initializer = initialize.subscribe((n) => n);
		const nostrEvent = nostrEventSub.subscribe((n) => n);
		const nutZaps = nutzapSub.subscribe((n) => n);
		const claimPending = claimPendingSub.subscribe((n) => n);
		const proofSpent = proofSpentSub().subscribe((n) => n);
		const claimInvoices = claimInvoicesSub().subscribe((n) => n);
		const following = followingSub.subscribe((n) => n);
		// 	// const profile = profileSub.subscribe((n) => n);
		return () => {
			initializer();
			nostrEvent();
			claimPending();
			proofSpent();
			claimInvoices();
			following();
			nutZaps();
			// 		// profile();
		};
	});

	$: homepage = $page.route.id == '/';

	function updateVh() {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
	}

	$: console.log('logged keys', $key);
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>

{#if !homepage}
	<Alert />
	{#if $key?.pub || !!$activeAccount}
		<slot />
		<MobileNav />
		<DesktopNav />
		<Theme />
	{:else}
		<Login />
	{/if}
{:else}
	<Landing />
{/if}
