<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, createEventDispatcher } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicIn, cubicInOut, cubicOut, linear } from 'svelte/easing';

	export let dismissible: boolean = true;
	export let open: boolean = false;
	export let onClose: (() => void) | undefined = undefined;
	export let scaleBackground: boolean = true;
	export let nested: boolean = false;
	export let scaleSteps: number = 0.05;

	const dispatch = createEventDispatcher();

	let viewport = { width: 0, height: 0, vw: 0, vh: 0 };

	onMount(() => {
		if (browser) {
			viewport = {
				width: window.innerWidth,
				height: window.innerHeight,
				vw: window.innerWidth * 0.01,
				vh: window.innerHeight * 0.01
			};

			const updateViewport = () => {
				viewport = {
					width: window.innerWidth,
					height: window.innerHeight,
					vw: window.innerWidth * 0.01,
					vh: window.innerHeight * 0.01
				};
			};

			window.addEventListener('resize', updateViewport);

			return () => {
				window.removeEventListener('resize', updateViewport);
			};
		}
	});

	$: desktop = viewport.width > 1024;

	// Animation values
	const animateY = tweened(100, {
		duration: 300,
		easing: cubicInOut
	});

	const backgroundOpacity = tweened(0, {
		duration: 300,
		easing: cubicOut
	});

	const backgroundScale = tweened(1, {
		duration: 300,
		easing: cubicOut
	});

	// Update animation values based on open state
	$: {
		if (open) {
			animateY.set(0);
			backgroundOpacity.set(0.4);
			if (scaleBackground && !desktop) {
				backgroundScale.set(1 - scaleSteps);
			}
		} else {
			animateY.set(100);
			backgroundOpacity.set(0);
			backgroundScale.set(1);
		}
	}

	// Handle click outside to close
	function handleOverlayClick() {
		if (dismissible && !desktop) {
			open = false;
			if (onClose) onClose();
			dispatch('close');
		}
	}

	// For gesture interactions
	let startY: number;
	let currentY: number;
	let dragging = false;
	let drawerEl: HTMLElement;

	function handleTouchStart(e: TouchEvent) {
		if (!dismissible || desktop) return;

		startY = e.touches[0].clientY;
		dragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!dragging) return;

		currentY = e.touches[0].clientY;
		const deltaY = currentY - startY;

		if (deltaY > 0) {
			const percentageMoved = Math.min(deltaY / drawerEl.offsetHeight, 1) * 100;
			animateY.set(percentageMoved, { duration: 0 });

			if (scaleBackground && !desktop) {
				const scaleValue = 1 - scaleSteps * (1 - percentageMoved / 100);
				backgroundScale.set(scaleValue, { duration: 0 });
			}

			backgroundOpacity.set(0.4 * (1 - percentageMoved / 100), { duration: 0 });
		}
	}

	function handleTouchEnd() {
		if (!dragging) return;

		dragging = false;
		const deltaY = currentY - startY;

		if (deltaY > drawerEl.offsetHeight * 0.3) {
			// Close drawer if dragged more than 30% of height
			open = false;
			if (onClose) onClose();
			dispatch('close');
		} else {
			// Reset to open position
			animateY.set(0);
			backgroundOpacity.set(0.4);
			if (scaleBackground && !desktop) {
				backgroundScale.set(1 - scaleSteps);
			}
		}
	}
</script>

<!-- Overlay - different z-index for nested drawers -->
{#if open}
	<div
		class="fixed overflow-hidden top-0 inset-0 {nested ? 'z-30' : 'z-20'}"
		style="background-color: rgba(0, 0, 0, {$backgroundOpacity});"
		role="button"
		tabindex="0"
		on:click|stopPropagation={handleOverlayClick}
		on:keydown={(e) => e.key === 'Enter' && handleOverlayClick()}
		aria-label="Close drawer"
	>
		<div
			bind:this={drawerEl}
			class="m-auto bg-basic {nested ? 'z-40' : 'z-30'} will-change-transform h-[100vh]"
			class:rounded-t-3xl={!nested}
			class:w-feed={true}
			class:lg:right-0={true}
			class:lg:left-auto={true}
			on:touchstart={handleTouchStart}
			on:touchmove={handleTouchMove}
			on:touchend={handleTouchEnd}
			style="transform: translateY({$animateY}vh);"
		>
			<!-- <div class="sr-only" tabindex="-1"></div> -->
			<!-- <div class="drawer-handle mx-auto w-10 h-1 bg-gray-300 rounded-full mb-3"></div> -->
			<slot />
		</div>
	</div>
{/if}

<style>
	/* Add position based on nested state */
	/* :global(.drawer-nested) {
		top: calc(0.5rem + env(safe-area-inset-top, 20px));
	}

	:global(.drawer-root) {
		top: calc(1rem + env(safe-area-inset-top, 20px));
	} */

	/* .fine-border {
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	} */
</style>
