<script lang="ts">
	import Base from './home/+page.svelte';
	import { theme } from '../stores/theme';
	import { onMount } from 'svelte';
	import { updateVc } from 'src/lib';

	onMount(updateVc);
</script>

<Base />
