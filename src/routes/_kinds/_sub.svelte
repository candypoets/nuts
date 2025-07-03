<script lang="ts">
	import Kind0 from 'src/routes/_kinds/kind0.svelte';
	import Kind1 from 'src/routes/_kinds/kind1.svelte';
	import Kind4 from 'src/routes/_kinds/kind4.svelte';
	import Notifications from 'src/routes/notifications/index.svelte';
	import { goBack } from 'src/routes/modals/modal';

	import { cubicOut, elasticOut, quintOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { viewport } from 'src/controller/viewport';

	export let path: string;
	export let visible: boolean;
	export let depth: number = 0;
	export let modalDepth: number = 0;

	let element: HTMLElement;

	// Touch gesture variables
	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;
	let isSwiping = false;

	// Tweened store for smooth swipe animation
	const swipeTranslateX = tweened(0, {
		duration: 400,
		easing: quintOut
	});

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
		isSwiping = false;
		swipeTranslateX.set(0);
	}

	function handleTouchMove(e: TouchEvent) {
		if (!element) return;

		const touchCurrentX = e.touches[0].clientX;
		const touchCurrentY = e.touches[0].clientY;
		const deltaX = touchCurrentX - touchStartX;
		const deltaY = touchCurrentY - touchStartY;

		// Only consider horizontal swipes (more horizontal than vertical movement)
		if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
			isSwiping = true;
			// Cancel horizontal scrolling
			e.preventDefault();
			// Apply visual feedback - move container with swipe
			swipeTranslateX.set(Math.max(0, deltaX), { duration: 0 });
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!element || !isSwiping) return;

		const touchEndX = e.changedTouches[0].clientX;
		const touchEndTime = Date.now();
		const deltaX = touchEndX - touchStartX;
		const deltaTime = touchEndTime - touchStartTime;
		const containerWidth = element.offsetWidth;

		// Calculate velocity in pixels per millisecond
		const velocity = deltaX / deltaTime;

		// Trigger goBack if swipe distance is more than 1/3 of container width
		// OR if velocity is high enough (> 0.5 px/ms) and minimum distance (50px)
		const distanceThreshold = deltaX > containerWidth / 3;
		const velocityThreshold = velocity > 0.5 && deltaX > 50;

		if (distanceThreshold || velocityThreshold) {
			goBack();
		} else {
			// Gently animate back to original position
			swipeTranslateX.set(0);
		}

		isSwiping = false;
	}

	// Create a tweened store for the depth-based translation
	const depthTranslation = tweened(0, {
		duration: 500,
		easing: quintOut
	});

	const depthScale = tweened(1, {
		duration: 500,
		easing: quintOut
	});

	const depthOpacity = tweened(1, {
		duration: 500,
		easing: quintOut
	});

	const modalDepthTranslation = tweened(0, {
		duration: 450,
		easing: quintOut
	});

	const modalDepthScale = tweened(1, {
		duration: 450,
		easing: quintOut
	});

	const modalDepthOpacity = tweened(1, {
		duration: 450,
		easing: quintOut
	});

	// Update the tweened value when depth changes
	$: depthTranslation.set(depth * 30); // 10px per depth level (adjust as needed)
	$: depthScale.set(Math.max(0.85, 1 - depth * 0.05)); // Reduce scale by 5% per depth level, min 85%
	$: depthOpacity.set(Math.max(0.3, 1 - depth * 0.3)); // Reduce opacity by 20% per depth level, min 50%

	// Update the tweened value when modalDepth changes
	$: modalDepthTranslation.set(modalDepth * 30); // 10px per modalDepth level
	$: modalDepthScale.set(Math.max(0.85, 1 - modalDepth * 0.05)); // Reduce scale by 5% per modalDepth level, min 85%

	$: scale = $modalDepthScale * $depthScale;
</script>

<div
	class="absolute right-0 top-0 h-screen lg:p-2 z-20"
	bind:this={element}
	in:fly={{ x: $viewport.vw * 50, duration: 500, opacity: 1, easing: quintOut }}
	out:fly={{ x: element.offsetWidth, duration: 400, opacity: 1, easing: elasticOut }}
>
	<div
		class="lg:border bg-base-300 bg-opacity-80 border-base-300 h-screen lg:rounded-xl overflow-hidden lg:px-2 backdrop-blur-sm transition-gpu"
		style="transform: translate3d({-$depthTranslation +
			$swipeTranslateX}px, {-$modalDepthTranslation}px, 0) scale({scale});
			opacity: {$depthOpacity};
			backface-visibility: hidden;
			-webkit-backface-visibility: hidden;"
		on:touchstart|stopPropagation={handleTouchStart}
		on:touchmove|stopPropagation={handleTouchMove}
		on:touchend|stopPropagation={handleTouchEnd}
	>
		{#if path.includes('nprofile')}
			<Kind0 pubkey={path.split(':')?.[1]} {visible} />
		{:else if path.includes('nevent')}
			<Kind1 postId={path.split(':')?.[1]} {visible} />
		{:else if path.includes('kind4')}
			<Kind4 pubkey={path.split(':')?.[1]} {visible} />
		{:else if path.includes('notifications')}
			<Notifications />
		{/if}
	</div>
</div>

<style>
	.transition-gpu {
		transform-origin: center center;
		contain: layout style paint;
		will-change: transform, opacity;
	}
</style>
