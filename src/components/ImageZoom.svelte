<script lang="ts">
	import { fade } from 'svelte/transition';
	import Carousel from 'src/components/Carousel.svelte';
	import ImageZoomContext from 'src/components/ImageZoomContext.svelte';
	import type { AnyKind, ParsedEvent, Kind1Parsed } from 'src/types';
	import { context, links, note, zoomed } from 'src/controller/image';

	// Toggle for showing the context sidebar
	let showContext: boolean = true;

	// The links are already proxied when stored in the store from ImageGrid
</script>

{#if $zoomed !== undefined}
	<div
		class="z-50 fixed left-0 top-0 h-full w-full overflow-auto bg-black flex"
		transition:fade={{ duration: 200 }}
		on:click|preventDefault|stopPropagation={() => ($zoomed = undefined)}
	>
		<Carousel
			keyboardShortcut
			items={$links}
			currentIndex={$zoomed}
			let:item
			onClose={() => ($zoomed = undefined)}
		>
			{#if item.type === 'image'}
				<img
					class="m-auto h-full max-w-full rounded-lg object-contain"
					style={showContext ? 'max-width: 75%;' : 'max-width: 80%;'}
					src={item?.src}
					on:click={(e) => e.stopPropagation()}
				/>
			{:else}
				<video
					class="m-auto h-full max-w-full rounded-lg object-contain"
					style={showContext ? 'max-width: 75%;' : 'max-width: 80%;'}
					src={item?.src}
					on:click={(e) => e.stopPropagation()}
					autoplay
					controls
				/>
			{/if}
		</Carousel>

		<ImageZoomContext
			bind:showContext
			note={$note}
			context={$context}
			visible={$zoomed !== undefined}
		/>
	</div>
{/if}
