<script lang="ts">
	import { asKind17375, fbArray } from '@candypoets/nipworker/utils';
	import type { MeltQuoteResponse } from '@cashu/cashu-ts';
	import { decode } from '@gandlaf21/bolt11-decode';
	import Icon from '@iconify/svelte';
	import MintSelector from 'src/components/MintSelector.svelte';
	import { key, kind17375 } from 'src/controller';
	import { nutsWallet } from 'src/controller/proofs';
	import { activeMintUrl, balanceByMint } from 'src/controller/wallet';
	import {
		getInvoiceFromLNURL,
		isValidLNURL,
		getInvoiceFromLightningAddress,
		isLightningAddress
	} from 'src/lib/wallet';

	import { getContext } from 'svelte';
	import { fly } from 'svelte/transition';
	let animator = getContext('animator');

	export let invoice: string;

	let amount: number | undefined = 21;
	let decoded: any;

	let meltquote: MeltQuoteResponse;
	let fees: number = 0;
	let status = '';
	let fromMint = $activeMintUrl || ($kind17375 && asKind17375($kind17375)?.mints(0));

	$: islnurl = isValidLNURL(invoice || '');
	$: isLa = isLightningAddress(invoice || ''); // new

	let ongoing = false;

	$: {
		try {
			decoded = invoice && decode(invoice);
		} catch (e) {
			// decoded = null;
			console.log(e);
		}
	}

	async function getMeltquote(decoded: any) {
		if (decoded) {
			const fromWallet = await $nutsWallet?.getWallet(fromMint);
			meltquote = await fromWallet?.createMeltQuote(decoded.paymentRequest);
			fees = meltquote.fee_reserve;
		}
	}

	$: getMeltquote(decoded);

	$: invoiceAmount = decoded?.sections?.find((s) => s.name == 'amount')?.value / 1000 || 0;
	$: invoiceMemo = decoded?.sections?.find((s) => s.name == 'description')?.value || '';

	// When paying a decoded invoice, use the invoice amount, not the user input amount
	$: actualAmount = decoded ? invoiceAmount : Number(amount || 0);
	$: amountPlusFees = actualAmount + Number(fees || 0);
	$: balance = $balanceByMint?.[fromMint || ''];

	$: {
		if (!/^[0-9]*$/.test(amount)) {
			amount = '';
		}
	}

	async function generateInvoice() {
		if (isLa) {
			const res = await getInvoiceFromLightningAddress(invoice, amount || 0);
			invoice = res.pr;
			if (fromMint && invoice) {
				const fromWallet = await $nutsWallet?.getWallet(fromMint);
				if (fromWallet) {
					meltquote = await fromWallet.createMeltQuote(res.pr);
					fees = meltquote.fee_reserve;
				}
			}
			return;
		}
		// fallback: LNURL (bech32 or raw URL handled by your helper)
		const res = await getInvoiceFromLNURL(invoice, amount || 0);
		invoice = res.pr;
		if (fromMint && invoice) {
			const fromWallet = await $nutsWallet?.getWallet(fromMint);
			if (fromWallet) {
				meltquote = await fromWallet.createMeltQuote(res.pr);
				fees = meltquote.fee_reserve;
			}
		}
	}

	function resetState() {
		amount = 21;
		decoded = null;
		invoice = '';
		status = '';
		fees = 0;
	}

	async function payInvoice() {
		if (!fromMint || !invoice || !$nutsWallet || !meltquote) return;

		ongoing = true;
		status = 'Paying...';

		try {
			// DEBUG: Log all relevant values before proof selection
			const unspentProofs = $nutsWallet.unspentProofs.get(fromMint) || [];
			const reservedProofs = $nutsWallet.reservedProofs.get(fromMint) || [];
			const unspentTotal = unspentProofs.reduce((sum, p) => sum + p.amount, 0);
			const reservedTotal = reservedProofs.reduce((sum, p) => sum + p.amount, 0);
			const proofAmounts = unspentProofs.map((p) => p.amount);

			console.log('[lightning:pay] === Payment Debug Info ===');
			console.log('[lightning:pay] fromMint:', fromMint);
			console.log('[lightning:pay] amount (user input):', amount);
			console.log('[lightning:pay] invoiceAmount (from decoded):', invoiceAmount);
			console.log('[lightning:pay] actualAmount (used for selection):', actualAmount);
			console.log('[lightning:pay] fees (fee_reserve):', fees);
			console.log('[lightning:pay] amountPlusFees:', amountPlusFees);
			console.log('[lightning:pay] balance (UI):', balance);
			console.log('[lightning:pay] meltquote.amount:', meltquote.amount);
			console.log('[lightning:pay] meltquote.fee_reserve:', meltquote.fee_reserve);
			console.log('[lightning:pay] unspentProofs count:', unspentProofs.length);
			console.log('[lightning:pay] unspentProofs total:', unspentTotal);
			console.log('[lightning:pay] reservedProofs count:', reservedProofs.length);
			console.log('[lightning:pay] reservedProofs total:', reservedTotal);
			console.log('[lightning:pay] proof amounts:', proofAmounts);
			console.log('[lightning:pay] amount + fee_reserve <= unspentTotal?', amountPlusFees <= unspentTotal);

			const wallet = await $nutsWallet.getWallet(fromMint);
			
			// DEBUG: Log the arguments to selectProofsToSend
			console.log('[lightning:pay] Calling selectProofsToSend with:', {
				unspentProofsCount: unspentProofs.length,
				amountPlusFees,
				includeFees: true
			});
			
			const { keep, send } = wallet.selectProofsToSend(unspentProofs, amountPlusFees, true);

			// DEBUG: Log the result of proof selection
			console.log('[lightning:pay] selectProofsToSend result:', {
				keepCount: keep?.length,
				keepTotal: keep?.reduce((sum, p) => sum + p.amount, 0),
				sendCount: send?.length,
				sendTotal: send?.reduce((sum, p) => sum + p.amount, 0)
			});

			if (!send?.length) {
				console.error('[lightning:pay] ERROR: send array is empty!');
				console.error('[lightning:pay] This means selectProofsToSend could not find enough proofs');
				throw new Error('Not enough proofs available to cover amount + fees');
			}

			// Use the wallet helper that handles melt + verification automatically
			console.log('[lightning:pay] Calling meltProofsWithVerification...');
			const { quote, change } = await $nutsWallet.meltProofsWithVerification(
				fromMint,
				meltquote,
				send
			);

			console.log('[lightning:pay] meltProofsWithVerification result:', {
				quoteState: quote.state,
				changeCount: change?.length,
				changeTotal: change?.reduce((sum, p) => sum + p.amount, 0)
			});

			if (quote.state !== 'PAID') throw new Error('Payment failed');

			// Update wallet with keep + change as unspent
			$nutsWallet.unspentProofs.set(fromMint, keep.concat(change || []));
			$nutsWallet.saveProofs(fromMint, keep.concat(change || []));
			$nutsWallet.updateBalanceByMint();

			status = 'Success!';
			setTimeout(() => resetState(), 1000);
		} catch (err) {
			console.error('[lightning:pay] === PAYMENT FAILED ===');
			console.error('[lightning:pay] Error:', err);
			console.error('[lightning:pay] Error message:', (err as Error).message);
			console.error('[lightning:pay] Error stack:', (err as Error).stack);
			status = 'Error: ' + (err as Error).message;
			setTimeout(() => (status = ''), 3000);
		} finally {
			ongoing = false;
			console.log('[lightning:pay] === Payment attempt complete ===');
		}
	}
</script>

<div class="h-full bg-base-300 bg-opacity-95">
	<div class="p-4 flex justify-between pt-safe md:pt-8">
		<div on:click={animator.goBack} aria-label="Close" role="button" tabindex="-1" autofocus>
			<Icon icon="mdi:close" class="w-6 h-6" />
		</div>
		<strong> Lightning Payment </strong>
		<div />
	</div>
	<br />

	<MintSelector
		mints={($kind17375 && fbArray(asKind17375($kind17375), 'mints'))?.map((mint) =>
			mint
		) || []}
		pubkey={$key?.pub}
		bind:activeMint={fromMint}
	/>

	<div class="w-full px-4 mt-10 flex justify-center">
		<input
			class="input input-bordered join-item px-2 bg-transparent md:w-1/2 w-full mx-4 m-auto"
			type="text"
			placeholder="Lightning invoice or address"
			bind:value={invoice}
		/>
	</div>

	{#if decoded || islnurl || isLa}
		<div class="w-full px-4 mt-4 flex justify-center">
			{#if decoded}
				<div class="rounded-xl p-4">
					<p class="font-bold text-3xl">{invoiceAmount} {fees ? '+ ' + fees : ''} sats</p>

					<p class="font-bold">{invoiceMemo || ''}</p>
				</div>
			{:else}
				<div>
					<div class="join items-center mt-10">
						<div class="join-item w-0">
							<Icon icon="bitcoin-icons:satoshi-v2-filled" class="text-4xl" />
						</div>
						<input
							id="send-amt"
							placeholder="0"
							type="text"
							inputmode="decimal"
							autocomplete="off"
							bind:value={amount}
							class="join-item text-7xl bg-transparent caret-transparent focus:outline-none text-center max-w-xs rounded-xl"
							on:keydown|stopPropagation={(e) => {
								if (e.key === 'Enter') {
									generateInvoice();
								}
							}}
						/>
					</div>
					<button
						disabled={(amount || 0) < 10}
						class="btn btn-accent w-2/3 block m-auto mt-12"
						on:click={() => generateInvoice()}
					>
						{(amount || 0) < 10 ? 'At least 10 Sats' : 'Generate Invoice'}
					</button>
				</div>
			{/if}
		</div>
		{#if fees}
			<div class="px-4 w-full mt-4" transition:fly>
				<div class="text-sm text-primary text-center">
					A fee of <strong>{fees} sats</strong> may apply for this transaction. This covers Lightning
					network costs and is only reserved - you might get some or all of it refunded.
				</div>
			</div>
		{/if}
		{#if decoded}
			<button
				class="btn btn-accent btn-wide m-auto block mt-10"
				disabled={ongoing || (actualAmount || 0) < 10 || !fromMint || amountPlusFees > balance}
				on:click={() => payInvoice()}
				>{#if ongoing}<Icon
						icon="ei:spinner"
						class="animate-spin w-8 h-8 m-auto text-white"
					/>{:else if status}
					{status}
				{:else}
					{(actualAmount || 0) < 10 ? 'At Least 10 Sats' : 'Pay'}
				{/if}</button
			>
		{/if}
	{/if}
</div>
