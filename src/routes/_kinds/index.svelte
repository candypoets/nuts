<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import Sub from './_sub.svelte';
	import { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { viewport } from 'src/controller/viewport';

	export let rootPath = '/explore';

	export let subs: string[] = [];

	export let modals: string[] = [];

	const subPaths = ['nprofile', 'nevent', 'kind4', 'notifications', 'tags'];

	// Update subs based on route
	$: {
		if ($page.url.pathname.startsWith(rootPath)) {
			subs = $page.url.pathname
				.split('/')
				.slice(2)
				.filter((sub) => subPaths.some((path) => sub.includes(path)));
		}
	}
</script>

{#each subs as sub, index}
	<Sub
		path={sub}
		visible={index == subs.length - 1}
		depth={subs.length - 1 - index}
		modalDepth={modals.length}
	/>
{/each}
