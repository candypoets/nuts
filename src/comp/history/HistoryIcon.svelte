<script lang="ts">
	import Icon from '@iconify/svelte';
	import { HistoryItemType } from '../../model/historyItem';

	export let type: HistoryItemType;
</script>

{#if type === HistoryItemType.SEND}
	<Icon icon="fluent:send-20-filled" />
{:else if type === HistoryItemType.RECEIVE}
	<Icon icon="bitcoin-icons:receive-filled" />
{:else if type === HistoryItemType.RECEIVE_OFFLINE}
	<Icon icon="mdi:cellphone-nfc" />
{:else if type === HistoryItemType.MELT}
	<Icon icon="ph:lightning-bold" class="text-warning" />
{:else if type === HistoryItemType.RECEIVE_NOSTR}
	<Icon icon="game-icons:bird-mask" />
{:else}
	<Icon icon="gala:add" />
{/if}
