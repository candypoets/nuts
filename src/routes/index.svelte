<script lang="ts">
	import 'src/app.css';

	import {
		Kind10002Parsed,
		Kind3Parsed,
		manager,
		ParsedData,
		WorkerMessage,
		type RequestObject
	} from '@candypoets/nipworker';
	import { go } from 'src/routes/modals/modal';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind10002,
		asKind3,
		ConnectionTracker,
		fbArray,
		isConnectionStatus,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import Alert from 'src/components/Alert.svelte';
	import Statuses from 'src/components/Statuses.svelte';
	import { key } from 'src/controller';
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
	import { pagerAnimator, setupPagerAnimators } from 'src/controller/pager';
	import { isMobile, viewport } from 'src/controller/viewport';

	import { carouselAnimator } from 'src/controller/carrousel';
	import { sendStatuses } from 'src/controller/sendStatus';
	import { CarouselAnimator } from 'src/lib/carousel/CarouselAnimator';
	import Landing from 'src/routes/+page.svelte';
	import Chat from 'src/routes/chat/index.svelte';
	import Explore from 'src/routes/explore/index.svelte';
	import Home from 'src/routes/home/+layout.svelte';
	import { goBack } from 'src/routes/modals/modal';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	// Carousel configuration
	let scroller: HTMLElement;

	// Reactive variable for scroller width - use viewport width for touch calculations
	$: scrollerWidth = scroller?.clientWidth || $viewport.vw * 100;

	let carouselItems: HTMLElement[] = [];

	let progressContainer: HTMLDivElement | null = null;

	$: $key && $key.priv && manager.setSigner('privkey', $key.priv);

	setupPagerAnimators($viewport, goBack);

	const connectionTracker = new ConnectionTracker();

	$: $key &&
		$key.pub &&
		useSubscription(
			'relays',
			[
				{
					kinds: [10019, 10002],
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es']
					// noOptimize: true
				},
				{
					kinds: [3, 0], // 0 and 3 are here if found immdiately, but refetched after
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es']
					// noOptimize: true,
					// cacheFirst: true
				}
			],
			handleRelayEvents
		);

	function handleRelayEvents(message: WorkerMessage) {
		const status = isConnectionStatus(message);
		if (status) {
			connectionTracker.handleMessage(message);
			if (connectionTracker.resolutionRate > 0.5) {
				kind3Ready.resolve($kind3);
			}
		}
		const parsedEvent = isParsedEvent(message);
		if (parsedEvent) {
			switch (parsedEvent.parsedType()) {
				case ParsedData.Kind0Parsed:
					$kind0 = parsedEvent;
					kind0Ready.resolve(parsedEvent);
					break;
				case ParsedData.Kind3Parsed:
					$kind3 = parsedEvent;
					kind3Ready.resolve(parsedEvent);
					break;
				case ParsedData.Kind10002Parsed:
					if (parsedEvent.createdAt() > ($kind10002?.createdAt() || 0)) {
						$kind10002 = parsedEvent;
						kind10002Ready.resolve(parsedEvent);
					}
					break;
				case ParsedData.Kind10019Parsed:
					if (parsedEvent.createdAt() > ($kind10019?.createdAt() || 0)) {
						$kind10019 = parsedEvent;
						kind10019Ready.resolve(parsedEvent);
					}
					break;
			}
		}
	}

	$: profileSub =
		$kind10002 &&
		$kind3 &&
		useSubscription(
			'profile',
			[
				$kind10002 && {
					kinds: [0, 3],
					authors: [$key?.pub],
					relays: fbArray(asKind10002($kind10002) as Kind10002Parsed, 'relays')
						?.filter((r) => r.write())
						.map((r) => r.url()?.toString()),
					noOptimize: true
				},
				$kind3 && {
					kinds: [10002],
					authors: fbArray(asKind3($kind3) as Kind3Parsed, 'contacts')?.map((p) =>
						p.pubkey()?.toString()
					),
					relays: ['wss://relay.nostr.band', 'wss://purplepag.es'],
					noOptimize: true
				}
			].filter((r) => !!r) as RequestObject[],
			handleProfileEvents
		);

	function handleProfileEvents(message: WorkerMessage) {
		const parsedEvent = isParsedEvent(message);
		if (parsedEvent) {
			switch (parsedEvent.parsedType()) {
				case ParsedData.Kind0Parsed:
					if (parsedEvent.createdAt() > ($kind0?.createdAt() || 0)) $kind0 = parsedEvent;
					break;

				case ParsedData.Kind3Parsed:
					if (parsedEvent.createdAt() > ($kind3?.createdAt() || 0)) $kind3 = parsedEvent;
					break;
			}
		}
	}

	// Watch for route changes
	onMount(() => {
		window.addEventListener('keydown', handleKeydown);

		if (localStorage.getItem('theme')) {
			let theme = localStorage.getItem('theme');
			document.getElementsByTagName('html')[0].setAttribute('data-theme', theme);
		}

		// carouselAnimator.setMobileMode($isMobile);

		if (progressContainer) {
			carouselAnimator.setProgressContainer(progressContainer);
		}

		// Set up initial index based on route, but wait for scroller to be available
		const initializePositions = () => {
			if (!scroller || !scrollerWidth) {
				// If scroller isn't ready yet, try again in the next frame
				window.requestAnimationFrame(initializePositions);
				return;
			}

			// Initialize carousel animator
			// carouselAnimator = new CarouselAnimator(scrollerWidth);
			carouselAnimator.updateScrollerWidth(scrollerWidth);
			carouselItems = Array.from(scroller.querySelectorAll('.carousel-item'));
			carouselAnimator.setItems(carouselItems);

			// Initialize all items with proper positioning
			carouselItems.forEach((item, index) => {
				const ratio = CarouselAnimator.getTransformRatio(index, 0, scrollerWidth);
				const transform = $isMobile
					? `translateX(${index * 100}vw) translateY(0)`
					: `translateX(${index * 50}vw) translateY(0) translateZ(${ratio * 10}px) rotateY(${
							(1 - ratio) * index * 30
						}deg) scale(${ratio})`;
				const opacity = $isMobile ? '1' : ratio.toString();
				item.style.transform = transform;
				item.style.opacity = opacity;
			});

			// function setPosition(index: number) {
			// 	currentIndex = index;
			// 	carouselAnimator.setCurrentIndex(currentIndex);
			// 	const initialX = currentIndex * scrollerWidth;
			// 	// Initialize without animation to set tracked states
			// 	carouselAnimator.animateToPosition(initialX, 0, $isMobile); // No duration for initial position
			// }

			// Determine the index based on the current route
			if ($page.url.pathname.startsWith('/chat')) {
				carouselAnimator.setPage(2, $page.url.pathname);
				carouselAnimator.moveToIndex(2, 0);
			} else if ($page.url.pathname.startsWith('/explore')) {
				carouselAnimator.setPage(1, $page.url.pathname);
				carouselAnimator.moveToIndex(1, 0);
			} else if ($page.url.pathname.startsWith('/home')) {
				carouselAnimator.setPage(0, $page.url.pathname);
				carouselAnimator.moveToIndex(0, 0);
			}
		};

		// Start the initialization process
		initializePositions();

		return () => {
			window.removeEventListener('keydown', handleKeydown);
			// relaySub && relaySub();
			profileSub && profileSub();

			// Clean up carousel animations
			if (carouselAnimator) {
				carouselAnimator.cancelAllAnimations();
			}
		};
	});

	$: homepage = $page.route.id == '/';

	// Update animator when scroller width changes
	$: if (carouselAnimator && scrollerWidth) {
		carouselAnimator.updateScrollerWidth(scrollerWidth);
	}

	$: currentIndex = carouselAnimator?.currentIndex || 0;

	// Handle keyboard navigation (Alt + Left/Right)
	function handleKeydown(e: KeyboardEvent) {
		if (e.key == 'Escape') {
			$pagerAnimator?.goBack();
		} else if (e.key === 'ArrowLeft') {
			carouselAnimator.moveLeft();
		} else if (e.key === 'ArrowRight') {
			carouselAnimator.moveRight();
		} else if (e.metaKey && e.key === 'k') {
			e.preventDefault();
			go('cmdk');
		} else if (e.metaKey && e.key === 'p') {
			e.preventDefault();
			go('post');
		} else if (e.metaKey && e.key === 'y') {
			e.preventDefault();
			go('theme');
		}
	}

	// Touch handling with RAF
	let virtualXPosition = 0;

	function handleTouchStart(e: TouchEvent) {
		carouselAnimator?.handleTouchStart(e);
	}

	function handleTouchMove(e: TouchEvent) {
		carouselAnimator?.handleTouchMove(e, $isMobile);
	}

	function handleTouchEnd(e: TouchEvent) {
		carouselAnimator?.handleTouchEnd(e, $isMobile);
	}

	// Progress bar animation using transform ratio
	// $: if (scrollerWidth) {
	// 	// Update progress bars
	// 	const progressBars = document.querySelectorAll('.progress-bar');
	// 	progressBars.forEach((bar, index) => {
	// 		const ratio = CarouselAnimator.getTransformRatio(
	// 			index,
	// 			carouselAnimator.currentIndex * scrollerWidth,
	// 			scrollerWidth
	// 		);
	// 		(bar as HTMLElement).style.transform = `scaleY(${ratio})`;
	// 		(bar as HTMLElement).style.transform = `scaleX(${ratio})`;
	// 		(bar as HTMLElement).style.opacity = ratio.toString();
	// 	});
	// }
</script>

<!-- <Debug /> -->
<!-- <ImageZoom /> -->

<div
	class="absolute w-full z-10 unsafe-padding-top margin-auto"
	class:opacity-0={!($isMobile && $page.url.pathname.split('/').length < 3)}
>
	<!-- Empty container; CarouselAnimator will populate bars -->
	<div class="flex space-x-2 w-1/2 m-auto" bind:this={progressContainer}></div>
</div>
<!-- {/if} -->
{#if !homepage}
	{#each Object.entries($sendStatuses) as [sendId, connectionStatus]}
		{#if connectionStatus}
			<Statuses {connectionStatus} />
		{/if}
	{/each}
	<Alert />
	<!-- {#if $key?.pub} -->
	<div
		class="carousel-container"
		bind:this={scroller}
		on:touchstart={handleTouchStart}
		on:touchmove={handleTouchMove}
		on:touchend={handleTouchEnd}
	>
		<!-- Home Section -->
		<div class="carousel-item w-[100vw] will-change-transform carousel-item-0">
			<div class="w-full relative overflow-hidden">
				<Home visible={!$isMobile || $currentIndex == 0} />
			</div>
		</div>

		<!-- Explore Section -->
		<div class="carousel-item w-[100vw] h-full will-change-transform carousel-item-1">
			<div class="w-full h-full relative overflow-hidden">
				<Explore visible={!$isMobile || $currentIndex == 1} />
			</div>
		</div>

		<div class="carousel-item w-[100vw] h-full will-change-transform carousel-item-2">
			<div class="w-full h-screen relative overflow-hidden">
				<Chat visible={!$isMobile || $currentIndex == 2} />
			</div>
		</div>
	</div>
	<!-- {:else}
		<Login /> -->
	<!-- {/if} -->
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
		position: relative;
		height: 100vh;
		width: 100vw;
	}

	.carousel-item-0,
	.carousel-item-1,
	.carousel-item-2 {
		transform-origin: center center;
		contain: layout style paint;
		backface-visibility: hidden;
		position: absolute;
		top: 0;
		left: 0;
		height: 100vh;
		width: 100vw;
	}

	/* .carousel-item-2 {
		padding-right: 500px;
	} */

	.carousel-item {
		/* Animations handled by Web Animations API */
	}
</style>
