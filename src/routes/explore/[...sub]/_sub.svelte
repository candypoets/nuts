<script lang="ts">
	import { viewport } from 'src/lib';
	import Kind0 from 'src/routes/_kinds/kind0.svelte';
	import Kind1 from 'src/routes/_kinds/kind1.svelte';
	import { cubicOut, elasticOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	export let path: string;
	export let visible: boolean;
	export let depth: number = 0;

	let element: HTMLElement;

	// Create a tweened store for the depth-based translation
	const depthTranslation = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	const depthScale = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	const depthOpacity = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	// Update the tweened value when depth changes
	$: depthTranslation.set(depth * 30); // 10px per depth level (adjust as needed)
	$: depthScale.set(Math.max(0.85, 1 - depth * 0.05)); // Reduce scale by 5% per depth level, min 85%
	$: depthOpacity.set(Math.max(0.3, 1 - depth * 0.3)); // Reduce opacity by 20% per depth level, min 50%
</script>

<div
	class="absolute right-0 top-0 h-screen p-2 z-20"
	bind:this={element}
	in:fly={{ x: $viewport.vw * 50, duration: 400, opacity: 1, easing: cubicOut }}
	out:fly={{ x: element.offsetWidth, duration: 300, opacity: 1, easing: elasticOut }}
>
	<div
		class="border border-base-300 bg-base-100 bg-opacity-70 backdrop-blur h-full rounded-xl"
		style="transform: translateX({-$depthTranslation}px) scale({$depthScale}); opacity: {$depthOpacity};"
	>
		{#if path.includes('nprofile')}
			<Kind0 pubkey={path.split(':')?.[1]} {visible} />
		{:else}
			<Kind1 postId={path.split(':')?.[1]} {visible} />
		{/if}
	</div>
</div>
