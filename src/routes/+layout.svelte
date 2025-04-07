<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	import Landing from './+page.svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import MobileNav from 'src/comp/MobileNav.svelte';
	import DesktopNav from 'src/comp/DesktopNav.svelte';
	import Theme from 'src/comp/Theme.svelte';
	import Alert from 'src/comp/Alert.svelte';
	import Login from './login.svelte';
	import Statuses from 'src/comp/Statuses.svelte';

	import { activeAccount, initialize, key } from 'src/stores/db';
	import { onMount, setContext } from 'svelte';
	import { mint, mints } from 'src/stores/mints';
	import { dmSub } from 'src/stores/nuts';
	import { claimPendingSub, proofSpentSub } from 'src/stores/proofs';
	import { claimInvoicesSub } from 'src/stores/invoices';
	import type { NIP01Parsed } from 'src/workers/nip01';
	import type { NIP02Parsed } from 'src/workers/nip02';
	import { writable, type Writable } from 'svelte/store';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { nostrManager } from 'src/wasm/manager';
	import _ from 'lodash';
	import type { Kind10002Parsed, Kind3Parsed } from 'src/parsers';
	import { viewport } from 'src/lib';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	let profile: Writable<NIP01Parsed> = writable();
	setContext('profile', profile);
	let followList: Writable<NIP02Parsed> = writable([]);
	setContext('followList', followList);
	let outboxList: Writable<NIP02Parsed> = writable([]);
	setContext('outboxList', outboxList);

	$: profileSub =
		$key &&
		$key.pub &&
		nostrManager.subscribe(
			'profile',
			[
				{
					kinds: [0, 3, 10002],
					authors: [$key.pub],
					relays: ['wss://relay.damus.io']
				}
			],
			(events: ParsedEvent<unknown>[]) => {
				// the first event is from the sub, everything else is contextual
				const event = events[0];
				if (!event) return;
				console.log('____PROFILE____', event);
				if (event.parsed) {
					switch (event.kind) {
						case 0:
							$profile = (event as ParsedEvent<NIP01Parsed>).parsed;
							break;
						case 3:
							$followList = (event as ParsedEvent<Kind3Parsed>).parsed;
							break;
						case 10002:
							$outboxList = (event as ParsedEvent<Kind10002Parsed>).parsed;
							break;
					}
				}
				// Handle subscription updates here
			},
			{
				force: true
			}
		);

	// Watch for route changes
	onMount(() => {
		setViewport();
		if (!$mint) $mint = $mints[0];
		const initializer = initialize.subscribe((n) => n);
		// const nostrEvent = nostrEventSub.subscribe((n) => n);
		const dms = dmSub.subscribe((n) => n);
		// const nutZaps = nutzapSub.subscribe((n) => n);
		const claimPending = claimPendingSub.subscribe((n) => n);
		const proofSpent = proofSpentSub().subscribe((n) => n);
		const claimInvoices = claimInvoicesSub().subscribe((n) => n);
		// const following = followingSub.subscribe((n) => n);

		// 	// const profile = profileSub.subscribe((n) => n);
		return () => {
			initializer();
			// nostrEvent();
			dms();
			claimPending();
			proofSpent();
			claimInvoices();
			profileSub && profileSub();
		};
	});

	$: homepage = $page.route.id == '/';

	function setViewport() {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
		document.documentElement.style.setProperty('--vw', `${window.innerWidth * 0.01}px`);

		$viewport.vw = window.innerWidth * 0.01;
		$viewport.vh = window.innerHeight * 0.01;
	}
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>

{#if !homepage}
	<Statuses />
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
