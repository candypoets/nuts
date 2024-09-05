<script lang="ts">
	import Icon from '@iconify/svelte';
	import { HistoryItemType } from 'src/model/historyItem';

	export let type: HistoryItemType;
</script>

{#if type === HistoryItemType.SEND}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="fluent:send-20-filled" />
	</div>
{:else if type === HistoryItemType.RECEIVE}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="bitcoin-icons:receive-filled" />
	</div>
{:else if type === HistoryItemType.CHANGE}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="la:exchange-alt" />
	</div>
{:else if type === HistoryItemType.RECEIVE_OFFLINE}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="mdi:cellphone-nfc" />
	</div>
{:else if type === HistoryItemType.MELT}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="ph:lightning-bold" class="text-warning" />
	</div>
{:else if type === HistoryItemType.RECEIVE_NOSTR}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="game-icons:bird-mask" />
	</div>
{:else}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="gala:add" />
	</div>
{/if}
