<script lang="ts">
	import { goto } from '$app/navigation';
	import { cubicOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';

	import { viewport } from 'src/lib';
	import Kind from 'src/routes/_kinds/index.svelte';

	export let rootPath: string;

	let subs: string[] = [];

	$: tweenedValue = tweened(0, {
		duration: 400,
		easing: cubicOut
	});
	$: {
		if (subs && subs.length > 0) {
			tweenedValue.set(1);
		} else {
			tweenedValue.set(0);
		}
	}

	// Create a tweened store for the depth-based translation
	const depthTranslation = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	// Update the tweened value when depth changes
	$: depthTranslation.set(subs.length * 30); // 10px per depth level (adjust as needed)
</script>

<div
	style="transform: translateX({-$tweenedValue *
		($viewport.vw * 20 + $depthTranslation)}px) rotateY({$tweenedValue * -20}deg);
         transform-style: preserve-3d; perspective: 1000px;"
	on:click={() => goto(rootPath)}
>
	<slot />
</div>
<Kind {rootPath} bind:subs />
