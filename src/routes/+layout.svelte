<script lang="ts">
	import { page } from '$app/stores';
	import '../app.css';

	import Alert from 'src/comp/Alert.svelte';
	import Statuses from 'src/comp/Statuses.svelte';
	import Theme from 'src/comp/Theme.svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import Landing from './+page.svelte';
	import ChatLayout from './chat/+layout.svelte';
	import ChatPage from './chat/+page.svelte';
	import ExploreLayout from './explore/+layout.svelte';
	import HomeLayout from './home/+layout.svelte';
	import HomePage from './home/+page.svelte';
	import Login from './login.svelte';

	import { viewport } from 'src/lib';
	import type { Kind10002Parsed, Kind3Parsed } from 'src/parsers';
	import { activeAccount, initialize, key } from 'src/stores/db';
	import { claimInvoicesSub } from 'src/stores/invoices';
	import { mint, mints } from 'src/stores/mints';
	import { dmSub } from 'src/stores/nuts';
	import { claimPendingSub, proofSpentSub } from 'src/stores/proofs';
	import { nostrManager } from 'src/wasm/manager';
	import type { NIP01Parsed } from 'src/workers/nip01';
	import type { NIP02Parsed } from 'src/workers/nip02';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onMount, setContext } from 'svelte';
	import { spring } from 'svelte/motion';
	import { writable, type Writable } from 'svelte/store';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	let profile: Writable<NIP01Parsed> = writable();
	setContext('profile', profile);
	let followList: Writable<NIP02Parsed> = writable([]);
	setContext('followList', followList);
	let outboxList: Writable<NIP02Parsed> = writable([]);
	setContext('outboxList', outboxList);

	// Carousel configuration
	let scroller: HTMLElement;
	const pages = ['chat', 'explore', 'home'];
	const positions = [-100, 0, 100]; // Initial positions as percentages
	let currentIndex = 0;

	// Create a spring store for smooth animations
	const xPosition = spring(0, {
		stiffness: 0.1,
		damping: 1
	});

	const scrollPosition = spring(0, {
		stiffness: 0.1, // Lower for slower, softer animation
		damping: 1 // Adjust for bounce effect
	});

	$: if (scroller) {
		scroller.scrollLeft = $scrollPosition;
	}

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

	function getTransformRatio(index: number, x: number, elementWidth: number) {
		// Calculate the "target point" where this index should reach ratio=1
		const targetPoint = index * elementWidth;

		// Calculate the distance in terms of "element widths"
		const distanceInWidths = Math.abs(x - targetPoint) / elementWidth;

		// When distance is 0, ratio should be 1
		// As distance increases, ratio decreases according to 1/(distance+1)
		// +1 prevents division by zero and ensures we get 1 when at exact target
		const ratio = 1 / (distanceInWidths + 1);

		return ratio;
	}

	// Handle keyboard navigation (Alt + Left/Right)
	function handleKeydown(e: KeyboardEvent) {
		if (e.altKey) {
			if (e.key === 'ArrowLeft' && currentIndex > 0) {
				moveToIndex(currentIndex - 1);
			} else if (e.key === 'ArrowRight' && currentIndex < pages.length - 1) {
				moveToIndex(currentIndex + 1);
			}
		}
	}

	function moveToIndex(index: number) {
		// Ensure index is within bounds
		if (index < 0 || index >= pages.length) return;
		// Update the current index
		currentIndex = index;
		// Update scroll and position stores
		$scrollPosition = (currentIndex * scroller.offsetWidth) / 2;
		$xPosition = currentIndex * (scroller?.offsetWidth || 0);
	}

	// Add and remove event listener
	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	$: transform0 = getTransformRatio(0, $xPosition, scroller?.offsetWidth || 0);
	$: transform1 = getTransformRatio(1, $xPosition, scroller?.offsetWidth || 0);
	$: transform2 = getTransformRatio(2, $xPosition, scroller?.offsetWidth || 0);
</script>

<svelte:head>
	{@html webManifestLink}
</svelte:head>

{#if !homepage}
	<Statuses />
	<Alert />
	{#if $key?.pub || !!$activeAccount}
		<div
			class="flex gap-2 overflow-x-hidden"
			bind:this={scroller}
			on:touchmove={(e) => {
				$xPosition = scroller.scrollLeft;
				// $activeAccount = Math.round(accounts.scrollLeft / accounts.clientWidth);
			}}
		>
			<!-- Home Section -->
			<div
				class="carousel-item w-[100vw]"
				style="transform: rotateY({(1 - transform0) *
					-30}deg) scale({transform0}); opacity: {transform0};"
				on:click={(e) => {
					if (currentIndex != 0) {
						e.preventDefault();
						e.stopPropagation();
						moveToIndex(0);
					}
				}}
			>
				<div class="w-full relative overflow-hidden">
					{#key 'home'}
						<svelte:component this={HomeLayout}>
							<svelte:component this={HomePage} />
						</svelte:component>
					{/key}
				</div>
			</div>

			<!-- Explore Section -->
			<div
				class="carousel-item w-[100vw] h-full"
				style="transform: rotateY({(1 - transform1) *
					-30}deg) scale({transform1}); opacity: {transform1};; margin-right: -{50 *
					$viewport.vw}px; margin-left: -{50 * $viewport.vw}px"
				on:click={(e) => {
					if (currentIndex != 1) {
						e.preventDefault();
						e.stopPropagation();
						moveToIndex(1);
					}
				}}
			>
				<div class="w-full h-full relative overflow-hidden">
					{#key 'explore'}
						<svelte:component this={ExploreLayout}>
							<!-- <svelte:component this={import('src/routes/explore/+page.svelte')} /> -->
						</svelte:component>
					{/key}
				</div>
			</div>

			<div
				class="carousel-item w-[100vw] h-full"
				style="transform: rotateY({(1 - transform2) *
					-30}deg) scale({transform2}); opacity: {transform2};"
				on:click={(e) => {
					if (currentIndex != 2) {
						e.preventDefault();
						e.stopPropagation();
						moveToIndex(2);
					}
				}}
			>
				<div class="w-full h-full relative overflow-hidden">
					{#key 'chat'}
						<svelte:component this={ChatLayout}>
							<svelte:component this={ChatPage} />
						</svelte:component>
					{/key}
				</div>
			</div>
		</div>

		<!-- Bottom Navigation -->
		<!-- <MobileNav activeIndex={activePageIndex} />
		<DesktopNav /> -->
		<Theme />
	{:else}
		<Login />
	{/if}
{:else}
	<Landing />
{/if}
