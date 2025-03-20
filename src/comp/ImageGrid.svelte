<script lang="ts">
	import cx from 'classnames';
	import ImageZoom from 'src/comp/ImageZoom.svelte';

	export let links: { src: string; type?: 'image' | 'video' }[];

	let zoomed: number;
	$: columns = Math.ceil(Math.sqrt(links.length));

	function getSpan(i: number, fullwidth = false) {
		// how many slots are left in the row
		const slots = columns - (i % columns);
		return slots;
	}
</script>

<div
	on:click|preventDefault|stopPropagation
	class={cx(
		'grid-cols-' + columns,
		'relative my-2 grid cursor-pointer gap-1 overflow-hidden rounded-lg'
	)}
>
	{#each links as link, i}
		{#if link.type === 'video'}
			<video
				class={cx(
					i == 0 ? 'col-span-' + getSpan(i == 0 ? links.length - 1 : i) : '',
					'h-full max-h-96 w-full object-cover'
				)}
				on:click={() => (zoomed = i)}
				src={link.src.toString()}
				controls
				muted
				autoplay
				loop
			/>
		{:else}
			<img
				class={cx(
					i == 0 ? 'col-span-' + getSpan(links.length - 1) : '',
					'h-full max-h-96 w-full object-cover'
				)}
				on:click={() => (zoomed = i)}
				src={link.src.toString()}
			/>
		{/if}
	{/each}
</div>

<ImageZoom {links} bind:zoomed />
