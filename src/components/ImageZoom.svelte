<script lang="ts">
	import Carousel from 'src/components/Carousel.svelte';
	import ImageZoomContext from 'src/components/ImageZoomContext.svelte';
	import { isMobile } from 'src/controller';
	import {
		context,
		links,
		note,
		zoomed,
		gridId,
		videoTime,
		sharedVideoElement,
		sharedVideoIndex,
		sharedVideoGridId
	} from 'src/controller/image';
	import Footer from 'src/routes/explore/_post/footer.svelte';
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';

	// Load media-chrome for zoom video controls
	onMount(async () => {
		await import('media-chrome');
	});

	import { swipeDismiss } from 'src/actions/swipeDismiss';

	// Toggle for showing the context sidebar
	let showContext: boolean = true;
	let videoEl: HTMLVideoElement;
	let carouselContainer: HTMLElement;
	let overlayEl: HTMLElement;
	let sharedVideoContainer: HTMLElement;
	let currentCarouselIndex: number = $zoomed ?? 0;

	let isDismissing = false;
	let currentDeltaY = 0;
	const DISMISS_DURATION = 300;

	$: console.log($zoomed);

	$: if (videoEl && $zoomed !== undefined) {
		videoEl.currentTime = $videoTime;
	}

	// Handle shared video element: move it into zoom when viewing the shared video index
	function handleSharedVideo(index: number) {
		currentCarouselIndex = index;

		if ($sharedVideoElement && sharedVideoContainer) {
			const isSharedIndex = index === $sharedVideoIndex;

			if (isSharedIndex) {
				// Move shared video into the zoom container (media-controller)
				// The video needs to be a direct child with slot="media" for media-chrome to work
				if ($sharedVideoElement.parentElement !== sharedVideoContainer) {
					// Ensure video has slot="media" attribute for media-chrome
					$sharedVideoElement.setAttribute('slot', 'media');
					sharedVideoContainer.appendChild($sharedVideoElement);
					// Update classes for zoom view - video sizes naturally to fit container, no overflow
					$sharedVideoElement.classList.remove('max-h-96', 'w-auto', 'object-contain');
					$sharedVideoElement.classList.add(
						'm-auto',
						'h-full',
						'max-w-full',
						'w-full',
						'rounded-lg',
						'object-contain'
					);
					// Ensure video continues playing and unmute
					if ($sharedVideoElement.paused) {
						$sharedVideoElement.play().catch(() => {});
					}
					$sharedVideoElement.muted = false;
				}
			}
		}
	}

	// Initial attach when zoom opens and container is ready
	$: if ($zoomed !== undefined && sharedVideoContainer && $sharedVideoElement) {
		handleSharedVideo($zoomed);
	}

	// Return shared video to its original location
	function returnSharedVideo() {
		if ($sharedVideoElement) {
			// Find the original VideoTile container by looking for the video element's slot
			// The VideoTile will handle re-attaching it when the store is cleared
			$sharedVideoElement = null;
			$sharedVideoIndex = -1;
			$sharedVideoGridId = '';
		}
	}

	// Handle carousel index change
	function onCarouselIndexChange(index: number) {
		handleSharedVideo(index);
	}

	function cleanupSharedVideo() {
		returnSharedVideo();
	}

	// Swipe dismiss handlers
	function handleSwipe(progress: number, deltaX: number, deltaY: number) {
		if (!carouselContainer) return;
		currentDeltaY = deltaY;
		// Apply real-time visual feedback
		const opacity = Math.max(0.3, 1 - Math.abs(deltaY) / window.innerHeight);
		carouselContainer.style.transform = `translateY(${deltaY}px)`;
		carouselContainer.style.opacity = String(opacity);
	}

	function animateDismiss(direction: number, fromY?: number) {
		if (!carouselContainer) return;

		isDismissing = true;
		if (overlayEl) overlayEl.style.pointerEvents = 'none';

		const distance = direction > 0 ? window.innerHeight : -window.innerHeight;
		const startY = fromY ?? currentDeltaY;
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
				{ transform: `translateY(${startY}px)`, opacity: 0.3 },
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
		currentDeltaY = 0;
	}

	function handleDismiss(deltaX: number, deltaY: number) {
		const direction = deltaY > 0 ? 1 : -1;
		animateDismiss(direction, deltaY);
	}

	function handleCancel() {
		animateCancel();
	}

	function closeZoom() {
		// Return shared video before closing
		cleanupSharedVideo();

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
			class="absolute m-safe top-4 left-4 z-30 rounded-full bg-black/40 backdrop-blur-sm p-2 text-white hover:bg-black/60 transition-colors"
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
			use:swipeDismiss={{
				direction: 'vertical',
				onSwipe: handleSwipe,
				onDismiss: handleDismiss,
				onCancel: handleCancel
			}}
		>
			<Carousel
				keyboardShortcut
				autoFocus
				items={$links}
				currentIndex={$zoomed}
				let:item
				let:index
				onClose={closeZoom}
				verticalPan={false}
				onIndexChange={onCarouselIndexChange}
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
					<!-- Video with full media controls in zoom mode - controls below video -->
					{#if $sharedVideoElement && index === $sharedVideoIndex}
						<!-- Shared video with controls - element moved here via handleSharedVideo -->
						<media-controller
							bind:this={sharedVideoContainer}
							class="m-auto h-full max-w-full w-full rounded-lg object-contain bg-transparent"
							class:!max-w-[95%]={!showContext && !$isMobile}
							style={$zoomed !== undefined ? `view-transition-name: image-zoom-${$gridId}-0` : ''}
							on:click|stopPropagation
						>
							<!-- Shared video element is moved here as a direct child with slot="media" -->

							<!-- Control bar with play, seek, time, mute - positioned below video -->
							<media-control-bar
								class="z-10 md:w-[50%] w-full m-auto bg-transparent p-2 pb-32 text-black"
								on:click|stopPropagation
							>
								<div class="flex items-center gap-4 w-full max-w-4xl mx-auto">
									<media-play-button
										class="bg-white/20 hover:bg-white/30 rounded-full text-white p-3 transition-colors"
										on:click|stopPropagation
									></media-play-button>
									<media-time-range class="flex-1 bg-transparent" on:click|stopPropagation
									></media-time-range>
									<media-time-display
										class="text-white/90 text-sm font-medium"
										show-duration
										on:click|stopPropagation
									></media-time-display>
									<media-mute-button
										class="bg-white/20 hover:bg-white/30 rounded-full text-white p-2 transition-colors"
										aria-label="Toggle mute"
										on:click|stopPropagation
									></media-mute-button>
								</div>
							</media-control-bar>
						</media-controller>
					{:else}
						<!-- Regular video element for non-shared videos with controls -->
						<media-controller
							class="m-auto w-auto max-h-[90vh] rounded-lg relative flex flex-col items-center justify-center bg-transparent"
							class:!max-w-[95%]={!showContext && !$isMobile}
							on:click|stopPropagation
						>
							<video
								bind:this={videoEl}
								slot="media"
								src={item?.src}
								autoplay
								playsinline
								class="object-contain"
								on:click|preventDefault|stopPropagation
							/>

							<!-- Control bar with play, seek, time, mute - positioned below video -->
							<media-control-bar class="z-10 w-full bg-transparent p-2" on:click|stopPropagation>
								<div class="flex items-center gap-4 w-full max-w-4xl mx-auto">
									<media-play-button
										class="bg-white/20 hover:bg-white/30 rounded-full text-white p-3 transition-colors"
										on:click|stopPropagation
									></media-play-button>
									<media-time-range class="flex-1 bg-transparent" on:click|stopPropagation
									></media-time-range>
									<media-time-display
										class="text-white/90 text-sm font-medium"
										show-duration
										on:click|stopPropagation
									></media-time-display>
									<media-mute-button
										class="bg-white/20 hover:bg-white/30 rounded-full text-white p-2 transition-colors"
										aria-label="Toggle mute"
										on:click|stopPropagation
									></media-mute-button>
								</div>
							</media-control-bar>
						</media-controller>
					{/if}
				{/if}
			</Carousel>
		</div>
		{#if $isMobile}
			<div class="fixed w-full bottom-0 pb-safe px-2 mb-4">
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
