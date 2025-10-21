<script lang="ts">
	import cx from 'classnames';
	import {
		context as contextStore,
		links as linksStore,
		note as noteStore,
		zoomed as zoomedStore
	} from 'src/controller/image';
	import type { AnyKind, Kind1Parsed, ParsedEvent } from 'src/types';
	import { proxyMediaLinks, ImagePresets } from 'src/lib/proxy';
	import { getContext } from 'svelte';
	import { go } from 'src/routes/modals/modal';

	export let links: { src: string; type?: 'image' | 'video' }[];
	export let note: ParsedEvent<Kind1Parsed> | undefined = undefined;
	export let context: ParsedEvent<AnyKind>[] = [];

	let isImageContext = getContext('imageContext');

	$: proxiedLinks = proxyMediaLinks(links, ImagePresets.full);
	$: fullQualityLinks = proxyMediaLinks(links, ImagePresets.full);

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

	function setZoom(zoom: number) {
		$linksStore = fullQualityLinks;
		$zoomedStore = zoom;
		$noteStore = note;
		$contextStore = context;
		go('zoom');
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
			<video
				class:max-h-[50vh]={displayLinks.length == 1}
				class:!w-auto={displayLinks.length == 1}
				class:m-auto={displayLinks.length == 1}
				class={cx(
					i == 0 ? 'col-span-' + getSpan(i == 0 ? displayLinks.length - 1 : i) : '',
					'h-96 w-full object-cover'
				)}
				on:click|preventDefault|stopPropagation={() => setZoom(i)}
				src={link.src.toString()}
				muted
				autoplay={proxiedLinks.length == 1 || i == 0}
				loop
				playsinline
				webkit-playsinline
				disablePictureInPicture
			/>
		{:else}
			<div class="relative">
				<img
					class:max-h-[50vh]={displayLinks.length == 1}
					class:!h-48={displayLinks.length > 2}
					class:!w-auto={displayLinks.length == 1}
					class:m-auto={displayLinks.length == 1}
					class={cx(
						i == 0 ? 'col-span-' + getSpan(displayLinks.length - 1) : '',
						'max-h-96 w-full object-cover'
					)}
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
