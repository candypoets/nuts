<script lang="ts">
	import { page } from '$app/stores';
	import Sub from './_sub.svelte';

	export let rootPath = '/explore';

	let visible = true;

	export let subs: string[] = [];

	$: {
		if ($page.url.pathname.startsWith(rootPath)) {
			subs = $page.url.pathname
				.split('/')
				.slice(2)
				.filter((sub) => sub !== '');
		}
	}
	$: console.log('rootPath', rootPath, subs);
</script>

{#each subs as sub, index}
	<Sub path={sub} {visible} depth={subs.length - 1 - index} />
{/each}
