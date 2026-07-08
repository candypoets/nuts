<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { asKind20, asKind22, fbArray } from '@candypoets/nipworker/utils';
	import Carousel from 'src/components/Carousel.svelte';
	import ImageGrid from 'src/components/ImageGrid.svelte';

	export let note: ParsedEvent;
	export let visible = false;

	type MediaItem = {
		src: string;
		type: 'image' | 'video';
		blurhash?: string;
		dim?: string;
		dimensions?: string;
		poster?: string;
	};

	$: kind20 = asKind20(note);
	$: kind22 = asKind22(note);
	$: mediaItems = kind20
		? fbArray(kind20, 'images').map((img) => ({
				src: img.url() || '',
				type: 'image' as const,
				blurhash: img.blurhash() || undefined,
				dim: img.dim() || undefined,
				dimensions: img.dim() || undefined
			}))
		: kind22
			? fbArray(kind22, 'videos').map((video) => ({
					src: video.url() || '',
					type: 'video' as const,
					blurhash: video.image() || undefined,
					dim: video.dim() || undefined,
					dimensions: video.dim() || undefined,
					poster: video.image() || undefined
				}))
		: [];
	$: visibleMediaItems = mediaItems.filter((item: MediaItem) => item.src);
	$: hasVideo = visibleMediaItems.some((item: MediaItem) => item.type === 'video');
	$: title = kind20?.title?.() || kind22?.title?.() || '';
	$: description = kind20?.description?.() || kind22?.description?.() || '';
	$: hashtags = kind20 ? fbArray(kind20, 'hashtags') : kind22 ? fbArray(kind22, 'hashtags') : [];

	// Parse dimensions string like "800x600" into aspect ratio
	// Bounded between 1:2 (0.5) and 2:1 (2.0) to prevent extreme portrait/landscape jumps
	function parseAspectRatio(dimStr: string | undefined): number | null {
		if (!dimStr) return null;
		const match = dimStr.match(/(\d+)x(\d+)/);
		if (match) {
			const w = parseInt(match[1], 10);
			const h = parseInt(match[2], 10);
			if (h > 0) {
				const ratio = w / h;
				// Clamp between 1:2 and 2:1 to prevent viewport-filling images
				return Math.max(0.5, Math.min(2.0, ratio));
			}
		}
		return null;
	}

	function stopTouchPropagation(event: TouchEvent) {
		event.stopPropagation();
	}
</script>

<br />
{#if visibleMediaItems.length > 0}
	{#if hasVideo}
		<ImageGrid {note} {visible} links={visibleMediaItems} fullWidthVideos />
	{:else if visibleMediaItems.length === 1}
		{@const aspectRatio = parseAspectRatio(visibleMediaItems[0].dimensions)}
		<!-- Single image - full width with reserved space (fallback to 4:3 if no dimensions) -->
		<div
			class="w-full relative bg-base-200 overflow-hidden"
			style:aspect-ratio={aspectRatio || '4 / 3'}
		>
			<img
				src={visibleMediaItems[0].src}
				alt={title || 'Image'}
				class="absolute inset-0 w-full h-full object-contain"
				loading="lazy"
			/>
		</div>
	{:else}
		<!-- Multiple images - carousel with unified aspect ratio (prevents height jumps between slides) -->
		{@const firstImageAspect = parseAspectRatio(visibleMediaItems[0]?.dimensions)}
		<div
			class="w-full"
			style:aspect-ratio={firstImageAspect || '4 / 3'}
			on:touchstart={stopTouchPropagation}
			on:touchmove={stopTouchPropagation}
			on:touchend={stopTouchPropagation}
		>
			<Carousel
				items={visibleMediaItems}
				keyboardShortcut={false}
				verticalPan={false}
				forceAspectRatio={firstImageAspect || 4/3}
				noGap={true}
				autoFocus={false}
				let:item
				let:forcedAspectRatio
			>
				{@const slideAspectRatio = forcedAspectRatio ?? parseAspectRatio(item.dimensions)}
				<div
					class="w-full h-full relative bg-base-200 overflow-hidden flex items-center justify-center"
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
