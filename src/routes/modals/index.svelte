<script lang="ts">
	import { page } from '$app/stores';
	import Modal from 'src/routes/modals/modal.svelte';
	import { pathOptions } from './modal';

	export let rootPath = '/home';

	let visible = true;

	export let modals: string[] = [];
	export let depth = 0;

	$: {
		if ($page.url.pathname.startsWith(rootPath)) {
			modals = $page.url.pathname
				.split('/')
				.slice(2)
				.filter((sub) => pathOptions.some((option) => sub.split(':')[0] == option));

			depth = modals.filter((m) => !m.startsWith('minted')).length;
		}
	}

	$: console.log('modals: ', rootPath, modals);
</script>

{#each modals as sub, index (sub)}
	<Modal path={sub} {visible} depth={modals.length - 1 - index} />
{/each}
