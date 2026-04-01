<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { proxyImageUrl, proxyVideoUrl, ImagePresets } from 'src/lib/proxy';
	import { spring } from 'svelte/motion';

	export let items: any[] = [];
	export let onClose: () => void = undefined;
	export let currentIndex = 0;
	export let keyboardShortcut = false;
	export let noScroll = false;
	export let verticalPan = true;
	export let onIndexChange: (index: number) => void = () => {};
	// When set, forces all slides to use this aspect ratio number (e.g., 1.33 for 4:3)
	// When undefined (default), each slide uses its own aspect ratio (for fullscreen mode)
	export let forceAspectRatio: number | undefined = undefined;
	// When true, removes the gap between slides (for feed carousels that need full width)
	export let noGap = false;

	// Compute unified aspect ratio from first image if enabled
	function parseAspectRatio(dimStr: string | undefined): number | null {
		if (!dimStr) return null;
		const match = dimStr.match(/(\d+)x(\d+)/);
		if (match) {
			const w = parseInt(match[1], 10);
			const h = parseInt(match[2], 10);
			if (h > 0) return w / h;
		}
		return null;
	}
	// Use full preset for carousel (zoom view) to get high quality images
	$: processedItems = items.map((item) => {
		if (item && typeof item === 'object' && item.src) {
			return {
				...item,
				src:
					item.type === 'video'
						? proxyVideoUrl(item.src)
						: proxyImageUrl(item.src, ImagePresets.full)
			};
		}
		return item;
	});

	let carouselElement: HTMLElement;
	let container: HTMLElement;

	function scrollToIndex(index: number) {
		if (carouselElement) {
			carouselElement.scrollTo({
				left: index * carouselElement.offsetWidth,
				behavior: 'smooth'
			});
			currentIndex = index;
			onIndexChange(index);
		}
	}

	let translateY = spring(0);
	let touchPrevX: number | null = null;
	let touchPrevY: number | null = null;

	function onTouchEnd(event: WheelEvent | TouchEvent) {
		$translateY = 0;
		touchPrevX = null;
		touchPrevY = null;
	}

	function handleScroll(event: WheelEvent | TouchEvent) {
		// Handle wheel events (mouse/trackpad)
		if ('deltaY' in event) {
			const wheel = event as WheelEvent;
			const dx = wheel.deltaX ?? 0;
			const dy = wheel.deltaY ?? 0;

			// If vertical scroll dominates, update translateY
			if (verticalPan && Math.abs(dy) > Math.abs(dx)) {
				translateY.set($translateY + dy, { hard: true });
				if (noScroll) wheel.preventDefault();
			}
		} else {
			// Handle touch events
			const touchEvent = event as TouchEvent;

			if (touchEvent.type === 'touchmove') {
				const touch = touchEvent.touches[0];
				if (touch) {
					if (touchPrevX === null || touchPrevY === null) {
						touchPrevX = touch.clientX;
						touchPrevY = touch.clientY;
					} else {
						const dx = touch.clientX - touchPrevX;
						const dy = touch.clientY - touchPrevY;

						// If vertical movement dominates, update translateY
						if (verticalPan && Math.abs(dy) > Math.abs(dx)) {
							translateY.set($translateY + dy, { hard: true });
							if (noScroll) touchEvent.preventDefault();
						}

						touchPrevX = touch.clientX;
						touchPrevY = touch.clientY;
					}
				}
			} else if (touchEvent.type === 'touchend') {
				touchPrevX = null;
				touchPrevY = null;
			}
		}

		if (carouselElement) {
			const newIndex = Math.round(carouselElement.scrollLeft / carouselElement.offsetWidth);
			if (newIndex !== currentIndex) {
				currentIndex = newIndex;
				onIndexChange(currentIndex);
			}
		}
		if (noScroll) event.preventDefault();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!keyboardShortcut) return;
		if (event.key === 'ArrowLeft') {
			scrollToIndex(Math.max(currentIndex - 1, 0));
		} else if (event.key === 'ArrowRight') {
			scrollToIndex(Math.min(currentIndex + 1, processedItems.length - 1));
		} else if (event.key === 'Escape') {
			onClose();
		}
	}

	onMount(() => {
		// Only set initial position if needed, reactive statement handles updates
		if (carouselElement && currentIndex > 0) {
			carouselElement.scrollTo({
				left: currentIndex * carouselElement.offsetWidth,
				behavior: 'instant'
			});
		}
	});

	$: scrollToIndex(currentIndex);
</script>

<div
	class="group relative h-full w-full outline-none"
	bind:this={container}
	on:keydown|stopPropagation|preventDefault={handleKeydown}
	tabindex="-1"
>
	<div
		class="bg-transparent scrollbar-hide flex h-full snap-x snap-mandatory items-center overflow-x-scroll scroll-smooth {noGap ? '' : 'gap-4 rounded-xl'}"
		bind:this={carouselElement}
		on:touchmove|nonpassive|stopPropagation={handleScroll}
		on:touchend={(e) => {
			onTouchEnd(e);
			handleScroll(e);
		}}
		style={`touch-action: pan-x; transform: translateY(${$translateY}px)`}
	>
		{#each processedItems as item, index}
			<div
				class="h-full w-full shrink-0 snap-always overflow-hidden {noGap ? '' : 'rounded-xl'} bg-opacity-50"
				class:snap-start={index === 0}
				class:snap-center={index !== 0}
			>
				<slot {item} {index} forcedAspectRatio={forceAspectRatio}>Missing template</slot>
			</div>
		{/each}
	</div>

	{#if processedItems.length > 1}
		<div class="absolute bottom-4 flex w-full items-center justify-center gap-1">
			{#each processedItems as _, index (index)}
				<button
					class="border-base-content h-2 w-2 rounded-full border"
					class:bg-white={index === currentIndex}
					on:click={() => scrollToIndex(index)}
				/>
			{/each}
		</div>
		<div
			class="absolute inset-y-0 left-0 flex items-center opacity-0 transition-opacity group-hover:opacity-100"
		>
			<button
				class="rounded-full p-2 text-white"
				class:opacity-0={currentIndex == 0}
				on:click|stopPropagation={() => scrollToIndex(Math.max(currentIndex - 1, 0))}
			>
				<Icon icon="mdi:chevron-left" class="text-2xl text-white" />
			</button>
		</div>
		<div
			class="absolute inset-y-0 right-0 flex items-center opacity-0 transition-opacity group-hover:opacity-100"
		>
			<button
				class="rounded-full p-2 text-white"
				class:opacity-0={currentIndex == processedItems.length - 1}
				on:click|stopPropagation={() =>
					scrollToIndex(Math.min(currentIndex + 1, processedItems.length - 1))}
			>
				<Icon icon="mdi:chevron-right" class="text-2xl text-white" />
			</button>
		</div>
	{/if}
</div>
