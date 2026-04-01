<script lang="ts">
	import type { ParsedEvent, Kind20Parsed } from '@candypoets/nipworker';
	import { asKind20, fbArray } from '@candypoets/nipworker/utils';
	import Carousel from 'src/components/Carousel.svelte';

	export let note: ParsedEvent;

	$: kind20 = asKind20(note) as Kind20Parsed | null;
	$: images = kind20
		? fbArray(kind20, 'images').map((img) => ({
				src: img.url() || '',
				type: 'image' as const,
				blurhash: img.blurhash() || undefined,
				dimensions: img.dim() || undefined
			}))
		: [];
	$: title = kind20?.title?.() || '';
	$: description = kind20?.description?.() || '';
	$: hashtags = kind20 ? fbArray(kind20, 'hashtags') : [];

	// Parse dimensions string like "800x600" into aspect ratio
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
</script>

<br />
{#if images.length > 0}
	{#if images.length === 1}
		{@const aspectRatio = parseAspectRatio(images[0].dimensions)}
		<!-- Single image - full width with reserved space (fallback to 4:3 if no dimensions) -->
		<div
			class="w-full relative bg-base-200 rounded-lg overflow-hidden"
			style:aspect-ratio={aspectRatio || '4 / 3'}
		>
			<img
				src={images[0].src}
				alt={title || 'Image'}
				class="absolute inset-0 w-full h-full object-contain"
				loading="lazy"
			/>
		</div>
	{:else}
		<!-- Multiple images - carousel with aspect ratio per slide (fallback to 4:3) -->
		<div class="w-full" style:aspect-ratio={parseAspectRatio(images[0]?.dimensions) || '4 / 3'}>
			<Carousel items={images} keyboardShortcut={false} verticalPan={false} let:item>
				{@const itemAspectRatio = parseAspectRatio(item.dimensions)}
				<div
					class="w-full h-full relative bg-base-200 rounded-lg overflow-hidden flex items-center justify-center"
				>
					<img
						src={item.src}
						alt={title || 'Image'}
						class="max-w-full max-h-full object-contain"
						loading="lazy"
					/>
				</div>
			</Carousel>
		</div>
	{/if}
{/if}

{#if title}
	<h2 class="text-lg font-semibold px-1 mt-2">{title}</h2>
{/if}

{#if description}
	<p class="text-sm text-base-content/80 whitespace-pre-wrap px-1">{description}</p>
{/if}

{#if hashtags.length > 0}
	<div class="flex flex-wrap gap-1 px-1 mt-1">
		{#each hashtags as tag}
			<span class="text-primary text-sm">#{tag}</span>
		{/each}
	</div>
{/if}
