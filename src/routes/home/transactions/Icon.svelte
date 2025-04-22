<script lang="ts">
	import Icon from '@iconify/svelte';
	import { type HistoryData } from 'src/model/data/HistoryData';
	import { HistoryItemType, type HistoryItem } from 'src/model/historyItem';
	import PictureProfile from 'src/routes/explore/_post/picture-profile.svelte';
	import { getContact } from 'src/stores/contacts';

	export let item: HistoryItem<HistoryData>;
</script>

{#if !item}
	<span />
{:else if item.type === HistoryItemType.SEND}
	<PictureProfile pubkey={item?.data?.to} className="w-8 h-8" />
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
	<PictureProfile pubkey={item?.data?.from} className="w-8 h-8" />
{:else if item.type === HistoryItemType.RECEIVE_NUTZAP}
	<PictureProfile pubkey={item?.data?.from} className="w-8 h-8" />
{:else if item.type === HistoryItemType.SEND_NUTZAP}
	<PictureProfile pubkey={item?.data?.to} className="w-8 h-8" />
	<!-- </div> -->
{:else}
	<div class="rounded-full border p-2 flex items-center justify-center">
		<Icon icon="gala:add" />
	</div>
{/if}
