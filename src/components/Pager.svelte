<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy, setContext } from 'svelte';

	import Kind from 'src/routes/_kinds/index.svelte';
	import Modal from 'src/routes/modals/index.svelte';
	import { viewport } from 'src/controller/viewport';
	import { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { goBack } from 'src/routes/modals/modal';

	export let rootPath: string;

	export let subs: string[] = [];
	let modals: string[] = [];

	let depth = 0;
	let mainElement: HTMLElement;

	// Instantiate animator immediately
	let pagerAnimator = new PagerAnimator($viewport, goBack, {
		duration: 0.3,
		in: {
			sub: {
				x: ['100%', '0%'],
				y: [0, 0],
				scale: [1, 1],
				opacity: [0.5, 1]
			},
			modal: {
				x: [0, 0],
				y: ['100%', '0%'],
				scale: [1, 1],
				opacity: [0.5, 1]
			}
		},
		out: {
			sub: {
				x: '100%',
				opacity: 0.5
			},
			modal: {
				y: '100%',
				opacity: 0.5
			}
		}
	});

	// Set context immediately since pagerAnimator is now available
	setContext('animator', pagerAnimator);

	// Set main content when element is ready
	onMount(() => {
		if (mainElement && pagerAnimator) {
			pagerAnimator.setMainContent(mainElement);
		}
		return pagerAnimator.destroy;
	});

	// React to viewport changes
	$: if (pagerAnimator) {
		pagerAnimator.updateViewport($viewport);
	}
</script>

<div
	bind:this={mainElement}
	style="transform-style: preserve-3d;
		perspective: 1000px;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;"
	on:click={() => pagerAnimator.unregisterAll()}
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
