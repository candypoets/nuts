<script lang="ts">
	import { fade } from 'svelte/transition';
	import Carousel from 'src/comp/Carousel.svelte';

	export let links: { src: string; type?: 'image' | 'video' }[];
	export let zoomed: number | undefined;
</script>

{#if zoomed !== undefined}
	<div
		class="z-50 fixed left-0 top-0 h-full w-full overflow-auto bg-black"
		transition:fade={{ duration: 200 }}
		on:click|preventDefault|stopPropagation={() => (zoomed = undefined)}
	>
		<Carousel
			keyboardShortcut
			items={links}
			currentIndex={zoomed}
			let:item
			onClose={() => (zoomed = undefined)}
		>
			{#if item.type === 'image'}
				<img
					class="m-auto h-full max-w-full rounded-lg object-contain"
					style="max-width: 80%;"
					src={item?.src}
					on:click={(e) => e.stopPropagation()}
				/>
			{:else}
				<video
					class="m-auto h-full max-w-full rounded-lg object-contain"
					style="max-width: 80%;"
					src={item?.src}
					on:click={(e) => e.stopPropagation()}
					autoplay
					controls
				/>
			{/if}
		</Carousel>
	</div>
{/if}
