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
	let overlayEl: HTMLElement;

	// Touch gesture state with axis-locking
	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;
	let isSwiping = false;
	let isVerticalGesture = false;
	let isHorizontalGesture = false;
	let currentDeltaY = 0;

	let isDismissing = false;

	const MIN_LOCK_MOVE = 10; // px before declaring axis
	const VERTICAL_ANGLE_DEG = 60; // >60° feels vertical, <30° feels horizontal
	const DISMISS_DURATION = 300;

	$: console.log($zoomed);

	$: if (videoEl && $zoomed !== undefined) {
		videoEl.currentTime = $videoTime;
	}

	function handleTouchStart(e: TouchEvent) {
		const t = e.touches[0];
		touchStartX = t.clientX;
		touchStartY = t.clientY;
		touchStartTime = Date.now();
		isSwiping = false;
		isVerticalGesture = false;
		isHorizontalGesture = false;
		currentDeltaY = 0;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!carouselContainer) return;

		const t = e.touches[0];
		const dx = t.clientX - touchStartX;
		const dy = t.clientY - touchStartY;
		const absX = Math.abs(dx);
		const absY = Math.abs(dy);

		// Decide axis lock once sufficient movement occurs
		if (!isVerticalGesture && !isHorizontalGesture) {
			if (absX < MIN_LOCK_MOVE && absY < MIN_LOCK_MOVE) {
				return; // not enough movement yet
			}
			const angleDeg = Math.atan2(absY, absX) * (180 / Math.PI);
			if (angleDeg >= VERTICAL_ANGLE_DEG) {
				isVerticalGesture = true;
			} else if (angleDeg <= 180 - VERTICAL_ANGLE_DEG) {
				// ~<=30° from horizontal axis -> treat as horizontal
				isHorizontalGesture = true;
			} else {
				// ambiguous band, wait for more movement
				return;
			}
		}

		// Let the Carousel handle horizontal gestures
		if (isHorizontalGesture) {
			return;
		}

		// Vertical gesture -> swipe-to-dismiss handling
		isSwiping = true;
		e.preventDefault();
		e.stopPropagation();
		currentDeltaY = dy;

		// Apply real-time visual feedback
		const opacity = Math.max(0.3, 1 - Math.abs(dy) / window.innerHeight);
		carouselContainer.style.transform = `translateY(${dy}px)`;
		carouselContainer.style.opacity = String(opacity);
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!carouselContainer) return;

		// Only handle vertical gestures
		if (isVerticalGesture) {
			const touchEndTime = Date.now();
			const deltaTime = touchEndTime - touchStartTime;

			// Calculate velocity in pixels per millisecond
			const velocity = currentDeltaY / deltaTime;

			// Trigger dismiss if swipe distance is more than 1/3 of viewport height
			// OR if velocity is high enough (> 0.5 px/ms) and minimum distance (50px)
			const distanceThreshold = Math.abs(currentDeltaY) > window.innerHeight / 3;
			const velocityThreshold = Math.abs(velocity) > 0.5 && Math.abs(currentDeltaY) > 50;

			if (isSwiping && (distanceThreshold || velocityThreshold)) {
				// Dismiss with animation
				const direction = currentDeltaY > 0 ? 1 : -1;
				animateDismiss(direction);
			} else {
				// Cancel swipe dismiss - animate back to original position
				animateCancel();
			}

			// We handled the vertical gesture; block bubbling to carousel
			e.stopPropagation();
		}

		// Reset touch states
		isSwiping = false;
		isVerticalGesture = false;
		isHorizontalGesture = false;
		currentDeltaY = 0;
	}

	function animateDismiss(direction: number) {
		if (!carouselContainer) return;

		isDismissing = true;
		if (overlayEl) overlayEl.style.pointerEvents = 'none';

		const distance = direction > 0 ? window.innerHeight : -window.innerHeight;
		const backdrop = overlayEl;

		if (backdrop) {
			backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
				duration: DISMISS_DURATION,
				easing: 'cubic-bezier(0.32, 0.72, 0.06, 1)',
				fill: 'forwards'
			});
		}

		carouselContainer.animate(
			[
				{ transform: `translateY(${currentDeltaY}px)`, opacity: 0.3 },
				{ transform: `translateY(${distance}px)`, opacity: 0 }
			],
			{ duration: DISMISS_DURATION, easing: 'cubic-bezier(0.32, 0.72, 0.06, 1)', fill: 'forwards' }
		);

		setTimeout(() => {
			closeZoom();
		}, DISMISS_DURATION);
	}

	function animateCancel() {
		if (!carouselContainer) return;

		carouselContainer.animate(
			[
				{
					transform: `translateY(${currentDeltaY}px)`,
					opacity: `${Math.max(0.3, 1 - Math.abs(currentDeltaY) / window.innerHeight)}`
				},
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
			isDismissing = false;
		};

		// Skip view transition during swipe-dismiss to avoid flash
		if (!isDismissing && (document as any).startViewTransition) {
			(document as any).startViewTransition(updateStore);
		} else {
			updateStore();
		}
	}

	// The links are already proxied when stored in the store from ImageGrid
</script>

{#if $zoomed !== undefined}
	<div
		class="z-20 fixed left-0 top-0 h-full w-full overflow-auto backdrop-blur-md flex"
		bind:this={overlayEl}
		in:fade={{ duration: 200 }}
		on:click|preventDefault|stopPropagation={closeZoom}
	>
		<button
			class="absolute top-4 left-4 z-30 rounded-full bg-black/40 backdrop-blur-sm p-2 text-white hover:bg-black/60 transition-colors"
			on:click|preventDefault|stopPropagation={closeZoom}
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
		<div
			bind:this={carouselContainer}
			class="flex-1 flex items-center justify-center w-full"
			on:touchstart|nonpassive={handleTouchStart}
			on:touchmove|nonpassive={handleTouchMove}
			on:touchend={handleTouchEnd}
		>
			<Carousel
				keyboardShortcut
				items={$links}
				currentIndex={$zoomed}
				let:item
				onClose={closeZoom}
				verticalPan={false}
			>
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
						playsinline
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
