<script lang="ts">
	import Carousel from 'src/components/Carousel.svelte';
	import ImageZoomContext from 'src/components/ImageZoomContext.svelte';
	import { isMobile } from 'src/controller';
	import { context, links, note, zoomed, gridId, videoTime } from 'src/controller/image';
	import Footer from 'src/routes/explore/_post/footer.svelte';
	import { fade } from 'svelte/transition';

	// Toggle for showing the context sidebar
	let showContext: boolean = true;
	let videoEl: HTMLVideoElement;
	let carouselContainer: HTMLElement;

	// Touch gesture state
	let touchStartY = 0;
	let touchStartTime = 0;
	let isSwiping = false;
	let isVerticalGesture = false;
	let currentDeltaY = 0;

	$: console.log($zoomed);

	$: if (videoEl && $zoomed !== undefined) {
		videoEl.currentTime = $videoTime;
	}

	function handleTouchStart(e: TouchEvent) {
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
		isSwiping = false;
		isVerticalGesture = false;
		currentDeltaY = 0;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!carouselContainer) return;

		const touchCurrentY = e.touches[0].clientY;
		const deltaY = touchCurrentY - touchStartY;
		const absDeltaY = Math.abs(deltaY);

		// Determine gesture direction only once
		if (!isVerticalGesture && !isSwiping) {
			// Need minimum movement to determine direction
			if (absDeltaY > 5) {
				isVerticalGesture = true;
			} else {
				return; // Not enough movement yet
			}
		}

		// Only handle vertical swipes
		if (isVerticalGesture && absDeltaY > 2) {
			isSwiping = true;
			e.preventDefault();
			e.stopPropagation();
			currentDeltaY = deltaY;

			// Apply real-time visual feedback
			const opacity = Math.max(0.3, 1 - Math.abs(deltaY) / window.innerHeight);
			carouselContainer.style.transform = `translateY(${deltaY}px)`;
			carouselContainer.style.opacity = String(opacity);
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!carouselContainer) return;

		// Only handle vertical gestures
		if (isVerticalGesture) {
			const touchEndTime = Date.now();
			const deltaTime = touchEndTime - touchStartTime;
			const containerHeight = window.innerHeight;

			// Calculate velocity in pixels per millisecond
			const velocity = currentDeltaY / deltaTime;

			// Trigger dismiss if swipe distance is more than 1/3 of viewport height
			// OR if velocity is high enough (> 0.5 px/ms) and minimum distance (50px)
			const distanceThreshold = Math.abs(currentDeltaY) > containerHeight / 3;
			const velocityThreshold = Math.abs(velocity) > 0.5 && Math.abs(currentDeltaY) > 50;

			if (isSwiping && (distanceThreshold || velocityThreshold)) {
				// Dismiss with animation
				const direction = currentDeltaY > 0 ? 1 : -1;
				animateDismiss(direction);
			} else {
				// Cancel swipe dismiss - animate back to original position
				animateCancel();
			}
		}

		// Reset touch states
		isSwiping = false;
		isVerticalGesture = false;
		currentDeltaY = 0;
	}

	function animateDismiss(direction: number) {
		if (!carouselContainer) return;

		const distance = direction > 0 ? window.innerHeight : -window.innerHeight;
		const backdrop = carouselContainer.parentElement;

		if (backdrop) {
			backdrop.animate(
				[{ opacity: 1 }, { opacity: 0 }],
				{ duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0.06, 1)' }
			);
		}

		carouselContainer.animate(
			[
				{ transform: `translateY(${currentDeltaY}px)`, opacity: 0.3 },
				{ transform: `translateY(${distance}px)`, opacity: 0 }
			],
			{ duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0.06, 1)' }
		);

		setTimeout(() => {
			closeZoom();
		}, 300);
	}

	function animateCancel() {
		if (!carouselContainer) return;

		carouselContainer.animate(
			[
				{ transform: `translateY(${currentDeltaY}px)`, opacity: `${Math.max(0.3, 1 - Math.abs(currentDeltaY) / window.innerHeight)}` },
				{ transform: 'translateY(0px)', opacity: '1' }
			],
			{ duration: 200, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
		);

		// Reset inline styles
		carouselContainer.style.transform = 'translateY(0px)';
		carouselContainer.style.opacity = '1';
	}

	function closeZoom() {
		const updateStore = () => {
			zoomed.set(undefined);
		};

		if (document.startViewTransition) {
			document.startViewTransition(updateStore);
		} else {
			updateStore();
		}
	}

	// The links are already proxied when stored in the store from ImageGrid
</script>

{#if $zoomed !== undefined}
	<div
		class="z-20 fixed left-0 top-0 h-full w-full overflow-auto backdrop-blur-md flex"
		transition:fade={{ duration: 200 }}
		on:click|preventDefault|stopPropagation={closeZoom}
	>
		<button
			class="absolute top-4 left-4 z-30 rounded-full bg-black/40 backdrop-blur-sm p-2 text-white hover:bg-black/60 transition-colors"
			on:click|preventDefault|stopPropagation={closeZoom}
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
		<div
			bind:this={carouselContainer}
			class="flex-1 flex items-center justify-center w-full"
			on:touchstart|stopPropagation={handleTouchStart}
			on:touchmove|stopPropagation={handleTouchMove}
			on:touchend|stopPropagation={handleTouchEnd}
		>
			<Carousel keyboardShortcut items={$links} currentIndex={$zoomed} let:item onClose={closeZoom}>
			{#if item.type === 'image'}
				<img
					class="m-auto h-full max-w-full w-full rounded-lg object-contain"
					class:max-w-[95%]={!showContext && !$isMobile}
					src={item?.src}
					on:click={(e) => e.stopPropagation()}
					style={$zoomed !== undefined ? `view-transition-name: image-zoom-${$gridId}-0` : ''}
				/>
			{:else}
				<video
					bind:this={videoEl}
					class="m-auto h-full max-w-full w-full rounded-lg object-contain"
					class:!max-w-[95%]={!showContext && !$isMobile}
					src={item?.src}
					on:click|preventDefault|stopPropagation
					autoplay
					controls
					style={$zoomed !== undefined ? `view-transition-name: image-zoom-${$gridId}-0` : ''}
				/>
			{/if}
		</Carousel>
		</div>
		{#if $isMobile}
			<div class="fixed w-full bottom-0 pb-safe px-2">
				<Footer note={$note} visible main />
			</div>
		{/if}
		<ImageZoomContext
			bind:showContext
			note={$note}
			context={$context}
			visible={$zoomed !== undefined}
		/>
	</div>
{/if}
