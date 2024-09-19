<script lang="ts">
	import Icon from '@iconify/svelte';
	import { type HistoryData } from 'src/model/data/HistoryData';
	import { HistoryItemType, type HistoryItem } from 'src/model/historyItem';
	import { getContact } from 'src/stores/contacts';

	export let item: HistoryItem<HistoryData>;
</script>

{#if item.type === HistoryItemType.SEND}
	{#await getContact(item?.data?.to || '')}
		<div class="rounded-full border p-2 flex items-center justify-center">
			<Icon icon="fluent:send-20-filled" />
		</div>
	{:then send}
		{#if send.picture}
			<img src={send.picture} class="w-8 h-8 rounded-full" />
		{:else}
			<div class="rounded-full border p-2 flex items-center justify-center">
				<Icon icon="fluent:send-20-filled" />
			</div>
		{/if}
	{:catch}
		<div class="rounded-full border p-2 flex items-center justify-center">
			<Icon icon="fluent:send-20-filled" />
		</div>
	{/await}
{:else if item.type === HistoryItemType.RECEIVE}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="bitcoin-icons:receive-filled" />
	</div>
{:else if item.type === HistoryItemType.CHANGE}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="la:exchange-alt" />
	</div>
{:else if item.type === HistoryItemType.RECEIVE_OFFLINE}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="mdi:cellphone-nfc" />
	</div>
{:else if item.type === HistoryItemType.MELT}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="ph:lightning-bold" class="text-warning" />
	</div>
{:else if item.type === HistoryItemType.RECEIVE_NOSTR}
	{#await getContact(item?.data?.from || '')}
		<div class="rounded-full border p-2 flex items-center justify-center">
			<Icon icon="game-icons:bird-mask" />
		</div>
	{:then send}
		<img src={send.picture} class="w-8 h-8 rounded-full" />
	{:catch}
		<div class="rounded-full border p-2 flex items-center justify-center">
			<Icon icon="game-icons:bird-mask" />
		</div>
	{/await}
{:else if item.type === HistoryItemType.RECEIVE_NUTZAP}
	{#await getContact(item?.data?.from || '')}
		<div class="rounded-full border p-2 flex items-center justify-center">
			<Icon icon="game-icons:bird-mask" />
		</div>
	{:then send}
		{#if send.picture}
			<img src={send.picture} class="w-8 h-8 rounded-full" />
		{:else}
			<div class="rounded-full border p-2 flex items-center justify-center">
				<Icon icon="fluent:send-20-filled" />
			</div>
		{/if}
	{:catch}
		<div class="rounded-full border p-2 flex items-center justify-center">
			<Icon icon="game-icons:bird-mask" />
		</div>
	{/await}
{:else if item.type === HistoryItemType.SEND_NUTZAP}
	{#await getContact(item?.data?.to || '')}
		<div class="rounded-full border p-2 flex items-center justify-center">
			<Icon icon="fluent:send-20-filled" />
		</div>
	{:then send}
		{#if send.picture}
			<img src={send.picture} class="w-8 h-8 rounded-full" />
		{:else}
			<div class="rounded-full border p-2 flex items-center justify-center">
				<Icon icon="fluent:send-20-filled" />
			</div>
		{/if}
	{:catch}
		<div class="rounded-full border p-2 flex items-center justify-center">
			<Icon icon="fluent:send-20-filled" />
		</div>
	{/await}
	<!-- </div> -->
{:else}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="gala:add" />
	</div>
{/if}
