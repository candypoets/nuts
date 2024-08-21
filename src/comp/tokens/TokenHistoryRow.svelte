<script lang="ts">
	import { getEncodedToken } from '@cashu/cashu-ts';
	import type { MeltData } from '../../model/data/MeltData';
	import type { MintData } from '../../model/data/MintData';
	import type { ReceiveData } from '../../model/data/ReceiveData';
	import type { ReceiveNostrData } from '../../model/data/ReceiveNostrData';
	import type { SendData } from '../../model/data/SendData';
	import { HistoryItemType, type HistoryItem } from '../../model/historyItem';
	import { unit } from '../../stores/settings';
	import HistoryIcon from '../history/HistoryIcon.svelte';
	import { formatAmount } from '../util/walletUtils';
	import { Drawer } from 'vaul-svelte';
	import Icon from '@iconify/svelte';
	import HistoryLabel from '../history/HistoryLabel.svelte';

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

<tr on:click={() => (open = true)} class="cursor-pointer last:border-none h-14">
	<td class="w-8"><HistoryIcon type={item.type} /> </td>
	<td><HistoryLabel {item} /></td>
	<td class="text-right">
		{#if item.amount > 0}
			<span class="bg-primary-content p-1 rounded-md">{formatAmount(item.amount, $unit)}</span>
		{:else}
			{formatAmount(item.amount, $unit)}
		{/if}
	</td>
</tr>

<Drawer.Root bind:open>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="rounded-t-3xl pb-8 pt-3 bg-white absolute top-4 left-0 right-0 z-10"
			style="height: 95vh;"
		>
			<div class="px-4">
				<div on:click={() => (open = false)}>
					<Icon icon="mdi:close" class="w-6 h-6" />
				</div>
			</div>
			<div class="p-4">
				<div class="flex gap-2 items-center">
					<h2 class="text-4xl"><HistoryIcon type={item.type} /></h2>
					<h2 class="text-2xl my-4"><HistoryLabel {item} /></h2>
				</div>
				<p class="text-2xl" class:text-primary={item.amount > 0}>
					{formatAmount(item.amount, $unit)}
				</p>
				<p class="text-xs mt-2">
					{new Date(item.date * 1000).toLocaleString(undefined, {
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
					<div
						id="token"
						class="join-item border-right overflow-ellipsis text-nowrap overflow-hidden"
					>
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
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
