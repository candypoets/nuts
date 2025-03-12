<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { updateVc } from 'src/lib';

	import Landing from './+page.svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import MobileNav from 'src/comp/MobileNav.svelte';
	import DesktopNav from 'src/comp/DesktopNav.svelte';
	import Theme from 'src/comp/Theme.svelte';
	import Alert from 'src/comp/Alert.svelte';
	import Login from './login.svelte';

	import { activeAccount, initialize, key } from 'src/stores/db';
	import { onMount, setContext } from 'svelte';
	import { mint, mints } from 'src/stores/mints';
	import { dmSub } from 'src/stores/nuts';
	import { claimPendingSub, proofSpentSub } from 'src/stores/proofs';
	import { claimInvoicesSub } from 'src/stores/invoices';
	import { handler } from 'src/handlers';
	import type { NIP01Parsed } from 'src/workers/nip01';
	import type { NIP02Parsed } from 'src/workers/nip02';
	import NIP01Worker from 'src/workers/nip01?worker';
	import NIP02Worker from 'src/workers/nip02?worker';
	import NIP65Worker from 'src/workers/nip65?worker';
	import { writable, type Writable } from 'svelte/store';
	import type { Nip65Params, NIP65Parsed } from 'src/workers/nip65';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { nostrManager } from 'src/wasm/manager';
	import _ from 'lodash';
	import type { P } from 'vitest/dist/reporters-w_64AS5f.js';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	let nip01: Worker;
	let nip02: Worker;
	let nip65: Worker;
	let profile: Writable<NIP01Parsed> = writable();
	let followList: Writable<NIP02Parsed> = writable([]);
	let outboxList: Writable<NIP02Parsed> = writable([]);
	let inboxList: Writable<NIP02Parsed> = writable([]);
	let nip65s: Writable<ParsedEvent<NIP65Parsed>[]> = writable([]);

	$: profileSub =
		$key &&
		$key.pub &&
		nostrManager.subscribe(
			'profile',
			[{ kinds: [0], authors: [$key.pub], relays: [] }],
			(event: ParsedEvent<unknown>) => {
				console.log('____EVENT____', event, typeof event);
				$profile = (event as ParsedEvent<NIP01Parsed>).parsed;
				// Handle subscription updates here
			}
		);
	// $: $key && $key.pub && nip02 && nip02.postMessage({ pubkey: $key.pub, relays: $profile?.relays });
	// $: $followList.length &&
	// 	nip65.postMessage({ authors: $followList.map((c) => c.pubkey) } as Nip65Params);

	$: setContext('profile', profile);
	// $: setContext('followList', followList);
	// $: setContext('outboxList', outboxList);
	// $: setContext('nip65s', nip65s);

	// Watch for route changes
	onMount(() => {
		// nip01 = new NIP01Worker();
		// nip02 = new NIP02Worker();
		// nip65 = new NIP65Worker();
		// (async function () {
		// 	for await (const data of handler<NIP01Parsed>(nip01)) {
		// 		if (data.parsed) {
		// 			$profile = data.parsed;
		// 		}
		// 	}
		// })();
		// (async function () {
		// 	for await (const data of handler<NIP02Parsed>(nip02)) {
		// 		if (data.parsed) {
		// 			$followList = data.parsed;
		// 		}
		// 	}
		// })();
		// (async function () {
		// 	for await (const data of handler<NIP65Parsed>(nip65)) {
		// 		if (data.parsed) {
		// 			$nip65s = [...$nip65s, data];
		// 		}
		// 		if (data.type == 'EOSE') {
		// 			// Create a combined list that prioritizes nip65s over followList
		// 			const outboxSources = _.chain($nip65s)
		// 				.map((item) => ({
		// 					pubkey: item.pubkey,
		// 					relays: item.parsed?.filter((r) => r.write).map((r) => r.url) || []
		// 				}))
		// 				.keyBy('pubkey')
		// 				.value();
		// 			const inboxSources = _.chain($nip65s)
		// 				.map((item) => ({
		// 					pubkey: item.pubkey,
		// 					relays: item.parsed?.filter((r) => r.read).map((r) => r.url) || []
		// 				}))
		// 				.keyBy('pubkey')
		// 				.value();

		// 			// Merge with followList, replacing entries when we have nip65 data
		// 			$outboxList = _.chain($followList)
		// 				.map((contact) => {
		// 					if (outboxSources[contact.pubkey]) {
		// 						return {
		// 							...contact,
		// 							relays: outboxSources[contact.pubkey].relays
		// 						};
		// 					}
		// 					return contact;
		// 				})
		// 				.value();
		// 			$inboxList = _.chain($followList)
		// 				.map((contact) => {
		// 					if (inboxSources[contact.pubkey]) {
		// 						return {
		// 							...contact,
		// 							relays: inboxSources[contact.pubkey].relays
		// 						};
		// 					}
		// 					return contact;
		// 				})
		// 				.value();

		// 			console.log('outboxList', $outboxList);
		// 		}
		// 	}
		// })();
		// 	// console.log('Route changed to:', $page.route.id);
		if (!$mint) $mint = $mints[0];
		updateVc();
		updateVh();
		page.subscribe((p) => {
			updateVc();
			updateVh();
			// You can add your custom logic here
		});
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
			// nip01.postMessage({ type: 'UNSUBSCRIBE' });
			// nip01.terminate();
			// nip02.postMessage({ type: 'UNSUBSCRIBE' });
			// nip02.terminate();
			// nip65.postMessage({ type: 'UNSUBSCRIBE' });
			// nip65.terminate();
			// following();
			// nutZaps();
			// 		// profile();
		};
	});

	$: homepage = $page.route.id == '/';

	function updateVh() {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
	}
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
