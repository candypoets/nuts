<script lang="ts">
	import 'src/app.css';

	import { onMount } from 'svelte';
	import { spring } from 'svelte/motion';
	import { quintOut } from 'svelte/easing';
	import { pwaInfo } from 'virtual:pwa-info';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import Alert from 'src/components/Alert.svelte';
	import Statuses from 'src/components/Statuses.svelte';
	import {
		kind0,
		kind0Ready,
		kind10002,
		kind10002Ready,
		kind10019,
		kind10019Ready,
		kind3,
		kind3Ready
	} from 'src/controller/nostr';
	import { mints, saveNuts } from 'src/controller/wallet';
	import { isKind0, isKind10002, isKind10019, isKind3, type AnyKind } from 'src/types';
	import Landing from 'src/routes/+page.svelte';
	import Explore from 'src/routes/explore/index.svelte';
	import Home from 'src/routes/home/+layout.svelte';
	import Chat from 'src/routes/chat/index.svelte';
	import Login from 'src/routes/login.svelte';
	import { go, goBack } from 'src/routes/modals/modal';
	import { cashuManager } from 'src/model/cashu';

	import { nostrManager, useSharedSubscription, type SubscribeKind } from 'src/model/nostr-main';
	import type { ParsedEvent } from 'src/types';
	import { key } from 'src/controller';
	import ImageZoom from 'src/components/ImageZoom.svelte';
	import { viewport, dimensions, isMobile } from 'src/controller/viewport';
	import { type Request } from 'src/model/nostr-main/pkg/nostr_main.js';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	// Carousel configuration
	let scroller: HTMLElement;
	const pages = ['/home', '/explore', '/chat'];
	let currentIndex = 0;

	// Reactive variable for scroller width
	$: scrollerWidth = scroller?.clientWidth + 20 || 0;

	// Touch gesture variables
	let touchStartX = 0;
	let touchStartY = 0;
	let isSwiping = false;
	let startXPosition = 0;

	// Create a spring store for smooth animations
	const xPosition = spring(0, {
		stiffness: 0.15,
		damping: 0.8
	});

	const scrollPosition = spring(0, {
		stiffness: 0.15, // Lower for slower, softer animation
		damping: 0.8 // Adjust for bounce effect
	});

	$: if (scroller) {
		scroller.scrollLeft = $scrollPosition;
	}

	$: $key && $key.priv && nostrManager.setSigner('privkey', $key.priv);

	$: console.log('pubkey', $key?.pub);

	$: relaySub =
		$key &&
		$key.pub &&
		useSharedSubscription(
			'relays',
			[
				{
					kinds: [10019, 10002],
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es'],
					noOptimize: true
				},
				{
					kinds: [3, 0], // 0 and 3 are here if found immdiately, but refetched after
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es'],
					noOptimize: true,
					cacheFirst: true
				}
			],
			(events: ParsedEvent<unknown>[], kind: SubscribeKind) => {
				if (kind == 'EOSE') {
					return;
				}
				// the first event is from the sub, everything else is contextual
				const event = events[0];
				if (!event) return;
				if (event.parsed) {
					if (isKind10002(event) && event.created_at > ($kind10002?.created_at || 0)) {
						$kind10002 = event;
						kind10002Ready.resolve(event);
					}
					if (isKind10019(event) && event.created_at > ($kind10019?.created_at || 0)) {
						$kind10019 = event;
						kind10019Ready.resolve(event);
					}
					if (isKind0(event) && event.created_at > ($kind0?.created_at || 0)) {
						$kind0 = event;
						kind0Ready.resolve(event);
					}
					if (isKind3(event) && event.created_at > ($kind3?.created_at || 0)) {
						$kind3 = event;
						kind3Ready.resolve(event);
					}
				}
				// Handle subscription updates here
			},
			{
				force: true
			}
		);

	$: profileSub =
		($kind10002 || $kind10019 || $kind3) &&
		useSharedSubscription(
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
		if (eventType == 'EOSE') return;
		const [event, ...context] = events;
		if (isKind0(event) && event.created_at > ($kind0?.created_at || 0)) $kind0 = event;
		if (isKind3(event) && event.created_at > ($kind3?.created_at || 0)) $kind3 = event;
	}

	// Watch for route changes
	onMount(() => {
		setViewport();
		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('resize', setViewport);

		if (localStorage.getItem('theme')) {
			let theme = localStorage.getItem('theme');
			document.getElementsByTagName('html')[0].setAttribute('data-theme', theme);
		}
		let mintSub = cashuManager.subscribe('quote_update', async ({ quoteId, state, mint, type }) => {
			if (type == 'mint') {
				if (state == 'paid') {
					const amount = await cashuManager.mintTokens(quoteId);
					const mintProofs = await cashuManager.getProofsFromMint(mint);
					saveNuts(mint, mintProofs);
					$mints.then((mints) => {
						const mintName = mints.find((m) => m.url == mint)?.name?.trim();
						go(`minted:${mintName}:${amount}`);
					});
				}
			} else {
				if (state == 'paid') {
					const meltProofs = await cashuManager.getProofsFromMint(mint);
					const meltQuote = await cashuManager.checkMeltQuoteState(quoteId);
					saveNuts(mint, meltProofs);
					$mints.then((mints) => {
						const mintName = mints.find((m) => m.url == mint)?.name?.trim();
						go(`melted:${mintName}:${meltQuote.amount}`);
					});
				}
			}
		});

		// Set up initial index based on route, but wait for scroller to be available
		const initializePositions = () => {
			if (!scroller || !scrollerWidth) {
				// If scroller isn't ready yet, try again in the next frame
				window.requestAnimationFrame(initializePositions);
				return;
			}
			function setPosition(index: number) {
				currentIndex = index;
				scrollPosition.set((currentIndex * scrollerWidth) / 2, { hard: true });
				xPosition.set(index * scrollerWidth, { hard: true });
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

		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('resize', setViewport);
			relaySub && relaySub();
			profileSub && profileSub();
			mintSub();
		};
	});

	$: homepage = $page.route.id == '/';

	function setViewport() {
		document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
		document.documentElement.style.setProperty(
			'--vw',
			`${document.documentElement.clientWidth * 0.01}px`
		);

		$dimensions.width = window.innerWidth;
		$dimensions.height = window.innerHeight;
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
		if (e.key == 'Escape') {
			goBack();
		} else if (e.key === 'ArrowLeft' && currentIndex > 0) {
			moveToIndex(currentIndex - 1);
		} else if (e.key === 'ArrowRight' && currentIndex < pages.length - 1) {
			moveToIndex(currentIndex + 1);
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
		const targetX = currentIndex * scrollerWidth;
		const targetScroll = (currentIndex * scrollerWidth) / 2;

		scrollPosition.set(targetScroll);
		xPosition.set(targetX);
	}

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		isSwiping = false;
		startXPosition = $xPosition;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!scroller) return;

		const touchCurrentX = e.touches[0].clientX;
		const touchCurrentY = e.touches[0].clientY;
		const deltaX = touchCurrentX - touchStartX;
		const deltaY = touchCurrentY - touchStartY;

		// Only consider horizontal swipes (more horizontal than vertical movement)
		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
			isSwiping = true;
			// Prevent all scrolling and default behavior
			e.preventDefault();
			e.stopPropagation();
			// Update xPosition with swipe movement
			xPosition.set(startXPosition - deltaX, { hard: true });
			scrollPosition.set((startXPosition - deltaX) / 2, { hard: true });
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!scroller || !isSwiping) return;

		const touchEndX = e.changedTouches[0].clientX;
		const deltaX = touchEndX - touchStartX;
		const containerWidth = scroller.offsetWidth;

		// Determine if we should move to next/previous page
		if (Math.abs(deltaX) > containerWidth / 3) {
			if (deltaX > 0 && currentIndex > 0) {
				// Swipe right - go to previous page
				moveToIndex(currentIndex - 1);
			} else if (deltaX < 0 && currentIndex < pages.length - 1) {
				// Swipe left - go to next page
				moveToIndex(currentIndex + 1);
			} else {
				// At boundary, snap back to current position
				xPosition.set(currentIndex * containerWidth);
			}
		} else {
			// Swipe wasn't far enough, snap back to current position
			xPosition.set(currentIndex * containerWidth);
			scrollPosition.set((currentIndex * containerWidth) / 2);
		}

		isSwiping = false;
	}

	$: transform0 = getTransformRatio(0, $xPosition, scrollerWidth);
	$: transform1 = getTransformRatio(1, $xPosition, scrollerWidth);
	$: transform2 = getTransformRatio(2, $xPosition, scrollerWidth);
</script>

<!-- <Debug /> -->
<ImageZoom />
{#if $isMobile && $page.url.pathname.split('/').length < 3}
	<div class="absolute w-full z-10 unsafe-padding-top">
		<div class="flex space-x-2">
			<div
				class="h-1 bg-white bg-opacity-30 w-1/3 rounded-full will-change-transform"
				style="transform: scaleY({transform0}); opacity: {transform0}"
			></div>
			<div
				class="h-1 bg-white bg-opacity-30 w-1/3 rounded-full will-change-transform"
				style="transform: scaleY({transform1}); opacity: {transform1}"
			></div>
			<div
				class="h-1 bg-white bg-opacity-30 w-1/3 rounded-full will-change-transform"
				style="transform: scaleY({transform2}); opacity: {transform2}"
			></div>
		</div>
	</div>
{/if}
{#if !homepage}
	<Statuses />
	<Alert />
	{#if $key?.pub}
		<div
			class="carousel-container flex gap-2"
			bind:this={scroller}
			on:touchstart={handleTouchStart}
			on:touchmove={handleTouchMove}
			on:touchend={handleTouchEnd}
			style="--transform0: {transform0}; --transform1: {transform1}; --transform2: {transform2}; --current-index: {currentIndex}; --is-mobile: {$isMobile
				? 1
				: 0};"
		>
			<!-- Home Section -->
			<div
				class="carousel-item w-[100vw] will-change-transform carousel-item-0"
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
						<Home visible={currentIndex == 0} />
					{/key}
				</div>
			</div>

			<!-- Explore Section -->
			<div
				class="carousel-item w-[100vw] h-full will-change-transform carousel-item-1"
				class:z-10={currentIndex == 1}
				on:click={(e) => {
					if (currentIndex != 1) {
						e.preventDefault();
						e.stopPropagation();
						moveToIndex(1);
					}
				}}
			>
				<div class="w-full h-full relative overflow-hidden">
					<Explore visible={currentIndex == 1} />
				</div>
			</div>

			<div
				class="carousel-item w-[100vw] h-full will-change-transform carousel-item-2"
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
					<Chat visible={currentIndex == 2} />
				</div>
			</div>

			<div class="w-[50vw]"></div>
		</div>

		<!-- Bottom Navigation -->
		<!-- <MobileNav activeIndex={activePageIndex} />
		<DesktopNav /> -->
		<!-- <Theme /> -->
	{:else}
		<Login />
	{/if}
{:else}
	<Landing />
{/if}

<style>
	.carousel-container {
		transform-style: preserve-3d;
		perspective: 1000px;
		backface-visibility: hidden;
		overflow: hidden;
		user-select: none;
		transform: translateZ(0);
	}

	.carousel-item-0 {
		transform: translate3d(0, 0, calc(var(--transform0) * (1 - var(--is-mobile)) * 10px))
			rotateY(
				calc((1 - var(--is-mobile)) * (1 - var(--transform0)) * (0 - var(--current-index)) * 30deg)
			)
			scale(calc(var(--is-mobile) + (1 - var(--is-mobile)) * var(--transform0)));
		opacity: calc(var(--is-mobile) + (1 - var(--is-mobile)) * var(--transform0));
		transform-origin: center center;
		contain: layout style paint;
		backface-visibility: hidden;
	}

	.carousel-item-1 {
		transform: translate3d(-50vw, 0, calc(var(--transform1) * (1 - var(--is-mobile)) * 10px))
			rotateY(
				calc((1 - var(--is-mobile)) * (1 - var(--transform1)) * (1 - var(--current-index)) * 30deg)
			)
			scale(calc(var(--is-mobile) + (1 - var(--is-mobile)) * var(--transform1)));
		opacity: calc(var(--is-mobile) + (1 - var(--is-mobile)) * var(--transform1));
		transform-origin: center center;
		contain: layout style paint;
		backface-visibility: hidden;
	}

	.carousel-item-2 {
		transform: translate3d(-100vw, 0, calc(var(--transform2) * (1 - var(--is-mobile)) * 10px))
			rotateY(
				calc((1 - var(--is-mobile)) * (1 - var(--transform2)) * (2 - var(--current-index)) * 30deg)
			)
			scale(calc(var(--is-mobile) + (1 - var(--is-mobile)) * var(--transform2)));
		opacity: calc(var(--is-mobile) + (1 - var(--is-mobile)) * var(--transform2));
		transform-origin: center center;
		contain: layout style paint;
		backface-visibility: hidden;
		padding-right: 500px;
	}

	.carousel-item {
		/* Remove CSS transitions to let spring handle all animations */
	}
</style>
