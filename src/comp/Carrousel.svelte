<script lang="ts">
	import { PhotoViewer } from '@capacitor-community/photoviewer';

	export let items: any[] = [];

	let carouselElement: HTMLElement;
	let currentIndex = 0;

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
		if (items.length > 1 && currentIndex != items.length - 1) {
			event.stopPropagation();
		}
		if (carouselElement) {
			currentIndex = Math.round(carouselElement.scrollLeft / carouselElement.offsetWidth);
		}
	}
</script>

<div class="relative w-full">
	<div
		class="flex gap-4 overflow-x-scroll items-center bg-base-200 rounded-xl scrollbar-hide snap-x snap-mandatory scroll-smooth"
		bind:this={carouselElement}
		on:wheel={handleScroll}
		on:touchmove={handleScroll}
		on:touchend={handleScroll}
	>
		{#each items as item, index (item.value)}
			<div
				class="w-full shrink-0 bg-opacity-50 rounded-xl overflow-hidden snap-always"
				class:snap-start={index == 0}
				class:snap-center={index != 0}
				on:click={() =>
					PhotoViewer.show({
						images: items.map((i) => ({ url: i.value })),
						mode: items.length > 1 ? 'slider' : 'one',
						startFrom: index,
						options: {
							title: true,
							share: false,
							transformer: 'depth'
						}
					})}
			>
				<slot {item}>Missing template</slot>
			</div>
		{/each}
	</div>
	{#if items.length > 1}
		<div class="absolute w-full flex items-center justify-center bottom-4 gap-1">
			{#each items as _, index (index)}
				<button
					class="border border-primary rounded-full h-2 w-2"
					class:bg-primary={index === currentIndex}
					on:click={() => scrollToIndex(index)}
				/>
			{/each}
		</div>
	{/if}
</div>
