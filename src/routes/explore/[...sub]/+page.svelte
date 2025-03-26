<script lang="ts">
	import { page } from '$app/stores';
	import Sub from './_sub.svelte';

	let visible = true;

	$: subs = $page.params.sub.split('/').filter((sub) => sub !== '');
	$: console.log(subs, $page.params.sub);
</script>

{#each subs as sub, index}
	<Sub path={sub} {visible} depth={subs.length - 1 - index} />
{/each}
