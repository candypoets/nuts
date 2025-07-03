<script lang="ts">
	import { goto } from '$app/navigation';
	import { cubicOut, quintOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';

	import Kind from 'src/routes/_kinds/index.svelte';
	import Modal from 'src/routes/modals/index.svelte';
	import { viewport } from 'src/controller/viewport';

	export let rootPath: string;

	export let subs: string[] = [];
	let modals: string[] = [];

	let depth = 0;

	$: subTweened = tweened(0, {
		duration: 600,
		easing: quintOut
	});

	$: modalTweened = tweened(0, {
		duration: 500,
		easing: quintOut
	});

	$: {
		if (modals && modals.length > 0) {
			modalTweened.set(1);
		} else {
			modalTweened.set(0);
		}
	}

	$: {
		if (subs && subs.length > 0) {
			subTweened.set(1);
		} else {
			subTweened.set(0);
		}
	}

	// Create a tweened store for the depth-based translation
	const subDepth = tweened(0, {
		duration: 600,
		easing: quintOut
	});

	// Create a tweened store for the modal depth-based translation
	const modalDepth = tweened(0, {
		duration: 500,
		easing: quintOut
	});

	// Update the modal tweened value when depth changes
	$: modalDepth.set(depth * 30); // 10px per depth level

	// Update the tweened value when depth changes
	$: subDepth.set(subs.length * 30); // 10px per depth level

	$: console.log(modals);
</script>

<div
	style="transform: translate3d({-$subTweened *
		($viewport.vw * 20 + $subDepth)}px, {-$modalDepth}px, 0)
		scale({(200 - $modalDepth) / 200}) rotateY({$subTweened * -20}deg);
		transform-style: preserve-3d;
		perspective: 1000px;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;"
	on:click={() => goto(rootPath)}
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
