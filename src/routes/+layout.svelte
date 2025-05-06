<script lang="ts">
	import { page } from '$app/stores';
	import '../app.css';

	import Alert from 'src/comp/Alert.svelte';
	import Statuses from 'src/comp/Statuses.svelte';
	import Theme from 'src/comp/Theme.svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import Landing from './+page.svelte';
	import HomeLayout from './home/+layout.svelte';
	import HomePage from './home/+page.svelte';
	import Login from './login.svelte';

	import { goto } from '$app/navigation';
	import { kind0, kind10002, kind10019, kind3 } from 'src/controller/nostr';
	import { viewport } from 'src/lib';
	import { isKind0, isKind10002, isKind10019, isKind3, type AnyKind } from 'src/parsers';
	import { activeAccount, key } from 'src/stores/db';
	import type { Request } from 'src/wasm/manager';
	import { nostrManager, type SubscribeKind } from 'src/wasm/manager';
	import type { NIP01Parsed } from 'src/workers/nip01';
	import type { NIP02Parsed } from 'src/workers/nip02';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onMount, setContext } from 'svelte';
	import { spring } from 'svelte/motion';
	import { writable, type Writable } from 'svelte/store';
	import { cashuManager } from 'src/wasm/cashu';
	import { go } from './modals/modal';
	import { mints, saveNuts } from 'src/controller/wallet';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	let profile: Writable<NIP01Parsed> = writable();
	setContext('profile', profile);
	let followList: Writable<NIP02Parsed> = writable([]);
	setContext('followList', followList);
	let outboxList: Writable<NIP02Parsed> = writable([]);
	setContext('outboxList', outboxList);

	// Carousel configuration
	let scroller: HTMLElement;
	const pages = ['/home', '/explore', '/chat'];
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

	$: $key && $key.priv && nostrManager.loginWithPrivateKey($key.priv);

	$: relaySub =
		$key &&
		$key.pub &&
		nostrManager.subscribe(
			'relays',
			[
				{
					kinds: [10002, 10019],
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es'],
					noOptimize: true
				},
				{
					kinds: [0, 3], // 0 and 3 are here if found immdiately, but refetched after
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es'],
					noOptimize: true,
					cacheFirst: true
				}
			],
			(events: ParsedEvent<unknown>[]) => {
				// the first event is from the sub, everything else is contextual
				const event = events[0];
				if (!event) return;
				console.log('root eventkind', event.kind);
				if (event.parsed) {
					if (isKind10002(event) && event.created_at > ($kind10002?.created_at || 0))
						$kind10002 = event;
					if (isKind10019(event) && event.created_at > ($kind10019?.created_at || 0))
						$kind10019 = event;
					if (isKind0(event) && event.created_at > ($kind0?.created_at || 0)) $kind0 = event;
					if (isKind3(event) && event.created_at > ($kind3?.created_at || 0)) $kind3 = event;
				}
				// Handle subscription updates here
			},
			{
				force: true
			}
		);

	$: profileSub =
		($kind10002 || $kind10019 || $kind3) &&
		nostrManager.subscribe(
			'profile',
			[
				$kind10002 && {
					kinds: [0, 3],
					authors: [$key?.pub],
					relays: $kind10002.parsed?.filter((r) => r.write).map((r) => r.url),
					noOptimize: true
				},
				$kind3 && {
					kinds: [10002],
					authors: $kind3.parsed?.map((p) => p.pubkey),
					relays: ['wss://relay.nostr.band', 'wss://purplepag.es'],
					noOptimize: true
				}
			].filter((r) => !!r) as Request[],
			handleProfileEvents
		);

	function handleProfileEvents(events: ParsedEvent<AnyKind>[], eventType: SubscribeKind) {
		const [event, ...context] = events;
		if (isKind0(event) && event.created_at > ($kind0?.created_at || 0)) $kind0 = event;
		if (isKind3(event) && event.created_at > ($kind3?.created_at || 0)) $kind3 = event;
	}

	// Watch for route changes
	onMount(() => {
		setViewport();
		let mintSub = cashuManager.subscribe('quote_update', async ({ quoteId, state, mint }) => {
			if (state == 'paid') {
				const amount = await cashuManager.mintTokens(quoteId);
				const mintProofs = await cashuManager.getProofsFromMint(mint);
				saveNuts(mint, mintProofs);
				$mints.then((mints) => {
					const mintName = mints.find((m) => m.url == mint)?.name?.trim();
					go(`minted:${mintName}:${amount}`);
				});
			}
		});
		return () => {
			relaySub && relaySub();
			profileSub && profileSub();
			mintSub();
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
		pages[currentIndex] = $page.url.pathname;
		// Update the current index
		currentIndex = index;

		goto(pages[index]);
		// Update scroll and position stores
		$scrollPosition = (currentIndex * scroller.offsetWidth) / 2;
		$xPosition = currentIndex * (scroller?.offsetWidth || 0);
	}

	// Add and remove event listener
	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		// Set up initial index based on route, but wait for scroller to be available
		const initializePositions = () => {
			if (!scroller || !scroller.offsetWidth) {
				// If scroller isn't ready yet, try again in the next frame
				window.requestAnimationFrame(initializePositions);
				return;
			}
			function setPosition(index: number) {
				currentIndex = index;
				scrollPosition.set((currentIndex * scroller.offsetWidth) / 2, { hard: true });
				xPosition.set(index * scroller.offsetWidth, { hard: true });
			}

			// Determine the index based on the current route
			if ($page.url.pathname.startsWith('/chat')) {
				setPosition(2);
			} else if ($page.url.pathname.startsWith('/explore')) {
				setPosition(1);
			} else if ($page.url.pathname.startsWith('/home')) {
				setPosition(0);
			}

			// Update the pages array with the current pathname
			pages[currentIndex] = $page.url.pathname;
		};

		// Start the initialization process
		initializePositions();

		// Add resize listener to update viewport
		window.addEventListener('resize', setViewport);
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
			class="flex gap-2 overflow-hidden relative will-change-scroll"
			bind:this={scroller}
			on:touchmove={(e) => {
				$xPosition = scroller.scrollLeft;
				// $activeAccount = Math.round(accounts.scrollLeft / accounts.clientWidth);
			}}
			style="transform-style: preserve-3d; perspective: 1000px;"
		>
			<!-- Home Section -->
			<div
				class="carousel-item w-[100vw] will-change-transform"
				style="transform: translateZ({transform0 * 10}px) rotateY({(1 - transform0) *
					(0 - currentIndex) *
					30}deg) scale({transform0}); opacity: {transform0};"
				class:z-10={currentIndex == 0}
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
			<!-- <div
				class="carousel-item w-[100vw] h-full will-change-transform"
				class:z-10={currentIndex == 1}
				style="transform: translateZ({transform1 * 10}px) rotateY({(1 - transform1) *
					(1 - currentIndex) *
					30}deg) scale({transform1}); opacity: {transform1};; margin-right: -{50 *
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
					<Explore />
				</div>
			</div> -->

			<!-- <div
				class="carousel-item w-[100vw] h-full will-change-transform"
				style="transform: translateZ({transform2 * 10}px) rotateY({(1 - transform2) *
					(2 - currentIndex) *
					30}deg) scale({transform2}); opacity: {transform2};"
				class:z-10={currentIndex == 2}
				on:click={(e) => {
					if (currentIndex != 2) {
						e.preventDefault();
						e.stopPropagation();
						moveToIndex(2);
					}
				}}
			>
				<div class="w-full h-screen relative overflow-hidden">
					<Chat/>
				</div>
			</div> -->
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
