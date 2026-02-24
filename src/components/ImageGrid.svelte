<script lang="ts">
	import cx from 'classnames';
	import { decode } from 'blurhash';
	import {
		context as contextStore,
		links as linksStore,
		note as noteStore,
		zoomed as zoomedStore,
		gridId as gridIdStore,
		videoTime as videoTimeStore,
		sharedVideoElement,
		sharedVideoIndex,
		sharedVideoGridId
	} from 'src/controller/image';
	import type { AnyKind, Kind1Parsed, ParsedEvent } from 'src/types';
	import { proxyImageUrl, ImagePresets } from 'src/lib/proxy';
	import { getContext } from 'svelte';
	import VideoTile from './VideoTile.svelte';

	export let links: { src: string; type?: 'image' | 'video'; blurhash?: string }[];
	export let note: ParsedEvent<Kind1Parsed> | undefined = undefined;
	export let context: ParsedEvent<AnyKind>[] = [];

	let isImageContext = getContext('imageContext');

	// Generate unique ID for this grid to scope transition names
	const gridId = Math.random().toString(36).substring(7);

	// Store video element references to capture current time on click
	let videoElements: Record<number, HTMLVideoElement> = {};

	// Only proxy images, bypass proxy for videos
	$: processedLinks = links.map((link) => ({
		...link,
		src: link.type === 'video' ? link.src : proxyImageUrl(link.src, ImagePresets.full)
	}));

	// Limit display to 5 items max
	$: displayLinks = processedLinks.slice(0, 5);
	$: hasMoreItems = processedLinks.length > 5;
	$: remainingCount = processedLinks.length - 5;

	$: columns = Math.ceil(Math.sqrt(displayLinks.length));

	function getSpan(i: number, fullwidth = false) {
		// how many slots are left in the row
		const slots = columns - (i % columns);
		return slots;
	}

	// Determine rounded corners based on grid position
	function getRoundedCorners(i: number, total: number): string {
		if (total === 1) {
			return 'rounded-lg'; // Single item - all corners rounded
		}
		
		const row = Math.floor(i / columns);
		const col = i % columns;
		const totalRows = Math.ceil(total / columns);
		const isLastRow = row === totalRows - 1;
		const isFirstRow = row === 0;
		const isFirstCol = col === 0;
		const isLastCol = col === columns - 1 || i === total - 1;
		
		let corners = [];
		
		// Top-left corner: first item or first column
		if (isFirstRow && isFirstCol) corners.push('rounded-tl-lg');
		// Top-right corner: first row and last column of that row
		if (isFirstRow && isLastCol) corners.push('rounded-tr-lg');
		// Bottom-left corner: last row and first column
		if (isLastRow && isFirstCol) corners.push('rounded-bl-lg');
		// Bottom-right corner: last row and last column
		if (isLastRow && isLastCol) corners.push('rounded-br-lg');
		
		return corners.join(' ');
	}

	function getBlurhashDataUrl(blurhash: string): string {
		const pixels = decode(blurhash, 32, 32);
		const canvas = new OffscreenCanvas(32, 32);
		const ctx = canvas.getContext('2d');
		if (!ctx) return '';
		const imageData = ctx.createImageData(32, 32);
		imageData.data.set(pixels);
		ctx.putImageData(imageData, 0, 0);
		return canvas.convertToBlob().then((blob) => URL.createObjectURL(blob));
	}

	function setZoom(zoom: number) {
		const updateStores = async () => {
			// Use processedLinks to keep the same URL for browser caching
			$linksStore = processedLinks;
			$zoomedStore = zoom;
			$noteStore = note;
			$contextStore = context;
			$gridIdStore = gridId;
			// Force Svelte to flush updates synchronously
			await new Promise((resolve) => setTimeout(resolve, 0));
		};

		if (document.startViewTransition) {
			document.startViewTransition(updateStores);
		} else {
			updateStores();
		}
	}
</script>

<div
	class={cx(
		'grid-cols-' + columns,
		'relative my-2 grid cursor-pointer gap-1 overflow-hidden rounded-lg'
	)}
	class:w-full={isImageContext}
>
	{#each displayLinks as link, i}
		{#if link.type === 'video'}
			<span
				class="inline-block"
				style={$zoomedStore === undefined && i === 0
					? `view-transition-name: image-zoom-${gridId}-0`
					: ''}
			>
				<VideoTile
					src={link.src.toString()}
					autoplay={processedLinks.length == 1 || i == 0}
					loop={true}
					muted={true}
					className={cx(
						i == 0 ? 'col-span-' + getSpan(i == 0 ? displayLinks.length - 1 : i) : '',
						'w-fit max-h-96',
						getRoundedCorners(i, displayLinks.length)
					)}
					bind:videoElement={videoElements[i]}
					index={i}
					gridId={gridId}
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						const videoEl = videoElements[i];
						if (videoEl) {
							// Save the actual video element to share with zoom
							$videoTimeStore = videoEl.currentTime;
							$sharedVideoElement = videoEl;
							$sharedVideoIndex = i;
							$sharedVideoGridId = gridId;
						}
						setZoom(i);
					}}
				/>
			</span>
		{:else}
			<div
				class={cx(
					'relative',
					displayLinks.length === 1 ? '' : 'h-48'
				)}
				style={$zoomedStore === undefined && i === 0
					? `view-transition-name: image-zoom-${gridId}-0`
					: ''}
			>
				<img
					class={cx(
						i == 0 ? 'col-span-' + getSpan(i == 0 ? displayLinks.length - 1 : i) : '',
						displayLinks.length === 1 ? 'max-h-96 w-auto object-contain' : 'w-full h-full object-cover',
						getRoundedCorners(i, displayLinks.length)
					)}
					style={link.blurhash ? `background-image: url('data:image/png;base64,...')` : ''}
					on:click|preventDefault|stopPropagation={() => setZoom(i)}
					src={link.src.toString()}
					loading="lazy"
				/>

				{#if hasMoreItems && i === displayLinks.length - 1}
					<div
						class="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center cursor-pointer"
						on:click|preventDefault|stopPropagation={() => setZoom(i)}
					>
						<div class="text-white text-center">
							<div class="text-2xl font-bold">+{remainingCount}</div>
							<div class="text-sm">more</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/each}
</div>
