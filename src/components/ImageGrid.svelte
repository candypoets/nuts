<script lang="ts">
	import cx from 'classnames';
	import {
		context as contextStore,
		links as linksStore,
		note as noteStore,
		zoomed as zoomedStore
	} from 'src/controller/image';
	import type { AnyKind, Kind1Parsed, ParsedEvent } from 'src/types';
	import { getContext } from 'svelte';

	export let links: { src: string; type?: 'image' | 'video' }[];
	export let note: ParsedEvent<Kind1Parsed> | undefined = undefined;
	export let context: ParsedEvent<AnyKind>[] = [];

	let isImageContext = getContext('imageContext');

	$: columns = Math.ceil(Math.sqrt(links.length));

	function getSpan(i: number, fullwidth = false) {
		// how many slots are left in the row
		const slots = columns - (i % columns);
		return slots;
	}

	function setZoom(zoom: number) {
		$linksStore = links;
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
	class:bg-gray-300={links.length == 1}
	class:bg-opacity-20={links.length == 1}
>
	{#each links as link, i}
		{#if link.type === 'video'}
			<video
				class:max-h-[50vh]={links.length == 1}
				class:!w-auto={links.length == 1}
				class:m-auto={links.length == 1}
				class={cx(
					i == 0 ? 'col-span-' + getSpan(i == 0 ? links.length - 1 : i) : '',
					'h-full max-h-96 w-full object-cover'
				)}
				on:click|preventDefault|stopPropagation={() => setZoom(i)}
				src={link.src.toString()}
				controls
				muted
				autoplay
				loop
				loading="lazy"
			/>
		{:else}
			<img
				class:max-h-[50vh]={links.length == 1}
				class:!w-auto={links.length == 1}
				class:m-auto={links.length == 1}
				class={cx(
					i == 0 ? 'col-span-' + getSpan(links.length - 1) : '',
					'h-full max-h-96 w-full object-cover'
				)}
				on:click|preventDefault|stopPropagation={() => setZoom(i)}
				src={link.src.toString()}
				loading="lazy"
			/>
		{/if}
	{/each}
</div>
