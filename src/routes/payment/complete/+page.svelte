<script lang="ts">
	import type { ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		ConnectionTracker,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import { CheckCircle2, Clock3 } from 'lucide-svelte';
	import type { EventTemplate } from 'nostr-tools';
	import { key } from 'src/controller';
	import {
		PURCHASE_RELAY_SET_D,
		buildRelayRoleSetTags,
		mergeRelayFeedIndexTags,
		relaySetAddress,
		relaySetAddressesFromRelayFeedEvent,
		relayUrlsFromRelaySet
	} from 'src/lib/adminRelays';
	import { INDEXER_RELAYS } from 'src/lib/env';
	import { now } from 'src/lib/period';
	import { resolve } from 'src/lib/paths';
	import { onDestroy, onMount } from 'svelte';

	export let data: {
		status: string;
		community: string;
		recipientPubkey: string;
		returnTo: string;
	};

	let mounted = false;
	let trackingStarted = false;
	let lookupFinished = false;
	let relayFeed: ParsedEvent | undefined;
	let purchaseRelaySet: ParsedEvent | undefined;
	let lookupUnsubscribe: (() => void) | undefined;
	let lookupTimeout: ReturnType<typeof setTimeout> | undefined;
	let publishUnsubscribes: (() => void)[] = [];
	let trackingStatus = '';

	function isNewer(candidate: ParsedEvent, current: ParsedEvent | undefined) {
		if (!current) return true;
		return (
			candidate.createdAt() > current.createdAt() ||
			(candidate.createdAt() === current.createdAt() &&
				(candidate.id() || '').localeCompare(current.id() || '') < 0)
		);
	}

	function publishTrackingEvent(event: EventTemplate, id: string, complete: () => void) {
		let unsubscribe: (() => void) | undefined;
		unsubscribe = usePublish(
			id,
			event,
			(message: WorkerMessage) => {
				const status = asConnectionStatus(message);
				if (status?.status()?.toString() !== 'true') return;
				unsubscribe?.();
				publishUnsubscribes = publishUnsubscribes.filter((item) => item !== unsubscribe);
				complete();
			},
			{ trackStatus: true, defaultRelays: INDEXER_RELAYS }
		);
		publishUnsubscribes = [...publishUnsubscribes, unsubscribe];
	}

	function publishPurchaseRelayTracking() {
		if (lookupFinished) return;
		lookupFinished = true;
		lookupUnsubscribe?.();
		lookupUnsubscribe = undefined;
		if (lookupTimeout) clearTimeout(lookupTimeout);
		lookupTimeout = undefined;

		const pubkey = $key?.pub;
		if (!pubkey || pubkey !== data.recipientPubkey) return;

		const purchaseSetAddress = relaySetAddress(pubkey, 'purchase');
		const indexHasPurchaseSet =
			relaySetAddressesFromRelayFeedEvent(relayFeed).includes(purchaseSetAddress);
		const purchaseSetHasRelay = relayUrlsFromRelaySet(purchaseRelaySet).includes(data.community);
		const events: { id: string; template: EventTemplate }[] = [];

		if (!indexHasPurchaseSet) {
			events.push({
				id: `purchase_relay_index_${pubkey}`,
				template: {
					kind: 10012,
					content: '',
					created_at: now(),
					tags: mergeRelayFeedIndexTags(relayFeed, pubkey, ['purchase'])
				}
			});
		}

		if (!purchaseSetHasRelay) {
			events.push({
				id: `purchase_relay_set_${pubkey}`,
				template: {
					kind: 30002,
					content: '',
					created_at: now(),
					tags: buildRelayRoleSetTags('purchase', purchaseRelaySet, data.community)
				}
			});
		}

		if (!events.length) {
			trackingStatus = 'Purchase notifications are enabled for this community.';
			return;
		}

		trackingStatus = 'Enabling purchase notifications…';
		let completed = 0;
		const complete = () => {
			completed += 1;
			if (completed === events.length) {
				trackingStatus = 'Purchase notifications are enabled for this community.';
			}
		};
		for (const event of events) publishTrackingEvent(event.template, event.id, complete);
	}

	function startPurchaseRelayTracking() {
		const pubkey = $key?.pub;
		if (!pubkey || pubkey !== data.recipientPubkey || $key?.hasSigner === false) return;
		trackingStarted = true;
		trackingStatus = 'Checking purchase notifications…';

		const connectionTracker = new ConnectionTracker();
		lookupTimeout = setTimeout(() => {
			if (lookupFinished) return;
			lookupFinished = true;
			lookupUnsubscribe?.();
			lookupUnsubscribe = undefined;
			trackingStatus = 'Purchase notification setup could not be confirmed.';
		}, 5000);

		lookupUnsubscribe = useSubscription(
			`purchase_relay_tracking_${pubkey}`,
			[
				{
					kinds: [10012],
					authors: [pubkey],
					limit: 1,
					relays: INDEXER_RELAYS,
					cacheFirst: true
				},
				{
					kinds: [30002],
					authors: [pubkey],
					tags: { '#d': [PURCHASE_RELAY_SET_D] },
					limit: 1,
					relays: INDEXER_RELAYS,
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (parsedEvent?.kind() === 10012 && isNewer(parsedEvent, relayFeed)) {
					relayFeed = parsedEvent;
					return;
				}
				if (parsedEvent?.kind() === 30002 && isNewer(parsedEvent, purchaseRelaySet)) {
					purchaseRelaySet = parsedEvent;
					return;
				}

				const status = asConnectionStatus(message);
				if (!status?.relayUrl()) return;
				connectionTracker.handleMessage(message);
				if (connectionTracker.resolutionRate > 0.5) publishPurchaseRelayTracking();
			},
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	$: if (mounted && !trackingStarted && $key?.pub === data.recipientPubkey) {
		startPurchaseRelayTracking();
	}

	onMount(() => {
		mounted = true;
	});

	onDestroy(() => {
		lookupUnsubscribe?.();
		if (lookupTimeout) clearTimeout(lookupTimeout);
		for (const unsubscribe of publishUnsubscribes) unsubscribe();
	});
</script>

<svelte:head><title>Payment status · Nuts</title></svelte:head>

<main class="grid min-h-screen place-items-center bg-stone-50 px-5 py-12 text-stone-950">
	<section
		class="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-xl shadow-stone-950/5 sm:p-12"
	>
		{#if data.status === 'paid'}
			<span
				class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700"
				><CheckCircle2 size={34} /></span
			>
			<h1 class="mt-6 text-3xl font-black">Payment received</h1>
			<p class="mt-3 font-semibold leading-7 text-stone-500">
				Your payment is confirmed. The community is now delivering the badge for your purchase.
			</p>
		{:else}
			<span
				class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-700"
				><Clock3 size={34} /></span
			>
			<h1 class="mt-6 text-3xl font-black">Payment processing</h1>
			<p class="mt-3 font-semibold leading-7 text-stone-500">
				Stripe has not marked this payment as complete yet. Some payment methods take longer to
				confirm.
			</p>
		{/if}
		{#if trackingStatus}
			<p class="mt-3 text-sm font-semibold text-stone-500">{trackingStatus}</p>
		{/if}
		<a
			href={resolve(data.returnTo)}
			class="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-[#073c32] px-6 text-sm font-black text-white no-underline"
			>Return to Nuts</a
		>
	</section>
</main>
