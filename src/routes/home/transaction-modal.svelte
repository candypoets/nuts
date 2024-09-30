<script lang="ts">
	import { getEncodedToken } from '@cashu/cashu-ts';
	import Icon from '@iconify/svelte';
	import { formatAmount } from 'src/actions/wallet';
	import HistoryIcon from 'src/routes/home/transactions/Icon.svelte';
	import HistoryLabel from 'src/routes/home/transactions/Label.svelte';
	import type { MeltData } from 'src/model/data/MeltData';
	import type { MintData } from 'src/model/data/MintData';
	import type { ReceiveData } from 'src/model/data/ReceiveData';
	import type { ReceiveNostrData } from 'src/model/data/ReceiveNostrData';
	import type { SendData } from 'src/model/data/SendData';
	import { HistoryItemType } from 'src/model/historyItem';
	import { selectedTransaction } from 'src/stores';
	import { settings } from 'src/stores/db';

	let token: string;

	if ($selectedTransaction?.type === HistoryItemType.SEND) {
		const sendData: SendData = $selectedTransaction?.data;
		token = getEncodedToken({
			token: [{ proofs: sendData.send ?? [], mint: sendData.mint ?? '' }]
		});
	} else if ($selectedTransaction?.type === HistoryItemType.RECEIVE) {
		const recieveData: ReceiveData = $selectedTransaction?.data;
		token = recieveData.encodedToken ?? '';
	} else if ($selectedTransaction?.type === HistoryItemType.RECEIVE_NOSTR) {
		const recieveData: ReceiveNostrData = $selectedTransaction?.data;
		token = recieveData.encodedToken ?? '';
	} else if ($selectedTransaction?.type === HistoryItemType.MINT) {
		const mintData: MintData = $selectedTransaction?.data;
		token = getEncodedToken({
			token: [{ proofs: mintData.tokens ?? [], mint: mintData.mint ?? '' }]
		});
	} else {
		const meltData: MeltData = $selectedTransaction?.data;
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

{#if !$selectedTransaction}
	<span />
{:else}
	<div class="px-4">
		<div on:click={() => ($selectedTransaction = null)}>
			<Icon icon="mdi:close" class="w-6 h-6" />
		</div>
	</div>
	<div class="p-4">
		<div class="flex gap-2 items-center">
			<h2 class="text-4xl"><HistoryIcon item={$selectedTransaction} /></h2>
			<h2 class="text-2xl my-4"><HistoryLabel item={$selectedTransaction} /></h2>
		</div>
		<br />
		<p class="text-2xl" class:text-primary={($selectedTransaction?.amount || 0) > 0}>
			{formatAmount($selectedTransaction?.amount || 0, $settings?.unit)}
		</p>
		<p class="text-xs mt-2">
			{new Date(($selectedTransaction?.date || 0) * 1000).toLocaleString(undefined, {
				weekday: 'long',
				hour12: true,
				year: 'numeric',
				month: 'long',
				day: '2-digit',
				hour: 'numeric',
				minute: 'numeric'
			})}
		</p>
		<h2 class="font-bold mt-4">Cashu Token</h2>
		<div
			class="join mt-2 rounded-lg border mb-4 p-2 w-full cursor-pointer"
			on:click={() => copyToken()}
		>
			<div id="token" class="join-item border-right overflow-ellipsis text-nowrap overflow-hidden">
				{token}
			</div>
			<div class="join-item">
				<Icon icon="carbon:copy" class="w-6 h-6" />
			</div>
			<!-- {#each items as item}
							{/each} -->
			<!-- svelte-ignore a11y-click-events-have-key-events -->
		</div>
	</div>
{/if}
