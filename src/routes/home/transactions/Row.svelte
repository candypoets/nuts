<script lang="ts">
	import { getEncodedToken } from '@cashu/cashu-ts';
	import type { MeltData } from 'src/model/data/MeltData';
	import type { MintData } from 'src/model/data/MintData';
	import type { ReceiveData } from 'src/model/data/ReceiveData';
	import type { ReceiveNostrData } from 'src/model/data/ReceiveNostrData';
	import type { SendData } from 'src/model/data/SendData';
	import { HistoryItemType, type HistoryItem } from 'src/model/historyItem';

	import HistoryIcon from './Icon.svelte';
	import { formatAmount } from 'src/actions/wallet';
	import HistoryLabel from './Label.svelte';
	import { settings, type Setting } from 'src/stores/db';
	import { selectedTransaction } from 'src/stores';

	export let item: HistoryItem<any>;
	// $: console.log(item);

	let open = false;
	let token: string;

	if (item.type === HistoryItemType.SEND) {
		const sendData: SendData = item.data;
		token = getEncodedToken({
			token: [{ proofs: sendData.send ?? [], mint: sendData.mint ?? '' }]
		});
	} else if (item.type === HistoryItemType.RECEIVE) {
		const recieveData: ReceiveData = item.data;
		token = recieveData.encodedToken ?? '';
	} else if (item.type === HistoryItemType.RECEIVE_NOSTR) {
		const recieveData: ReceiveNostrData = item.data;
		token = recieveData.encodedToken ?? '';
	} else if (item.type === HistoryItemType.MINT) {
		const mintData: MintData = item.data;
		token = getEncodedToken({
			token: [{ proofs: mintData.tokens ?? [], mint: mintData.mint ?? '' }]
		});
	} else {
		const meltData: MeltData = item.data;
		token = getEncodedToken({
			token: [{ proofs: meltData.change ?? [], mint: meltData.mint ?? '' }]
		});
	}

	function copyToken() {
		const el = document.createElement('textarea');
		el.value = token;
		document.body.appendChild(el);
		el.select();
		document.execCommand('copy');
		document.body.removeChild(el);
		// alert('Token copied to clipboard!');
	}
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
