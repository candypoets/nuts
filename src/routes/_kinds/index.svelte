<script lang="ts">
	import { page } from '$app/stores';
	import Sub from './_sub.svelte';

	export let rootPath = '/explore';

	export let subs: string[] = [];

	export let modals: string[] = [];

	const subPaths = ['nprofile', 'nevent', 'kind4', 'community', 'notifications', 'tags'];

	function rawPathname() {
		return $page.url.href.replace($page.url.origin, '').split(/[?#]/)[0];
	}

	// Update subs based on route
	$: {
		const path = rawPathname();
		if (path.startsWith(rootPath)) {
			subs = path
				.split('/')
				.slice(2)
				.filter((sub) => subPaths.some((path) => sub.includes(path)));
		}
	}
</script>

{#each subs as sub, index (`${index}:${sub}`)}
	<Sub
		path={sub}
		visible={index == subs.length - 1}
		depth={subs.length - 1 - index}
		modalDepth={modals.length}
	/>
{/each}
