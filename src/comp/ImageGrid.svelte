<script lang="ts">
	import cx from 'classnames';
	import ImageZoom from 'src/comp/ImageZoom.svelte';

	export let links: { src: string }[];

	let zoomed: number;
	let grid: HTMLElement;
	$: columns = Math.ceil(Math.sqrt(links.length));

	function getSpan(i: number) {
		// how many slots are left in the row
		const slots = columns - (i % columns);
		return slots;
	}
</script>

<div
	bind:this={grid}
	on:click|preventDefault|stopPropagation
	class={cx(
		'grid-cols-' + columns,
		'relative my-2 grid cursor-pointer gap-1 overflow-hidden rounded-lg'
	)}
>
	{#each links as link, i}
		{#if i === 0}
			<img
				class={cx('col-span-' + getSpan(links.length - 1), 'h-full max-h-96 w-full object-cover')}
				on:click={() => (zoomed = i)}
				src={link.src.toString()}
			/>
		{:else}
			<img
				class="h-full max-h-96 w-full object-cover"
				on:click={() => (zoomed = i)}
				src={link.src.toString()}
			/>
		{/if}
	{/each}
</div>

<ImageZoom {links} bind:zoomed />
