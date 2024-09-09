<script lang="ts">
	import { browser } from '$app/environment';

	import { settings } from 'src/stores/db';
	import { onMount } from 'svelte';

	import TokenIcon from 'src/comp/TokenIcon.svelte';
	import {
		bestProofCombination,
		formatAmount,
		getAmountForTokenSet,
		getInvoiceFromLNURL,
		getMeltQuote,
		isValidLNURL,
		melt,
		mint as mintToken,
		type Melt
	} from 'src/actions/wallet';
	import { amountAvailable, mint, mints } from 'src/stores/mints';
	import Icon from '@iconify/svelte';
	import { balance, wallets } from 'src/stores/wallet';
	import { decode } from '@gandlaf21/bolt11-decode';
	import { signer } from 'src/stores/signer';

	export let subopen: boolean = false;
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

	$: mintbalance = amountAvailable($mint);

	$: w = $wallets.filter((w) => w.amount > 10);

	onMount(() => {
		const keyDown = (e: KeyboardEvent) => {
			if (e.key === 'E') {
				isSend = true;
			} else if (e.key === 'L') {
				isSend = false;
			}
		};
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

	onMount(() => {
		if (browser) {
			if (
				/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
			) {
				return;
			}
			document.getElementById('send-amt')?.focus();
		}
	});

	async function send(melts: Melt[]) {
		ongoingPayment = true;
		let i = 0;
		for (const m of melts) {
			await melt($signer, m.wallet, m.meltQuote, m.amount);
			if (m.mintQuote) {
				const nextMelt = melts[i + 1];
				await mintToken($signer, nextMelt.wallet.wallet, m.mintQuote);
			}
			i++;
		}
		invoice = '';
		ongoingPayment = false;
	}

	async function generateInvoice() {
		const res = await getInvoiceFromLNURL(invoice, amount || 0);
		invoice = res.pr;
	}

	$: console.log(decoded, invoice, islnurl);
</script>

<div class="px-4 flex justify-between">
	<div on:click={() => (subopen = false)} aria-label="Close" role="button" tabindex="-1" autofocus>
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
		{formatAmount($balance, $settings.unit)}
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
	{#await getMeltQuote(w, invoice)}
		<button class="btn btn-primary btn-disabled btn-wide m-auto block mt-10"
			><div class="loading" /></button
		>
	{:then melts}
		<ul class="mx-8 mt-8 list-disc">
			{#each melts as m, index}
				<li class="font-bold text-sm">
					{m.meltQuote.amount - (melts[index - 1]?.meltQuote?.amount || 0)} + {m.meltQuote
						.fee_reserve} sats from
					{m.wallet.mintURL}
				</li>

				<!-- <p class="font-bold">{m.memo || 'no description'}</p> -->
			{/each}
		</ul>

		<button
			class="btn btn-primary btn-wide m-auto block mt-10"
			disabled={!melts.length || ongoingPayment || (invoiceAmount || 0) < 10}
			on:click={() => send(melts)}
			>{#if ongoingPayment}<div class="loading" />{:else}
				{(invoiceAmount || 0) < 10 ? 'At Least 10 Sats' : 'Pay'}
			{/if}</button
		>
		<p class="text-xs w-2/3 m-auto text-center mt-4">
			Fees are reserved based on a conservative estimate of Lightning fees. Unused amounts will be
			returned to your wallet.
		</p>
	{/await}
{/if}
