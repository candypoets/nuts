<script lang="ts">
	import '../app.css';
	import 'photoswipe/style.css';
	// import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { updateVc } from 'src/lib';

	import Landing from './+page.svelte';
	import { followingSub } from 'src/stores/contacts';
	import { claimInvoicesSub, claimPendingSub, proofSpentSub, nostrEventSub } from 'src/stores/nuts';
	// // import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import MobileNav from 'src/comp/MobileNav.svelte';

	import Login from './login.svelte';

	import { activeAccount, initialize, key, keysCache } from 'src/stores/db';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';
	// Watch for route changes
	onMount(() => {
		console.log('-----------initial mount-----------', window.nostr);
		if (window.nostr?.nip04) {
			console.log('olaaaa');
			// keysCache.clear();
			window.nostr
				.getPublicKey()
				.then((pubKey: string) => {
					console.log('-------------hello--------------', pubKey);
					keysCache.put({
						pub: pubKey,
						npub: nip19.npubEncode(pubKey)
					});
					$activeAccount = Array.from($keysCache.values()).findIndex((k) => k.pub == pubKey);
				})
				.catch((err) => console.warn(err));
		}
		updateVc();
		updateVh();
		// 	// if ($page.route.id === '/') {
		// 	// 	goto('/home');
		// 	// }
		// 	// console.log('Route changed to:', $page.route.id);
		page.subscribe((p) => {
			// console.log('Route changed to:', $page.route.id);
			updateVc();
			updateVh();
			// You can add your custom logic here
		});
		const initializer = initialize.subscribe((n) => n);
		const nostrEvent = nostrEventSub.subscribe((n) => n);
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
			// 		// profile();
		};
	});

	$: homepage = $page.route.id == '/';

	function updateVh() {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
	}

	// $: console.log('signer', $signer);
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>

{#if !homepage}
	{#if $key?.pub}
		<slot />
		<MobileNav />
	{:else}
		<Login />
	{/if}
{:else}
	<Landing />
{/if}
