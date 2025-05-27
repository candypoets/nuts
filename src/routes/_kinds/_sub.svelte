<script lang="ts">
	import { viewport } from 'src/lib';
	import Kind0 from 'src/routes/_kinds/kind0.svelte';
	import Kind1 from 'src/routes/_kinds/kind1.svelte';
	import Kind4 from 'src/routes/_kinds/kind4.svelte';
	import Notifications from 'src/routes/notifications/index.svelte';
	import { goBack } from 'src/routes/modals/modal';

	import { cubicOut, elasticOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	export let path: string;
	export let visible: boolean;
	export let depth: number = 0;
	export let modalDepth: number = 0;

	let element: HTMLElement;

	// Touch gesture variables
	let touchStartX = 0;
	let touchStartY = 0;
	let isSwiping = false;

	// Tweened store for smooth swipe animation
	const swipeTranslateX = tweened(0, {
		duration: 300,
		easing: cubicOut
	});

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
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
		const deltaX = touchEndX - touchStartX;
		const containerWidth = element.offsetWidth;

		// Trigger goBack if swipe distance is more than 1/3 of container width
		if (deltaX > containerWidth / 3) {
			goBack();
		} else {
			// Gently animate back to original position
			swipeTranslateX.set(0);
		}

		isSwiping = false;
	}

	// Create a tweened store for the depth-based translation
	const depthTranslation = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	const depthScale = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	const depthOpacity = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	const modalDepthTranslation = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	const modalDepthScale = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	const modalDepthOpacity = tweened(1, {
		duration: 400,
		easing: cubicOut
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
	in:fly={{ x: $viewport.vw * 50, duration: 400, opacity: 1, easing: cubicOut }}
	out:fly={{ x: element.offsetWidth, duration: 300, opacity: 1, easing: elasticOut }}
>
	<div
		class="lg:border bg-base-300 bg-opacity-80 border-base-300 h-screen lg:rounded-xl overflow-hidden lg:px-2 backdrop-blur-sm"
		style="transform: translateX({-$depthTranslation +
			$swipeTranslateX}px) translateY(-{$modalDepthTranslation}px) scale({scale}); opacity: {$depthOpacity};"
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
