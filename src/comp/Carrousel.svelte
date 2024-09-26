<script lang="ts">
	import { onMount } from 'svelte';

	export let items = [];

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

	onMount(() => {
		if (carouselElement) {
			carouselElement.addEventListener('scroll', handleScroll);
		}

		return () => {
			if (carouselElement) {
				carouselElement.removeEventListener('scroll', handleScroll);
			}
		};
	});
</script>

<div class="carousel-container">
	<div class="carousel" bind:this={carouselElement}>
		{#each items as item, index (index)}
			<div class="carousel-item">
				{item}
			</div>
		{/each}
	</div>
	<div class="carousel-indicators">
		{#each items as _, index (index)}
			<button
				class="indicator"
				class:active={index === currentIndex}
				on:click={() => scrollToIndex(index)}
			/>
		{/each}
	</div>
</div>

<style>
	.carousel-container {
		width: 100%;
		overflow: hidden;
	}

	.carousel {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* Internet Explorer 10+ */
	}

	.carousel::-webkit-scrollbar {
		display: none; /* WebKit */
	}

	.carousel-item {
		flex: 0 0 100%;
		scroll-snap-align: start;
		scroll-snap-stop: always;
	}

	.carousel-indicators {
		display: flex;
		justify-content: center;
		margin-top: 10px;
	}

	.indicator {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: none;
		background-color: #ccc;
		margin: 0 5px;
		padding: 0;
		cursor: pointer;
	}

	.indicator.active {
		background-color: #333;
	}
</style>
