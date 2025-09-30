<script lang="ts">
	import 'src/app.css';

	import {
		Kind10002Parsed,
		Kind3Parsed,
		nipWorker,
		ParsedData,
		WorkerMessage,
		type RequestObject
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind0,
		asKind10002,
		asKind3,
		fbArray,
		isParsedEvent
	} from '@candypoets/nipworker/utils';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import Alert from 'src/components/Alert.svelte';
	import ImageZoom from 'src/components/ImageZoom.svelte';
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

	import { sendStatuses } from 'src/controller/sendStatus';
	import { CarouselAnimator } from 'src/lib/carousel/CarouselAnimator';
	import Landing from 'src/routes/+page.svelte';
	import Home from 'src/routes/home/+layout.svelte';
	import Explore from 'src/routes/explore/index.svelte';
	import Chat from 'src/routes/chat/index.svelte';
	import Login from 'src/routes/login.svelte';
	import { goBack } from 'src/routes/modals/modal';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	// Carousel configuration
	let scroller: HTMLElement;
	const pages = ['/home', '/explore', '/chat'];
	let currentIndex = 0;

	// Reactive variable for scroller width - use viewport width for touch calculations
	$: scrollerWidth = scroller?.clientWidth || $viewport.vw * 100;

	// Touch gesture variables
	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;
	let isSwiping = false;
	let isHorizontalGesture = false;
	let startXPosition = 0;

	// Create animator instance
	let carouselAnimator: CarouselAnimator;
	let carouselItems: HTMLElement[] = [];

	$: $key && $key.priv && nipWorker.setSigner('privkey', $key.priv);

	setupPagerAnimators($viewport, goBack);

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
			(message: WorkerMessage) => {
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
		);

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

		// Set up initial index based on route, but wait for scroller to be available
		const initializePositions = () => {
			if (!scroller || !scrollerWidth) {
				// If scroller isn't ready yet, try again in the next frame
				window.requestAnimationFrame(initializePositions);
				return;
			}

			// Initialize carousel animator
			carouselAnimator = new CarouselAnimator(scrollerWidth);
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

			function setPosition(index: number) {
				currentIndex = index;
				carouselAnimator.setCurrentIndex(currentIndex);
				const initialX = currentIndex * scrollerWidth;
				// Initialize without animation to set tracked states
				carouselAnimator.animateToPosition(initialX, 0, $isMobile); // No duration for initial position
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

	// Handle keyboard navigation (Alt + Left/Right)
	function handleKeydown(e: KeyboardEvent) {
		if (e.key == 'Escape') {
			$pagerAnimator?.goBack();
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
		currentIndex = index;

		// Use Web Animations API for smooth transition
		if (carouselAnimator) {
			carouselAnimator.setCurrentIndex(currentIndex);
			const targetX = currentIndex * scrollerWidth;
			carouselAnimator.animateToPosition(targetX, 400, $isMobile);
		}

		goto(pages[index]);
	}

	// Touch handling with RAF
	let virtualXPosition = 0;

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
		isSwiping = false;
		isHorizontalGesture = false;

		// Cancel any ongoing animations to allow immediate touch control
		// This will capture the current animated state for smooth transitions
		if (carouselAnimator) {
			carouselAnimator.cancelAllAnimations();
		}

		// Set virtual position based on current index after animations are cancelled
		virtualXPosition = currentIndex * scrollerWidth;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!scroller || !carouselAnimator) return;

		const touchCurrentX = e.touches[0].clientX;
		const touchCurrentY = e.touches[0].clientY;
		const deltaX = touchCurrentX - touchStartX;
		const deltaY = touchCurrentY - touchStartY;

		// Determine gesture direction only once
		if (!isHorizontalGesture && !isSwiping) {
			const absDeltaX = Math.abs(deltaX);
			const absDeltaY = Math.abs(deltaY);

			// Need minimum movement to determine direction
			if (absDeltaX > 10 || absDeltaY > 10) {
				isHorizontalGesture = absDeltaX > absDeltaY;

				// If it's vertical, don't interfere with scrolling
				if (!isHorizontalGesture) {
					return;
				}
			} else {
				return; // Not enough movement yet
			}
		}

		// Only handle horizontal gestures
		if (isHorizontalGesture && Math.abs(deltaX) > 5) {
			isSwiping = true;
			e.preventDefault();
			e.stopPropagation();

			// Add boundary constraints - prevent dragging beyond limits
			let constrainedDeltaX = deltaX;
			const maxDeltaX = currentIndex * scrollerWidth; // Can't drag right beyond first item
			const minDeltaX = -(pages.length - 1 - currentIndex) * scrollerWidth; // Can't drag left beyond last item

			if (deltaX > maxDeltaX) {
				constrainedDeltaX = maxDeltaX + (deltaX - maxDeltaX) * 0.3; // Rubber band effect
			} else if (deltaX < minDeltaX) {
				constrainedDeltaX = minDeltaX + (deltaX - minDeltaX) * 0.3; // Rubber band effect
			}

			// Update virtual position and use RAF for immediate response
			virtualXPosition = currentIndex * scrollerWidth - constrainedDeltaX;
			carouselAnimator.trackTouchPosition(virtualXPosition, $isMobile);
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!scroller || !carouselAnimator) return;

		// Always animate back to a stable position, even if not swiping
		if (isHorizontalGesture) {
			const touchEndX = e.changedTouches[0].clientX;
			const deltaX = touchEndX - touchStartX;
			const containerWidth = scroller.offsetWidth;
			const velocity = Math.abs(deltaX) / (Date.now() - touchStartTime);

			// Determine target index based on distance and velocity
			let targetIndex = currentIndex;
			const threshold = containerWidth / 3;
			const velocityThreshold = 0.5; // pixels per millisecond

			if (isSwiping && (Math.abs(deltaX) > threshold || velocity > velocityThreshold)) {
				if (deltaX > 0 && currentIndex > 0) {
					targetIndex = currentIndex - 1;
				} else if (deltaX < 0 && currentIndex < pages.length - 1) {
					targetIndex = currentIndex + 1;
				}
			}

			// Always animate to target position with smooth transition
			const targetX = targetIndex * scrollerWidth;
			carouselAnimator.setCurrentIndex(targetIndex);
			carouselAnimator.animateToPosition(targetX, 300, $isMobile);

			if (targetIndex !== currentIndex) {
				currentIndex = targetIndex;
				goto(pages[targetIndex]);
			}
		}

		// Reset all touch states
		isSwiping = false;
		isHorizontalGesture = false;
	}

	// Progress bar animation using transform ratio
	$: if (scrollerWidth) {
		// Update progress bars
		const progressBars = document.querySelectorAll('.progress-bar');
		progressBars.forEach((bar, index) => {
			const ratio = CarouselAnimator.getTransformRatio(
				index,
				currentIndex * scrollerWidth,
				scrollerWidth
			);
			(bar as HTMLElement).style.transform = `scaleY(${ratio})`;
			(bar as HTMLElement).style.opacity = ratio.toString();
		});
	}
</script>

<!-- <Debug /> -->
<ImageZoom />
{#if $isMobile && $page.url.pathname.split('/').length < 3}
	<div class="absolute w-full z-10 unsafe-padding-top">
		<div class="flex space-x-2">
			<div
				class="h-1 bg-white bg-opacity-30 w-1/3 rounded-full will-change-transform progress-bar"
			></div>
			<div
				class="h-1 bg-white bg-opacity-30 w-1/3 rounded-full will-change-transform progress-bar"
			></div>
			<div
				class="h-1 bg-white bg-opacity-30 w-1/3 rounded-full will-change-transform progress-bar"
			></div>
		</div>
	</div>
{/if}
{#if !homepage}
	{#each Object.entries($sendStatuses) as [sendId, connectionStatus]}
		{#if connectionStatus}
			<Statuses {connectionStatus} />
		{/if}
	{/each}
	<Alert />
	{#if $key?.pub}
		<div
			class="carousel-container"
			bind:this={scroller}
			on:touchstart={handleTouchStart}
			on:touchmove={handleTouchMove}
			on:touchend={handleTouchEnd}
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
						<Home visible={!$isMobile || currentIndex == 0} />
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
					<Explore visible={!$isMobile || currentIndex == 1} />
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
					<Chat visible={!$isMobile || currentIndex == 2} />
				</div>
			</div>
		</div>
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
