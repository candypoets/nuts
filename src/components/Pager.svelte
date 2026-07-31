<script lang="ts">
	import { onMount, setContext } from 'svelte';
	import { page } from '$app/stores';

	// Use the item-level components instead of their index aggregators
	import Sub from 'src/routes/_kinds/_sub.svelte';
	import Modal from 'src/routes/modals/modal.svelte';

	import { viewport } from 'src/controller/viewport';
	import { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { pagerSegmentType, type PagerStackItemType } from 'src/lib/pagerRoutes';
	import { pagerAnimators } from 'src/controller/pager';
	import {
		createPagerNavigation,
		navigateStackPath,
		PAGER_NAVIGATION_CONTEXT,
		pathOptions,
		stackPath
	} from 'src/routes/modals/modal';

	export let rootPath: string;

	// Interleaved stack derived from the current URL
	type StackItem = { type: PagerStackItemType; value: string };
	let stack: StackItem[] = [];

	let mainElement: HTMLElement;

	const animator = $pagerAnimators[rootPath.replace('/', '')];
	const navigation = createPagerNavigation(rootPath);

	// Provide animator to children (Sub/Modal use getContext('animator'))
	setContext('animator', animator);
	setContext(PAGER_NAVIGATION_CONTEXT, navigation);

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

			stack = segments.flatMap((segment) => {
				const type = pagerSegmentType(segment, pathOptions);
				return type ? [{ type, value: segment }] : [];
			});
		} else {
			stack = [];
		}
	}

	function handleMainClick(event: MouseEvent) {
		if (!animator || !stack.length) return;
		if (event.target instanceof Element && event.target.closest('[data-kind]')) return;
		animator.unregisterAll(() => navigation.root());
	}
</script>

<div
	bind:this={mainElement}
	style={animator
		? 'transform-style: preserve-3d; perspective: 1000px; backface-visibility: hidden; -webkit-backface-visibility: hidden;'
		: undefined}
	on:click={handleMainClick}
	class:will-change-transform={Boolean(animator)}
	class:transition-gpu={Boolean(animator)}
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
