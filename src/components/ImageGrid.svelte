<script lang="ts">
	import cx from 'classnames';
	import { decode } from 'blurhash';
	import {
		context as contextStore,
		links as linksStore,
		note as noteStore,
		zoomed as zoomedStore,
		gridId as gridIdStore,
		videoTime as videoTimeStore
	} from 'src/controller/image';
	import type { AnyKind, Kind1Parsed, ParsedEvent } from 'src/types';
	import { proxyMediaLinks, ImagePresets } from 'src/lib/proxy';
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

	$: proxiedLinks = proxyMediaLinks(links, ImagePresets.full);

	// Limit display to 5 items max
	$: displayLinks = proxiedLinks.slice(0, 5);
	$: hasMoreItems = proxiedLinks.length > 5;
	$: remainingCount = proxiedLinks.length - 5;

	$: columns = Math.ceil(Math.sqrt(displayLinks.length));

	function getSpan(i: number, fullwidth = false) {
		// how many slots are left in the row
		const slots = columns - (i % columns);
		return slots;
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
			// Use proxiedLinks to keep the same URL for browser caching
			$linksStore = proxiedLinks;
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
	class:bg-gray-300={displayLinks.length == 1}
	class:bg-opacity-20={displayLinks.length == 1}
>
	{#each displayLinks as link, i}
		{#if link.type === 'video'}
			<span
				style={$zoomedStore === undefined && i === 0
					? `view-transition-name: image-zoom-${gridId}-0`
					: ''}
			>
				<VideoTile
					src={link.src.toString()}
					autoplay={proxiedLinks.length == 1 || i == 0}
					loop={true}
					muted={true}
					className={cx(
						i == 0 ? 'col-span-' + getSpan(i == 0 ? displayLinks.length - 1 : i) : '',
						'max-h-[50vh]:data-[single=true] !w-auto:data-[single=true] m-auto:data-[single=true] h-96'
					)}
					bind:videoElement={videoElements[i]}
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						const videoEl = videoElements[i];
						if (videoEl) {
							$videoTimeStore = videoEl.currentTime;
						}
						setZoom(i);
					}}
				/>
			</span>
		{:else}
			<div
				class="relative"
				style={$zoomedStore === undefined && i === 0
					? `view-transition-name: image-zoom-${gridId}-0`
					: ''}
			>
				<img
					class:max-h-[50vh]={displayLinks.length == 1}
					class:!h-48={displayLinks.length > 1}
					class:!w-auto={displayLinks.length == 1}
					class:m-auto={displayLinks.length == 1}
					class={cx(
						i == 0 ? 'col-span-' + getSpan(displayLinks.length - 1) : '',
						'w-full object-cover'
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
