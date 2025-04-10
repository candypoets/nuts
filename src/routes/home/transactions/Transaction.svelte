<script lang="ts">
	import Row from './Row.svelte';

	export let item: string | any;
</script>

<div class="w-feed lg:m-auto">
	{#if typeof item == 'string'}
		<div class="px-4 text-sm font-bold border-t pt-4">{item}</div>
	{:else}
		<Row {item} />
	{/if}
</div>
