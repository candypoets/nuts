<script lang="ts">
	import { onMount } from 'svelte';
	import VaulDrawer from './MobileDrawer.svelte';

	export let isOpen = false;

	let isMobile = false;

	onMount(() => {
		isMobile = window.innerWidth <= 600;
		const handleResize = () => {
			isMobile = window.innerWidth <= 600;
		};
		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

{#if isMobile}
	<VaulDrawer {isOpen} />
{:else if isOpen}
	<div class="sheet">
		<h2>Sheet Content</h2>
		<p>This is an empty sheet. Add your content here.</p>
		<button on:click={() => (isOpen = false)}>Close</button>
	</div>
{/if}

<style>
	.sheet {
		position: fixed;
		background-color: #ffffff;
		padding: 20px;
		box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
		z-index: 1000;
		top: 0;
		right: 0;
		bottom: 0;
		width: 300px;
	}
</style>
