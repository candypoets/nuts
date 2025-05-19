<script lang="ts">
	import { viewport } from 'src/lib';
	import Kind0 from 'src/routes/_kinds/kind0.svelte';
	import Kind1 from 'src/routes/_kinds/kind1.svelte';
	import Kind4 from 'src/routes/_kinds/kind4.svelte';
	import Notifications from 'src/routes/notifications/index.svelte';

	import { cubicOut, elasticOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	export let path: string;
	export let visible: boolean;
	export let depth: number = 0;
	export let modalDepth: number = 0;

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

	const modalDepthTranslation = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	const modalDepthScale = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	const modalDepthOpacity = tweened(1, {
		duration: 400,
		easing: cubicOut
	});

	// Update the tweened value when depth changes
	$: depthTranslation.set(depth * 30); // 10px per depth level (adjust as needed)
	$: depthScale.set(Math.max(0.85, 1 - depth * 0.05)); // Reduce scale by 5% per depth level, min 85%
	$: depthOpacity.set(Math.max(0.3, 1 - depth * 0.3)); // Reduce opacity by 20% per depth level, min 50%

	// Update the tweened value when modalDepth changes
	$: modalDepthTranslation.set(modalDepth * 30); // 10px per modalDepth level
	$: modalDepthScale.set(Math.max(0.85, 1 - modalDepth * 0.05)); // Reduce scale by 5% per modalDepth level, min 85%

	$: scale = $modalDepthScale * $depthScale;
</script>

<div
	class="absolute right-0 top-0 h-screen p-2 z-20"
	bind:this={element}
	in:fly={{ x: $viewport.vw * 50, duration: 400, opacity: 1, easing: cubicOut }}
	out:fly={{ x: element.offsetWidth, duration: 300, opacity: 1, easing: elasticOut }}
>
	<div
		class="border bg-base-300 bg-opacity-80 border-base-300 h-full rounded-xl overflow-hidden px-2"
		style="transform: translateX({-$depthTranslation}px) translateY(-{$modalDepthTranslation}px) scale({scale}); opacity: {$depthOpacity};"
	>
		{#if path.includes('nprofile')}
			<Kind0 pubkey={path.split(':')?.[1]} {visible} />
		{:else if path.includes('nevent')}
			<Kind1 postId={path.split(':')?.[1]} {visible} />
		{:else if path.includes('kind4')}
			<Kind4 pubkey={path.split(':')?.[1]} {visible} />
		{:else if path.includes('notifications')}
			<Notifications />
		{/if}
	</div>
</div>
