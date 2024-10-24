<script lang="ts">
	import { onMount } from 'svelte';

	export let link:
		| {
				type: string;
				value: string;
		  }
		| undefined = undefined;

	let image: HTMLImageElement | null = null;

	let height: number = 0;
	let width: number = 0;

	onMount(() => {
		image.onload = () => {
			height = (image?.height || 0) * 10;
			width = (image?.width || 0) * 10;
		};
	});
</script>

<img src={link?.value} alt="" bind:this={image} class="rounded-lg" />
