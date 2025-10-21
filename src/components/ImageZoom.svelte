<script lang="ts">
	import { fade } from 'svelte/transition';
	import Carousel from 'src/components/Carousel.svelte';
	import ImageZoomContext from 'src/components/ImageZoomContext.svelte';
	import type { AnyKind, ParsedEvent, Kind1Parsed } from 'src/types';
	import { context, links, note, zoomed } from 'src/controller/image';
	import { goBack } from 'src/routes/modals/modal';
	import { getContext } from 'svelte';
	import { isMobile } from 'src/controller';
	import Footer from 'src/routes/explore/_post/footer.svelte';

	// Toggle for showing the context sidebar
	let showContext: boolean = true;

	const animator = getContext('animator');

	// The links are already proxied when stored in the store from ImageGrid
</script>

{#if $zoomed !== undefined}
	<div
		class="z-50 fixed left-0 top-0 h-full w-full overflow-auto backdrop-blur-md flex"
		transition:fade={{ duration: 200 }}
		on:click|preventDefault|stopPropagation={() => {
			$zoomed = undefined;
			animator?.goBack();
		}}
	>
		<Carousel
			keyboardShortcut
			items={$links}
			currentIndex={$zoomed}
			let:item
			onClose={() => {
				$zoomed = undefined;
				animator?.goBack();
			}}
		>
			{#if item.type === 'image'}
				<img
					class="m-auto h-full max-w-full rounded-lg object-contain max-w-[80%]"
					class:max-w-[80%]={!showContext && !$isMobile}
					class:max-w-[75%]={showContext && !$isMobile}
					src={item?.src}
					on:click={(e) => e.stopPropagation()}
				/>
			{:else}
				<video
					class="m-auto h-full max-w-full rounded-lg object-contain"
					class:max-w-[80%]={!showContext && !$isMobile}
					class:max-w-[75%]={showContext && !$isMobile}
					src={item?.src}
					on:click|preventDefault|stopPropagation
					autoplay
					controls
				/>
			{/if}
		</Carousel>
		{#if $isMobile}
			<div class="fixed w-full bottom-0 pb-safe px-2">
				<Footer note={$note} visible main />
			</div>
		{/if}
		<ImageZoomContext
			bind:showContext
			note={$note}
			context={$context}
			visible={$zoomed !== undefined}
		/>
	</div>
{/if}
