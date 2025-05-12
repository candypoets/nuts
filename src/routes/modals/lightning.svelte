<script lang="ts">
	import { onMount } from 'svelte';

	import { decode } from '@gandlaf21/bolt11-decode';
	import Icon from '@iconify/svelte';
	import TokenIcon from 'src/comp/TokenIcon.svelte';
	import { goBack } from './modal';
	import { formatAmount, getInvoiceFromLNURL, isValidLNURL } from 'src/lib/wallet';
	import { balance } from 'src/controller/wallet';

	export let invoice: string;

	let amount: number | undefined = undefined;

	let decoded: any;

	$: islnurl = isValidLNURL(invoice || '');

	let ongoingPayment = false;

	$: {
		try {
			decoded = invoice && decode(invoice);
		} catch (e) {
			decoded = null;
			console.log(e);
		}
	}

	$: invoiceAmount = decoded?.sections?.find((s) => s.name == 'amount')?.value / 1000 || 0;

	$: invoiceMemo = decoded?.sections?.find((s) => s.name == 'description')?.value || '';

	onMount(() => {
		window.addEventListener('keydown', keyDown);

		return () => {
			// this function is called when the component is destroyed
			window.removeEventListener('keydown', keyDown);
		};
	});

	$: {
		if (!/^[0-9]*$/.test(amount)) {
			amount = '';
		}
	}

	// onMount(() => {
	// 	if (browser) {
	// 		if (
	// 			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
	// 		) {
	// 			return;
	// 		}
	// 		document.getElementById('send-amt')?.focus();
	// 	}
	// });

	async function generateInvoice() {
		const res = await getInvoiceFromLNURL(invoice, amount || 0);

		invoice = res.pr;
	}
</script>

<div class="h-full bg-basic">
	<div class="p-4 flex justify-between">
		<div on:click={goBack} aria-label="Close" role="button" tabindex="-1" autofocus>
			<Icon icon="mdi:close" class="w-6 h-6" />
		</div>
		<strong> Lightning Payment </strong>
		<div />
	</div>
	<br />
	<!-- <MintSelector /> -->
	<div class="flex gap-1 items-center justify-center mt-4">
		<TokenIcon />

		<p class="font-bold">
			{formatAmount($balance, 'sats')}
		</p>
		<p>available</p>
	</div>

	<div class="w-full px-4 mt-10">
		<input
			class="input input-bordered w-full join-item px-2"
			type="text"
			placeholder="Lightning invoice or address"
			bind:value={invoice}
		/>
	</div>

	{#if decoded || islnurl}
		<div class="w-full px-4 mt-4 flex justify-center">
			{#if decoded}
				<div class="rounded-xl p-4">
					<p class="font-bold text-3xl">{invoiceAmount} sats</p>

					<p class="font-bold">{invoiceMemo || 'no description'}</p>
				</div>
			{:else}
				<div>
					<input
						type="text"
						inputmode="decimal"
						class="input input-bordered join-item p-2 m-auto mt-12 text-center text-xl"
						placeholder="Amount"
						bind:value={amount}
						id="send-amt"
					/>
					<button
						disabled={(amount || 0) < 10}
						class="btn btn-primary w-2/3 block m-auto mt-12"
						on:click={() => generateInvoice()}
					>
						{(amount || 0) < 10 ? 'At least 10 Sats' : 'Generate Invoice'}
					</button>
				</div>
			{/if}
		</div>

		<button
			class="btn btn-primary btn-wide m-auto block mt-10"
			disabled={ongoingPayment || (invoiceAmount || 0) < 10}
			>{#if ongoingPayment}<div class="loading" />{:else}
				{(invoiceAmount || 0) < 10 ? 'At Least 10 Sats' : 'Pay'}
			{/if}</button
		>
		<p class="text-xs w-2/3 m-auto text-center mt-4">
			Fees are reserved based on a conservative estimate of Lightning fees. Unused amounts will be
			returned to your wallet.
		</p>
	{/if}
</div>
