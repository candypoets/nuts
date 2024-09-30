<script lang="ts">
	import Row from './Row.svelte';

	export let item: string | any;
</script>

<div class="lg:w-1/3 lg:m-auto">
	{#if typeof item == 'string'}
		<div class="px-4">{item}</div>
	{:else}
		<Row {item} />
	{/if}
</div>
