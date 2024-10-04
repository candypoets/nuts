<script lang="ts">
	import { HistoryItemType, type HistoryItem } from 'src/model/historyItem';

	import HistoryIcon from './Icon.svelte';
	import { formatAmount } from 'src/actions/wallet';
	import HistoryLabel from './Label.svelte';
	import { settings, type Setting } from 'src/stores/db';
	import { selectedTransaction } from 'src/stores';

	export let item: HistoryItem<any>;
	// $: console.log(item);

	let open = false;
</script>

<div
	on:click={() => ($selectedTransaction = item)}
	class="cursor-pointer last:border-none h-14 flex items-center justify-between mx-4"
>
	<div class="w-16 flex justify-center"><HistoryIcon {item} /></div>
	<div class="flex-grow"><HistoryLabel {item} /></div>
	<div class="text-right">
		{#if item.amount > 0}
			<span class="bg-primary-content p-1 rounded-md"
				>{formatAmount(item.amount, $settings?.unit || 'sat')}</span
			>
		{:else}
			{formatAmount(item.amount, $settings?.unit || 'sat')}
		{/if}
	</div>
</div>
