<script lang="ts">
	import { onMount, setContext } from 'svelte';
	import { page } from '$app/stores';

	// Use the item-level components instead of their index aggregators
	import Sub from 'src/routes/_kinds/_sub.svelte';
	import Modal from 'src/routes/modals/modal.svelte';

	import { viewport } from 'src/controller/viewport';
	import { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { pagerAnimators } from 'src/controller/pager';
	import { navigateStackPath, pathOptions, stackPath } from 'src/routes/modals/modal';

	export let rootPath: string;

	// Interleaved stack derived from the current URL
	type StackItem = { type: 'sub' | 'modal'; value: string };
	let stack: StackItem[] = [];

	// Matchers copied from the original Kind index
	const subPaths = ['nprofile', 'nevent', 'naddr', 'kind4', 'community', 'notifications', 'tags'];

	let mainElement: HTMLElement;

	const animator = $pagerAnimators[rootPath.replace('/', '')];

	// Provide animator to children (Sub/Modal use getContext('animator'))
	setContext('animator', animator);

	onMount(() => {
		if (mainElement && animator) {
			animator?.setMainContent(mainElement);
		}
	});

	// Update animator viewport on resize
	$: animator?.updateViewport($viewport);

	$: if (
		typeof window !== 'undefined' &&
		window.location.pathname === $page.url.pathname &&
		$stackPath !== $page.url.pathname
	) {
		stackPath.set($page.url.pathname);
	}

	// Recompute the interleaved stack from the URL
	$: {
		const rawPath = $stackPath.split(/[?#]/)[0];
		if (rawPath.startsWith(rootPath)) {
			const segments = rawPath.split('/').slice(2).filter(Boolean);

			stack = segments
				.filter((seg) => {
					const isSub = subPaths.some((p) => seg.includes(p));
					const isModal = pathOptions.some((opt) => seg.split(':')[0] === opt);
					return isSub || isModal;
				})
				.map((seg) => {
					const isModal = pathOptions.some((opt) => seg.split(':')[0] === opt);
					return { type: isModal ? 'modal' : 'sub', value: seg };
				});
		} else {
			stack = [];
		}
	}

	function handleMainClick(event: MouseEvent) {
		if (event.target !== mainElement) return;
		animator.unregisterAll(() => navigateStackPath(rootPath));
	}
</script>

<div
	bind:this={mainElement}
	style="transform-style: preserve-3d;
		perspective: 1000px;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;"
	on:click={handleMainClick}
	class="will-change-transform transition-gpu"
>
	<slot />
</div>

{#each stack as item, index (`${index}:${item.type}:${item.value}`)}
	{#if item.type === 'sub'}
		<Sub path={item.value} visible={index === stack.length - 1} depth={stack.length - 1 - index} />
	{:else}
		<Modal path={item.value} depth={stack.length - 1 - index} visible />
	{/if}
{/each}
