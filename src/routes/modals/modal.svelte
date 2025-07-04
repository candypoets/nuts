<script lang="ts">
	import Ecash from 'src/routes/modals/ecash.svelte';
	import Lightning from 'src/routes/modals/lightning.svelte';
	import Melt from 'src/routes/modals/melt.svelte';
	import QR from 'src/routes/modals/qr.svelte';
	import Profile from 'src/routes/modals/_profile/index.svelte';
	import Send from 'src/routes/modals/send.svelte';
	import Tapcash from 'src/routes/modals/tapcash.svelte';
	import Topup from 'src/routes/modals/topup.svelte';
	import Minting from 'src/routes/modals/minting.svelte';
	import Minted from 'src/routes/modals/minted.svelte';
	import Melted from 'src/routes/modals/melted.svelte';
	import Scan from 'src/routes/modals/scan.svelte';
	import Keys from 'src/routes/modals/_profile/keys.svelte';
	import Wallet from 'src/routes/modals/_profile/wallet.svelte';
	import Relays from 'src/routes/modals/_profile/relays.svelte';
	import Logout from 'src/routes/modals/_profile/logout.svelte';

	import { cubicOut, elasticOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { goBack } from './modal';
	import Followlists from './followlists.svelte';
	import { viewport } from 'src/controller/viewport';

	export let path: string;
	export let visible: boolean;
	export let depth: number = 0;

	let element: HTMLElement;

	// Touch gesture variables
	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;
	let isSwiping = false;

	// Tweened store for smooth swipe animation
	const swipeTranslateY = tweened(0, {
		duration: 300,
		easing: cubicOut
	});

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
		isSwiping = false;
		swipeTranslateY.set(0);
	}

	function handleTouchMove(e: TouchEvent) {
		if (!element) return;

		const touchCurrentX = e.touches[0].clientX;
		const touchCurrentY = e.touches[0].clientY;
		const deltaX = touchCurrentX - touchStartX;
		const deltaY = touchCurrentY - touchStartY;

		// Only consider vertical swipes (more vertical than horizontal movement)
		if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
			isSwiping = true;
			// Cancel vertical scrolling
			e.preventDefault();
			// Apply visual feedback - move container with swipe
			swipeTranslateY.set(Math.max(0, deltaY), { duration: 0 });
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!element || !isSwiping) return;

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

		if (distanceThreshold || velocityThreshold) {
			goBack();
		} else {
			// Gently animate back to original position
			swipeTranslateY.set(0);
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

	// Update the tweened value when depth changes
	$: depthTranslation.set(depth * 30); // 10px per depth level (adjust as needed)
	$: depthScale.set(Math.max(0.85, 1 - depth * 0.05)); // Reduce scale by 5% per depth level, min 85%
	$: depthOpacity.set(Math.max(0.3, 1 - depth * 0.3)); // Reduce opacity by 20% per depth level, min 50%

	$: console.log('path', path);
</script>

<div
	class="fixed right-0 top-0 h-screen z-20"
	bind:this={element}
	on:click|stopPropagation={goBack}
	style="width: {$viewport.vw * 100}px;"
	in:fly={{ y: $viewport.vh * 100, duration: 400, opacity: 1, easing: cubicOut }}
	out:fly={{ y: $viewport.vh * 100, duration: 300, opacity: 1, easing: cubicOut }}
>
	<div
		class="m-auto relative overflow-hidden w-feed h-full"
		style="transform: translateY({-$depthTranslation + $swipeTranslateY}px) scale({$depthScale});"
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
			<Zaps />
		{:else if path.includes('keys')}
			<Keys />
		{:else if path.includes('wallet')}
			<Wallet />
		{:else if path.includes('relays')}
			<Relays />
		{:else if path.includes('logout')}
			<Logout />
		{/if}
	</div>
</div>
