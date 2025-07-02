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

	export let links: { src: string; type?: 'image' | 'video' }[];
	export let note: ParsedEvent<Kind1Parsed> | undefined = undefined;
	export let context: ParsedEvent<AnyKind>[] = [];

	let isImageContext = getContext('imageContext');

	$: proxiedLinks = proxyMediaLinks(links, ImagePresets.thumbnail);

	$: columns = Math.ceil(Math.sqrt(proxiedLinks.length));

	function getSpan(i: number, fullwidth = false) {
		// how many slots are left in the row
		const slots = columns - (i % columns);
		return slots;
	}

	function setZoom(zoom: number) {
		$linksStore = proxiedLinks;
		$zoomedStore = zoom;
		$noteStore = note;
		$contextStore = context;
	}
</script>

<div
	class={cx(
		'grid-cols-' + columns,
		'relative my-2 grid cursor-pointer gap-1 overflow-hidden rounded-lg'
	)}
	class:w-44={isImageContext}
	class:bg-gray-300={proxiedLinks.length == 1}
	class:bg-opacity-20={proxiedLinks.length == 1}
>
	{#each proxiedLinks as link, i}
		{#if link.type === 'video'}
			<video
				class:max-h-[50vh]={proxiedLinks.length == 1}
				class:!w-auto={proxiedLinks.length == 1}
				class:m-auto={proxiedLinks.length == 1}
				class={cx(
					i == 0 ? 'col-span-' + getSpan(i == 0 ? proxiedLinks.length - 1 : i) : '',
					'h-full max-h-96 w-full object-cover'
				)}
				on:click|preventDefault|stopPropagation={() => setZoom(i)}
				src={link.src.toString()}
				muted
				autoplay
				loop
				playsinline
				webkit-playsinline
				disablePictureInPicture
			/>
		{:else}
			<img
				class:max-h-[50vh]={proxiedLinks.length == 1}
				class:!w-auto={proxiedLinks.length == 1}
				class:m-auto={proxiedLinks.length == 1}
				class={cx(
					i == 0 ? 'col-span-' + getSpan(proxiedLinks.length - 1) : '',
					'h-full max-h-96 w-full object-cover'
				)}
				on:click|preventDefault|stopPropagation={() => setZoom(i)}
				src={link.src.toString()}
				loading="lazy"
			/>
		{/if}
	{/each}
</div>
