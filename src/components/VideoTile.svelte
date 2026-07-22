<script lang="ts">
	import { afterUpdate, onDestroy, onMount } from 'svelte';
	import { sharedVideoElement, sharedVideoIndex, sharedVideoGridId } from 'src/controller/image';
	import { registerVideo } from 'src/controller/videoPlayback';

	export let src: string;
	export let poster: string | undefined = undefined;
	export let autoplay = true;
	export let loop = true;
	export let muted = true;
	export let fullWidth = false;
	export let className = '';
	export let onClick: (e: MouseEvent) => void = () => {};
	export let videoElement: HTMLVideoElement | undefined = undefined;
	export let index: number = 0;
	export let gridId: string = '';

	// Container reference to re-attach video when returned
	let containerEl: HTMLElement;
	let sharedElement: HTMLVideoElement | null = null;
	let playbackRegistration: ReturnType<typeof registerVideo> | undefined;
	const unsubscribeSharedVideo = sharedVideoElement.subscribe((element) => {
		sharedElement = element;
	});

	// Time tracking for display
	let currentTime = 0;
	let duration = 0;

	// Media Chrome are web components; load on client to avoid SSR issues.
	onMount(async () => {
		if (videoElement) playbackRegistration = registerVideo(videoElement, () => autoplay);
		await import('media-chrome'); // npm i media-chrome
	});

	function isSharedVideo() {
		return !!sharedElement && sharedElement === videoElement;
	}

	// Re-attach video element when it's returned from zoom
	afterUpdate(() => {
		playbackRegistration?.refresh();
		if (!videoElement || !containerEl || isSharedVideo()) return;
		// If the video element is not attached to this media-controller, move it back
		if (videoElement.parentElement !== containerEl) {
			// The video needs slot="media" to be recognized by media-controller
			videoElement.setAttribute('slot', 'media');
			containerEl.appendChild(videoElement);
			// Restore original grid classes
			videoElement.className = fullWidth
				? 'h-full max-h-96 w-full object-contain'
				: 'max-h-96 w-auto object-contain';
		}
	});

	onDestroy(() => {
		unsubscribeSharedVideo();
		playbackRegistration?.unregister();
	});

	// Update time display
	function updateTime() {
		if (videoElement) {
			currentTime = videoElement.currentTime;
			duration = videoElement.duration || 0;
		}
	}

	// Format time remaining
	$: timeRemaining = Math.max(0, duration - currentTime);
	$: secondsRemaining = Math.ceil(timeRemaining);

	// Avoid triggering overlay while scrolling on touch devices.
	let startX = 0;
	let startY = 0;
	let isTouchTap = false;
	let suppressNextClick = false;
	const TAP_MOVE_THRESHOLD = 10; // px

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType === 'touch' || e.pointerType === 'pen') {
			isTouchTap = true;
			startX = e.clientX;
			startY = e.clientY;
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!isTouchTap) return;
		const dx = Math.abs(e.clientX - startX);
		const dy = Math.abs(e.clientY - startY);
		if (dx > TAP_MOVE_THRESHOLD || dy > TAP_MOVE_THRESHOLD) {
			isTouchTap = false;
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (isTouchTap) {
			suppressNextClick = true;
			onClick(e as unknown as MouseEvent);
			queueMicrotask(() => (suppressNextClick = false));
		}
		isTouchTap = false;
	}

	function onOverlayClick(e: MouseEvent) {
		if (suppressNextClick) return;
		onClick(e);
	}
</script>

<media-controller
	class={`group relative block bg-transparent overflow-hidden ${className}`}
	bind:this={containerEl}
>
	<!-- Video element directly slotted for media-chrome to work properly -->
	{#if !isSharedVideo()}
		<video
			bind:this={videoElement}
			slot="media"
			{src}
			{poster}
			{autoplay}
			{loop}
			{muted}
			playsinline
			preload="metadata"
			crossorigin="anonymous"
			class="max-h-96 object-contain"
			class:h-full={fullWidth}
			class:w-full={fullWidth}
			class:w-auto={!fullWidth}
			disablePictureInPicture
			on:timeupdate={updateTime}
			on:loadedmetadata={updateTime}
		/>
	{:else}
		<!-- Placeholder when video is being shown in zoom -->
		<div slot="media" class="h-full w-full bg-gray-900 flex items-center justify-center">
			<div class="text-white/60 flex flex-col items-center gap-2">
				<svg class="w-12 h-12 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
					/>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span class="text-sm">Playing in viewer</span>
			</div>
		</div>
	{/if}

	<!-- Transparent tap overlay to intercept mobile taps -->
	<div
		class="absolute inset-0 z-[1]"
		style="touch-action: pan-y;"
		on:click|stopPropagation={onOverlayClick}
		on:pointerdown|stopPropagation={onPointerDown}
		on:pointermove|stopPropagation={onPointerMove}
		on:pointerup|stopPropagation={onPointerUp}
	/>

	<!-- Minimal controls: Unmute button + time remaining (only when video is attached) -->
	{#if !isSharedVideo()}
		<!-- Unmute button (top right) -->
		<media-mute-button
			class="absolute !top-3 !right-3 z-10 !rounded-full !bg-black/60 !text-white !p-2
           hover:!bg-black/80 transition-opacity opacity-100"
			aria-label="Toggle mute"
			on:click|stopPropagation
		></media-mute-button>

		<!-- Time remaining display (bottom left) -->
		{#if duration > 0}
			<div
				class="absolute !bottom-3 !left-3 z-10 text-white/90 text-sm font-medium
			       !bg-black/60 !rounded-full !px-3 !py-1 pointer-events-none"
			>
				{secondsRemaining}s
			</div>
		{/if}
	{/if}
</media-controller>

<style>
	media-mute-button:focus {
		outline: 2px solid rgba(255, 255, 255, 0.8);
		outline-offset: 2px;
	}
</style>
