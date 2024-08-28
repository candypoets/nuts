<script lang="ts">
	import Home from './home/+page.svelte';
	import { onMount } from 'svelte';
	import { updateVc } from 'src/lib';

	onMount(updateVc);
</script>

<Home />
