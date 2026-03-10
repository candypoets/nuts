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
	import { onMount, tick } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import Alert from 'src/components/Alert.svelte';
	import Statuses from 'src/components/Statuses.svelte';
	import { key } from 'src/controller';
	import {
		kind0,
		kind0Ready,
		kind10000,
		kind10000Ready,
		kind10002,
		kind10002Ready,
		kind10019,
		kind10019Ready,
		kind10063,
		kind10063Ready,
		kind10096,
		kind10096Ready,
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
	import { goBack as goBackRouter, goToRoot as goToRootRouter } from 'src/routes/modals/modal';

	$: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';

	// Carousel configuration
	let scroller: HTMLElement;

	// Reactive variable for scroller width - use viewport width for touch calculations
	$: scrollerWidth = scroller?.clientWidth || $viewport.vw * 100;

	let carouselItems: HTMLElement[] = [];
	let carouselInitialized = false;

	let progressContainer: HTMLDivElement | null = null;

	// $: $key && $key.priv && manager.setSigner('privkey', $key.priv);
	//
	manager.addEventListener('auth', (event) => {
		$key.pub = event.detail.pubkey;
		$key.hasSigner = event.detail.hasSigner;
	});

	setupPagerAnimators($viewport, goBackRouter, goToRootRouter);

	const connectionTracker = new ConnectionTracker();

	$: $key &&
		$key.pub &&
		useSubscription(
			'relays_' + $key?.pub,
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
				},
				{
					kinds: [10000], // mute list
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es']
				},
				{
					kinds: [10063], // Blossom servers
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es']
				},
				{
					kinds: [10096], // NIP-96 file storage servers
					authors: [$key.pub],
					relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es']
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
				case ParsedData.ListParsed:
					// Handle NIP-51 lists (including kind 10000 mute list)
					if (parsedEvent.kind() === 10000) {
						if (parsedEvent.createdAt() > ($kind10000?.createdAt() || 0)) {
							$kind10000 = parsedEvent;
							kind10000Ready.resolve(parsedEvent);
						}
					}
					break;
			}

			// Handle file storage server events (kind 10063 = Blossom, kind 10096 = NIP-96)
			// These are parsed as generic events, not specific types
			if (parsedEvent.kind() === 10063) {
				if (parsedEvent.createdAt() > ($kind10063?.createdAt() || 0)) {
					$kind10063 = parsedEvent;
					kind10063Ready.resolve(parsedEvent);
				}
			} else if (parsedEvent.kind() === 10096) {
				if (parsedEvent.createdAt() > ($kind10096?.createdAt() || 0)) {
					$kind10096 = parsedEvent;
					kind10096Ready.resolve(parsedEvent);
				}
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
						.map((r) => r.url()),
					noOptimize: true
				},
				$kind10002 && {
					kinds: [10000], // mute list from user's write relays
					authors: [$key?.pub],
					relays: fbArray(asKind10002($kind10002) as Kind10002Parsed, 'relays')
						?.filter((r) => r.write())
						.map((r) => r.url()),
					noOptimize: true
				},
				$kind3 && {
					kinds: [10002],
					authors: fbArray(asKind3($kind3) as Kind3Parsed, 'contacts')?.map((p) =>
						p.pubkey()
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

				case ParsedData.ListParsed:
					// Handle NIP-51 lists (including kind 10000 mute list)
					if (parsedEvent.kind() === 10000) {
						if (parsedEvent.createdAt() > ($kind10000?.createdAt() || 0)) {
							$kind10000 = parsedEvent;
							kind10000Ready.resolve(parsedEvent);
						}
					}
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
			const activeRoutes = carouselAnimator.getActiveRoutes();
			const currentIdx = activeRoutes.findIndex((r) => $page.url.pathname.startsWith(r.route));
			carouselItems.forEach((item, index) => {
				const ratio = CarouselAnimator.getTransformRatio(index, currentIdx);
				const direction = index - currentIdx;
				const transform = $isMobile
					? `translateX(${direction * 100}vw) translateY(0)`
					: `translateX(${direction * 50}vw) translateY(0) translateZ(${ratio * 10}px) rotateY(${
							(1 - ratio) * direction * 30
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

			// Initialize carousel position based on current route
			const initialIndex = activeRoutes.findIndex((r) => $page.url.pathname.startsWith(r.route));
			if (initialIndex >= 0) {
				carouselAnimator.syncToUrl($page.url.pathname, 0, $isMobile);
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

	// Re-initialize carousel when it becomes visible (navigating from homepage)
	$: if (!homepage && scroller && !carouselInitialized) {
		carouselInitialized = true;
		// Wait for DOM to update with carousel items
		tick().then(() => {
			if (!scroller) return;

			carouselItems = Array.from(scroller.querySelectorAll('.carousel-item'));
			if (carouselItems.length === 0) {
				carouselInitialized = false;
				return;
			}

			carouselAnimator.updateScrollerWidth(scrollerWidth);
			carouselAnimator.setItems(carouselItems);

			// Initialize all items with proper positioning
			const activeRoutes = carouselAnimator.getActiveRoutes();
			const currentIdx = activeRoutes.findIndex((r) => $page.url.pathname.startsWith(r.route));
			carouselItems.forEach((item, index) => {
				const ratio = CarouselAnimator.getTransformRatio(index, currentIdx);
				const direction = index - currentIdx;
				const transform = $isMobile
					? `translateX(${direction * 100}vw) translateY(0)`
					: `translateX(${direction * 50}vw) translateY(0) translateZ(${ratio * 10}px) rotateY(${
							(1 - ratio) * direction * 30
						}deg) scale(${ratio})`;
				const opacity = $isMobile ? '1' : ratio.toString();
				item.style.transform = transform;
				item.style.opacity = opacity;
			});

			// Sync to current URL
			carouselAnimator.syncToUrl($page.url.pathname, 0, $isMobile);
		});
	}

	// Reset initialization flag when returning to homepage
	$: if (homepage) {
		carouselInitialized = false;
	}

	// Update animator when scroller width changes
	$: if (carouselAnimator && scrollerWidth) {
		carouselAnimator.updateScrollerWidth(scrollerWidth);
	}

	// Sync carousel to URL changes (browser back/forward, external navigation)
	$: carouselAnimator.syncToUrl($page.url.pathname, 300, $isMobile);

	// Get store references for reactive access
	const currentIndexStore = carouselAnimator.currentIndex;
	const overviewModeStore = carouselAnimator.overviewMode;

	// Handle keyboard navigation
	function handleKeydown(e: KeyboardEvent) {
		if (e.key == 'Escape') {
			const pathname = $page.url.pathname;
			// Split path and filter out empty strings (leading/trailing slashes)
			const pathParts = pathname.split('/').filter(Boolean);

			if (pathParts.length >= 2) {
				// On a subpath (e.g., /explore/notifications), go back to parent
				$pagerAnimator?.goBack();
			}
			// else {
			//	// At root of a section (e.g., /explore), toggle overview mode
			//	carouselAnimator.toggleOverviewMode(500, $isMobile);
			// }
		} else if (e.key === 'ArrowLeft') {
			if ($overviewModeStore) {
				// In overview mode, arrow keys do nothing (or could navigate selection)
				return;
			}
			carouselAnimator.navigateLeft();
		} else if (e.key === 'ArrowRight') {
			if ($overviewModeStore) {
				return;
			}
			carouselAnimator.navigateRight();
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

	// Feed management
	function handleDeleteFeed(index: number, e: Event) {
		e.stopPropagation();
		carouselAnimator.deleteRoute(index, $isMobile);
	}

	function handleSelectFeedInOverview(index: number) {
		carouselAnimator.selectRouteInOverview(index, 400, $isMobile);
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
		style:z-index={$overviewModeStore ? 40 : undefined}
		bind:this={scroller}
		on:touchstart={handleTouchStart}
		on:touchmove={handleTouchMove}
		on:touchend={handleTouchEnd}
	>
		<!-- {#key $key?.pub} -->
		<!-- Dynamic Feed Sections -->
		{#each carouselAnimator.getActiveRoutes() as feed, index (feed.id)}
			<div
				class="carousel-item w-[100vw] h-full will-change-transform carousel-item-{index}"
				class:pointer-events-none={$overviewModeStore}
				on:click={() => $overviewModeStore && handleSelectFeedInOverview(index)}
			>
				{#if $overviewModeStore}
					<button
						class="absolute top-4 right-4 z-50 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
						on:click={(e) => handleDeleteFeed(index, e)}
						disabled={carouselAnimator.getActiveRoutes().length <= 1}
						title="Delete feed"
					>
						×
					</button>
				{/if}
				<div class="w-full h-full relative overflow-hidden">
					{#if feed.id === 'home'}
						<Home visible={!$isMobile || $currentIndexStore == index} />
					{:else if feed.id === 'explore'}
						<Explore visible={!$isMobile || $currentIndexStore == index} />
					{:else if feed.id === 'chat'}
						<Chat visible={!$isMobile || $currentIndexStore == index} />
					{/if}
				</div>
			</div>
		{/each}
		<!-- {/key} -->
	</div>

	<!-- Overview Mode Backdrop (behind feeds) -->
	{#if $overviewModeStore}
		<div
			class="fixed inset-0 z-30 bg-black/30 transition-opacity"
			on:click={() => carouselAnimator.exitOverviewMode(400, $isMobile)}
		/>

		<!-- Header (above feeds) -->
		<div
			class="fixed top-0 left-0 right-0 z-50 p-4 flex justify-between items-center pointer-events-none"
		>
			<h2 class="text-white text-lg font-semibold">Manage Feeds</h2>
			<button
				class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors pointer-events-auto"
				on:click={() => carouselAnimator.exitOverviewMode(400, $isMobile)}
			>
				Done
			</button>
		</div>

		<!-- Instructions (above feeds) -->
		<div class="fixed bottom-8 left-0 right-0 z-50 text-center pointer-events-none">
			<p class="text-white/60 text-sm">
				Click a feed to select it • Click × to delete • At least one feed required
			</p>
		</div>
	{/if}
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

	.carousel-item {
		transform-origin: center center;
		contain: layout style;
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

	/* Overview mode styles */
	:global(.carousel-item) {
		transition: cursor 0.2s ease;
	}

	:global(.overview-mode .carousel-item) {
		cursor: pointer;
	}

	:global(.overview-mode .carousel-item:hover) {
		filter: brightness(1.1);
	}

	:global(.overview-mode .carousel-item button) {
		cursor: pointer;
	}

	:global(.overview-mode .carousel-item button:disabled) {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Ensure delete buttons are clickable in overview mode */
	.carousel-item button {
		pointer-events: auto;
	}
</style>
