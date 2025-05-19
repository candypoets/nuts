<script lang="ts">
	import { page } from '$app/stores';
	import Sub from './_sub.svelte';

	export let rootPath = '/explore';

	export let subs: string[] = [];

	export let modals: string[] = [];

	const subPaths = ['nprofile', 'nevent', 'kind4', 'notifications'];

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
