<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy, setContext } from 'svelte';

	import Kind from 'src/routes/_kinds/index.svelte';
	import Modal from 'src/routes/modals/index.svelte';
	import { viewport } from 'src/controller/viewport';
	import { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { goBack } from 'src/routes/modals/modal';
	import { pagerAnimators } from 'src/controller/pager';

	export let rootPath: string;

	export let subs: string[] = [];
	let modals: string[] = [];

	let depth = 0;
	let mainElement: HTMLElement;

	const animator = $pagerAnimators[rootPath.replace('/', '')];

	// Set context immediately since pagerAnimator is now available
	setContext('animator', animator);

	// Set main content when element is ready
	onMount(() => {
		if (mainElement && animator) {
			animator?.setMainContent(mainElement);
		}
	});

	// React to viewport changes
	$: animator?.updateViewport($viewport);
</script>

<div
	bind:this={mainElement}
	style="transform-style: preserve-3d;
		perspective: 1000px;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;"
	on:click={() => animator.unregisterAll()}
	class="will-change-transform transition-gpu"
>
	<slot />
</div>

<Kind {rootPath} bind:subs {modals} />

<Modal {rootPath} bind:modals bind:depth />

<style>
	.transition-gpu {
		transform-origin: center center;
		contain: layout style paint;
		will-change: transform;
	}
</style>
