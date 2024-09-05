<script lang="ts">
	import type { HistoryData } from 'src/model/data/HistoryData';
	import { HistoryItemType, type HistoryItem } from 'src/model/historyItem';
	import { getContact } from 'src/stores/contacts';

	export let item: HistoryItem<HistoryData>;
</script>

<div>
	{#if item.type === HistoryItemType.SEND}
		{#await getContact(item?.data?.to || '')}
			unknown
		{:then send}
			{send?.name || 'unknown'}
		{:catch}
			unknown
		{/await}
	{:else if item.type === HistoryItemType.RECEIVE}
		Received
	{:else if item.type === HistoryItemType.CHANGE}
		Change
	{:else if item.type === HistoryItemType.RECEIVE_OFFLINE}
		Received Offline
	{:else if item.type === HistoryItemType.MELT}
		Sent via lightning
	{:else if item.type === HistoryItemType.RECEIVE_NOSTR}
		{#await getContact(item?.data?.from || '')}
			unknown
		{:then send}
			{send?.name || 'unknown'}
		{:catch}
			unknown
		{/await}
	{:else}
		Top up
	{/if}
</div>
