<script lang="ts">
	import { getContext, onDestroy, onMount } from 'svelte';

	export let visible = false;
	export let minHeight = 0;
	export let id: string | number | undefined = undefined;

	let toggleVisible = visible;

	let container: HTMLElement;
	let resizeObserver: ResizeObserver | null = null;

	const heightContext = getContext<{
		setHeight: (id: string | number, height: number) => void;
		deleteHeight: (id: string | number) => void;
	}>('noteHeights');

	function toggle(visible: boolean) {
		toggleVisible = visible;
	}

	$: toggle(visible);

	onMount(() => {
		if (!container || !id) return;

		// Create ResizeObserver to watch for height changes
		resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const h = entry.contentRect.height;
				minHeight = h;
				if (heightContext?.setHeight) {
					heightContext.setHeight(id, h);
				}
			}
		});

		resizeObserver.observe(container);

		// Initial height report
		const initialHeight = container.getBoundingClientRect().height;
		if (initialHeight > 0 && heightContext?.setHeight) {
			heightContext.setHeight(id, initialHeight);
		}
	});

	onDestroy(() => {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		if (id && heightContext?.deleteHeight) {
			heightContext.deleteHeight(id);
		}
	});
</script>

<div bind:this={container} style="min-height: {minHeight}px;">
	{#if toggleVisible}
		<div class:invisible={!visible}>
			<slot />
		</div>
	{:else}
		<div></div>
	{/if}
</div>
