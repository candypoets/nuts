<script lang="ts">
	import { onMount } from 'svelte';

	export let link:
		| {
				type: string;
				value: string;
				isLink: boolean;
				href: string;
				start: number;
				end: number;
		  }
		| undefined = undefined;

	let image: HTMLImageElement | null = null;

	let height: number = 0;
	let width: number = 0;

	onMount(() => {
		image.onload = () => {
			height = (image?.height || 0) * 2;
			width = (image?.width || 0) * 2;
		};
	});
</script>

<a href={link?.value} data-pswp-width={width} data-pswp-height={height} target="_blank">
	<img src={link?.value} alt="" bind:this={image} />
</a>
