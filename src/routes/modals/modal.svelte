<script lang="ts">
	import Profile from 'src/routes/modals/_profile/index.svelte';
	import Keys from 'src/routes/modals/_profile/keys.svelte';
	import Logout from 'src/routes/modals/_profile/logout.svelte';
	import Relays from 'src/routes/modals/_profile/relays.svelte';
	import Wallet from 'src/routes/modals/_profile/wallet.svelte';
	import Ecash from 'src/routes/modals/ecash.svelte';
	import Lightning from 'src/routes/modals/lightning.svelte';
	import Melt from 'src/routes/modals/melt.svelte';
	import Melted from 'src/routes/modals/melted.svelte';
	import Minted from 'src/routes/modals/minted.svelte';
	import Minting from 'src/routes/modals/minting.svelte';
	import QR from 'src/routes/modals/qr.svelte';
	import Scan from 'src/routes/modals/scan.svelte';
	import Send from 'src/routes/modals/send.svelte';
	import Tapcash from 'src/routes/modals/tapcash.svelte';
	import Topup from 'src/routes/modals/topup.svelte';
	import Post from 'src/routes/modals/post.svelte';

	import { viewport } from 'src/controller/viewport';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { getContext, onMount } from 'svelte';
	import Followlists from './followlists.svelte';

	export let path: string;
	export let visible: boolean;
	export let depth: number = 0;

	let pagerAnimator: PagerAnimator | undefined = getContext('animator');
	let element: HTMLElement;

	// Touch gesture variables
	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;
	let isSwiping = false;
	let isVerticalGesture = false;
	let debugLogs: string[] = [];

	function addLog(logs: string) {
		debugLogs.push(logs);
	}

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
		isVerticalGesture = false;
		addLog(`Touch start: y=${touchStartY}, element=${!!element}, animator=${!!pagerAnimator}`);
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
		if (!isVerticalGesture && !isSwiping) {
			// Need minimum movement to determine direction
			if (absDeltaX > 5 || absDeltaY > 5) {
				// Check if it's more vertical than horizontal AND it's a down swipe
				const isMoreVertical = absDeltaY > absDeltaX;
				const isDownSwipe = deltaY > 0;
				isVerticalGesture = isMoreVertical && isDownSwipe;
				addLog(
					`Gesture detected: vertical=${isMoreVertical}, down=${isDownSwipe}, final=${isVerticalGesture}`
				);

				// If it's not a down vertical swipe, don't interfere
				if (!isVerticalGesture) {
					addLog('Not vertical gesture, returning');
					return;
				}
			} else {
				return; // Not enough movement yet
			}
		}

		// Only handle down vertical swipes
		if (isVerticalGesture && deltaY > 2) {
			isSwiping = true;
			e.preventDefault();
			e.stopPropagation();
			addLog(`Tracking swipe: deltaY=${deltaY}`);

			// Use PagerAnimator for real-time gesture tracking
			pagerAnimator.trackSwipeDismiss(0, deltaY);
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!element || !pagerAnimator) return;

		// Always handle touch end for vertical gestures
		if (isVerticalGesture) {
			const touchEndY = e.changedTouches[0].clientY;
			const touchEndTime = Date.now();
			const deltaY = touchEndY - touchStartY;
			const deltaTime = touchEndTime - touchStartTime;
			const containerHeight = element.offsetHeight;

			// Calculate velocity in pixels per millisecond
			const velocity = deltaY / deltaTime;

			// Trigger goBack if swipe distance is more than 1/3 of container height
			// OR if velocity is high enough (> 0.5 px/ms) and minimum distance (50px)
			const distanceThreshold = deltaY > containerHeight / 3;
			const velocityThreshold = velocity > 0.5 && deltaY > 50;

			if (isSwiping && (distanceThreshold || velocityThreshold)) {
				// Complete swipe dismiss with WAAPI out animation, then call goBack
				addLog(`Dismissing: distance=${distanceThreshold}, velocity=${velocityThreshold}`);
				pagerAnimator.completeSwipeDismiss();
			} else {
				// Cancel swipe dismiss - animate back to original position
				addLog('Canceling swipe dismiss');
				pagerAnimator.cancelSwipeDismiss();
			}
		}

		// Reset touch states
		isSwiping = false;
		isVerticalGesture = false;
	}
</script>

<div
	class="fixed right-0 top-0 h-screen z-20"
	bind:this={element}
	on:click|stopPropagation={pagerAnimator?.goBack}
	style="width: {$viewport.vw * 100}px;"
	data-kind="modal"
>
	<div
		class="m-auto relative overflow-hidden w-feed h-full"
		on:click|stopPropagation
		on:touchstart|stopPropagation={handleTouchStart}
		on:touchmove|stopPropagation={handleTouchMove}
		on:touchend|stopPropagation={handleTouchEnd}
	>
		{#if path.includes('receive')}
			<Topup />
		{:else if path.includes('send')}
			<Send />
		{:else if path.includes('scan')}
			<Scan />
		{:else if path.includes('qr')}
			<QR />
		{:else if path.includes('ecash')}
			<Ecash pubkey={path.split(':')?.[1]} noteId={path.split(':')?.[2]} />
		{:else if path.includes('followlist')}
			<Followlists />
		{:else if path.includes('lightning')}
			<Lightning invoice={path.split(':')?.[1]} />
		{:else if path.includes('minting')}
			<Minting />
		{:else if path.includes('minted')}
			<Minted mint={path.split(':')?.[1]} amount={path.split(':')?.[2]} />
		{:else if path.includes('melted')}
			<Melted mint={path.split(':')?.[1]} amount={path.split(':')?.[2]} />
		{:else if path.startsWith('melt')}
			<Melt invoice={path.split(':')?.[1]} />
		{:else if path.includes('tapcash')}
			<Tapcash />
		{:else if path.includes('profile')}
			<Profile />
		{:else if path.includes('zaps')}
			<!-- <Zaps /> -->
		{:else if path.includes('keys')}
			<Keys />
		{:else if path.includes('reply')}
			<Post reply={path.split(':')?.[1]} />
		{:else if path.includes('repost')}
			<Post repost={path.split(':')?.[1]} />
		{:else if path.includes('post')}
			<Post />
		{:else if path.includes('wallet')}
			<Wallet />
		{:else if path.includes('relays')}
			<Relays />
		{:else if path.includes('logout')}
			<Logout />
		{/if}
	</div>
</div>
