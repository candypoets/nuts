<script lang="ts">
	import Kind0 from 'src/routes/_kinds/kind0.svelte';
	import Kind1 from 'src/routes/_kinds/kind1.svelte';
	import Kind30023 from 'src/routes/_kinds/kind30023.svelte';
	import Kind4 from 'src/routes/_kinds/kind4.svelte';
	import Community from 'src/routes/_kinds/community.svelte';
	import Tags from 'src/routes/_kinds/tags.svelte';
	import Notifications from 'src/routes/notifications/index.svelte';

	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { getContext, onMount } from 'svelte';

	export let path: string;
	export let visible: boolean;
	export let depth: number = 0;
	export let modalDepth: number = 0;

	let pagerAnimator: PagerAnimator | undefined = getContext('animator');
	let element: HTMLElement;

	// Touch gesture variables
	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;
	let isSwiping = false;
	let isHorizontalGesture = false;
	let debugLogs: string[] = [];

	function addLog(logs: string) {
		debugLogs.push(logs);
	}

	function goBack() {
		pagerAnimator?.goBack?.();
	}

	// Add keyboard listener for desktop
	onMount(() => {
		if (pagerAnimator && element) {
			pagerAnimator.registerElement(element);
		}
	});

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
		isSwiping = false;
		isHorizontalGesture = false;
		addLog(`Touch start: x=${touchStartX}, element=${!!element}, animator=${!!pagerAnimator}`);
	}

	function handleTouchMove(e: TouchEvent) {
		if (!element || !pagerAnimator) {
			addLog(`Touch move blocked: element=${!!element}, animator=${!!pagerAnimator}`);
			return;
		}

		const touchCurrentX = e.touches[0].clientX;
		const touchCurrentY = e.touches[0].clientY;
		const deltaX = touchCurrentX - touchStartX;
		const deltaY = touchCurrentY - touchStartY;

		const absDeltaX = Math.abs(deltaX);
		const absDeltaY = Math.abs(deltaY);

		// Determine gesture direction only once
		if (!isHorizontalGesture && !isSwiping) {
			// Need minimum movement to determine direction
			if (absDeltaX > 5 || absDeltaY > 5) {
				// Check if it's more horizontal than vertical AND it's a right swipe
				const isMoreHorizontal = absDeltaX > absDeltaY;
				const isRightSwipe = deltaX > 0;
				isHorizontalGesture = isMoreHorizontal && isRightSwipe;
				addLog(
					`Gesture detected: horizontal=${isMoreHorizontal}, right=${isRightSwipe}, final=${isHorizontalGesture}`
				);

				// If it's not a right horizontal swipe, don't interfere
				if (!isHorizontalGesture) {
					addLog('Not horizontal gesture, returning');
					return;
				}
			} else {
				return; // Not enough movement yet
			}
		}

		// Only handle right horizontal swipes
		if (isHorizontalGesture && deltaX > 2) {
			isSwiping = true;
			e.preventDefault();
			e.stopPropagation();
			addLog(`Tracking swipe: deltaX=${deltaX}`);

			// Use PagerAnimator for real-time gesture tracking
			pagerAnimator.trackSwipeDismiss(deltaX);
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!element || !pagerAnimator) return;

		const touchEndX = e.changedTouches[0].clientX;
		const touchEndY = e.changedTouches[0].clientY;

		// Always handle touch end for horizontal gestures
		if (isHorizontalGesture) {
			const finalDeltaX = Math.max(0, touchEndX - touchStartX);
			const finalDeltaY = Math.max(0, touchEndY - touchStartY);
			pagerAnimator.trackSwipeDismiss(finalDeltaX, finalDeltaY);
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

			if (isSwiping && (distanceThreshold || velocityThreshold)) {
				// Complete swipe dismiss with WAAPI out animation, then call goBack
				addLog(`Dismissing: distance=${distanceThreshold}, velocity=${velocityThreshold}`);
				pagerAnimator.completeSwipeDismiss();
			} else {
				// Cancel swipe dismiss - animate back to original position
				addLog(`Canceling swipe dismiss: deltaX=${deltaX}, velocity=${velocity.toFixed(2)}`);
				pagerAnimator.cancelSwipeDismiss();
			}
		}

		// Reset touch states
		isSwiping = false;
		isHorizontalGesture = false;
	}
</script>

<div
	class="absolute right-0 top-0 h-screen lg:p-2 z-20 bg-base-300 bg-opacity-90 lg:bg-transparent"
	class:lg:backdrop-blur-md={visible}
	bind:this={element}
	data-kind="sub"
>
	<div
		class="h-screen lg:rounded-xl overflow-hidden lg:px-2"
		style="backface-visibility: hidden;
			-webkit-backface-visibility: hidden;"
		on:touchstart|stopPropagation={handleTouchStart}
		on:touchmove|stopPropagation={handleTouchMove}
		on:touchend|stopPropagation={handleTouchEnd}
	>
		{#if path.includes('nprofile')}
			<Kind0 pubkey={path.split(':')?.[1]} {visible} {goBack} />
		{:else if path.includes('nevent')}
			<Kind1 nevent={path.split(':')?.[1]} {visible} {goBack} />
		{:else if path.includes('naddr')}
			{@const naddrValue = path.slice(path.indexOf(':') + 1)}
			<Kind30023 naddr={naddrValue} {visible} {goBack} />
		{:else if path.includes('kind4')}
			<Kind4 pubkey={path.split(':')?.[1]} {visible} {goBack} />
		{:else if path.includes('community')}
			{@const communityRelay = decodeURIComponent(path.slice(path.indexOf(':') + 1))}
			<Community relay={communityRelay} {visible} {goBack} />
		{:else if path.includes('notifications')}
			<Notifications {goBack} />
		{:else if path.includes('tags')}
			<Tags tags={[path.split(':')?.[1]]} {visible} {goBack} />
		{/if}
	</div>
</div>
