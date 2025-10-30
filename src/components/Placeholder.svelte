<script lang="ts">
	export let visible = false;
	export let minHeight = 0;

	let toggleVisible = visible;

	let container: HTMLElement;

	function toggle(visible: boolean) {
		const newHeight = container?.offsetHeight;
		minHeight = newHeight;
		toggleVisible = visible;
	}

	$: toggle(visible);
</script>

<div style="min-height: {minHeight}px;" bind:this={container}>
	{#if toggleVisible}
		<slot />
	{:else}
		<div></div>
	{/if}
</div>
