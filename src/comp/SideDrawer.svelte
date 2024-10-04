<script lang="ts">
	import { spring } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let isOpen = true;
	export let side = 'right'; // 'left' or 'right'

	const drawer = spring(0, {
		stiffness: 0.1,
		damping: 0.8,
		easing: cubicOut
	});

	$: {
		drawer.set(isOpen ? 1 : 0);
	}

	$: {
		if ($drawer === 0 && !isOpen) {
			dispatch('transitioncomplete');
		}
	}

	let startX: number = 0;
	let currentX;
	let isDragging = false;

	function handleTouchStart(e: TouchEvent) {
		startX = e.touches[0].clientX;
		isDragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		currentX = e.touches[0].clientX;
		const diff = currentX - startX;
		const direction = side === 'right' ? -1 : 1;
		const newPosition = Math.max(0, Math.min(1, $drawer + (diff / window.innerWidth) * direction));
		drawer.set(newPosition, { hard: true });
	}

	function handleTouchEnd() {
		isDragging = false;
		if ($drawer > 0.5) {
			isOpen = true;
		} else {
			isOpen = false;
		}
	}
</script>

<div class="side-drawer-overlay" class:open={isOpen} on:click={() => (isOpen = false)}></div>

<div
	class="side-drawer {side}"
	style="transform: translateX({side === 'right' ? 100 * (1 - $drawer) : -100 * (1 - $drawer)}%)"
	on:touchstart={handleTouchStart}
	on:touchmove={handleTouchMove}
	on:touchend={handleTouchEnd}
>
	<slot />
</div>

<style>
	.side-drawer-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease;
	}

	.side-drawer-overlay.open {
		opacity: 1;
		pointer-events: all;
	}

	.side-drawer {
		position: fixed;
		top: 0;
		bottom: 0;
		width: 80%; /* Adjust as needed */
		background-color: white;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
		transition: transform 0.3s ease;
	}

	.side-drawer.right {
		right: 0;
	}

	.side-drawer.left {
		left: 0;
	}
</style>
