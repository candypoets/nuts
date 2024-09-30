<script lang="ts">
	export let items: any[] = [];

	let carouselElement: HTMLElement;
	let currentIndex = 0;

	function scrollToIndex(index: number) {
		if (carouselElement) {
			carouselElement.scrollTo({
				left: index * carouselElement.offsetWidth,
				behavior: 'smooth'
			});
		}
	}

	function handleScroll() {
		if (carouselElement) {
			currentIndex = Math.round(carouselElement.scrollLeft / carouselElement.offsetWidth);
		}
	}
</script>

<div
	class="flex relative gap-3 overflow-x-scroll items-stretch scrollbar-hide snap-x snap-mandatory scroll-smooth"
	bind:this={carouselElement}
	on:wheel={handleScroll}
>
	{#each items as item, index (index)}
		<div
			class="w-full shrink-0 bg-opacity-50 rounded-xl overflow-hidden snap-always"
			class:snap-start={index == 0}
			class:snap-center={index != 0}
		>
			{item}
		</div>
	{/each}
	{#if items.length > 1}
		<div class="absolute w-full flex items-center justify-center bottom-4 gap-1">
			{#each items as _, index (index)}
				<button
					class="bg-primary rounded-full h-1 w-1"
					class:active={index === currentIndex}
					on:click={() => scrollToIndex(index)}
				/>
			{/each}
		</div>
	{/if}
</div>
