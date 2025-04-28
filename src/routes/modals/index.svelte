<script lang="ts">
	import { page } from '$app/stores';
	import Modal from 'src/routes/modals/modal.svelte';
	import { pathOptions } from './modal';

	export let rootPath = '/home';

	let visible = true;

	export let modals: string[] = [];

	$: {
		if ($page.url.pathname.startsWith(rootPath)) {
			modals = $page.url.pathname
				.split('/')
				.slice(2)
				.filter((sub) => pathOptions.some((option) => sub.split(':')[0] == option));
		}
	}
</script>

{#each modals as sub, index}
	<Modal path={sub} {visible} depth={modals.length - 1 - index} />
{/each}
