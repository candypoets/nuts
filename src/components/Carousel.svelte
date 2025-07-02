<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { proxyImageUrl, proxyVideoUrl, ImagePresets } from 'src/lib/proxy';

	export let items: any[] = [];
	export let onClose: () => void = undefined;
	export let currentIndex = 0;
	export let keyboardShortcut = false;
	export let noScroll = false;

	// Ensure items have proxied URLs if they contain src properties
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
		}
	}

	function handleScroll(event: WheelEvent | TouchEvent) {
		if (processedItems.length > 1 && currentIndex !== processedItems.length - 1) {
			event.stopPropagation();
		}
		if (carouselElement) {
			currentIndex = Math.round(carouselElement.scrollLeft / carouselElement.offsetWidth);
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
		carouselElement.scrollTo({
			left: currentIndex * carouselElement.offsetWidth,
			behavior: 'instant'
		});
	});

	$: scrollToIndex(currentIndex);
</script>

<div
	class="group relative h-full w-full outline-none"
	bind:this={container}
	on:keydown|stopPropagation|preventDefault={handleKeydown}
	tabindex="-1"
	autofocus
>
	<div
		class="bg-transparent scrollbar-hide flex h-full snap-x snap-mandatory items-center gap-4 overflow-x-scroll scroll-smooth rounded-xl"
		bind:this={carouselElement}
		on:wheel={handleScroll}
		on:touchmove={handleScroll}
		on:touchend={handleScroll}
	>
		{#each processedItems as item, index}
			<div
				class="h-full w-full shrink-0 snap-always overflow-hidden rounded-xl bg-opacity-50"
				class:snap-start={index === 0}
				class:snap-center={index !== 0}
			>
				<slot {item}>Missing template</slot>
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
