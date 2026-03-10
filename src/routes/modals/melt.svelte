<script lang="ts">
	import { asKind17375, fbArray } from '@candypoets/nipworker/utils';
	import type { MeltQuoteResponse, Proof } from '@cashu/cashu-ts';
	import { decode } from '@gandlaf21/bolt11-decode';
	import Icon from '@iconify/svelte';
	import MintSelector from 'src/components/MintSelector.svelte';
	import TransactionStatus from 'src/components/TransactionStatus.svelte';
	import { key, kind17375 } from 'src/controller';
	import { nutsWallet } from 'src/controller/proofs';
	import { activeMintUrl, balanceByMint } from 'src/controller/wallet';
	import {
		getInvoiceFromLNURL,
		isValidLNURL,
		getInvoiceFromLightningAddress,
		isLightningAddress
	} from 'src/lib/wallet';
	import {
		startTransaction,
		failTransaction,
		updateTransaction,
		type TxType
	} from 'src/model/cashu/tx-recovery';

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

	let processing = '';
	let txId: string | null = null;

	// Derive transaction state for the animated display
	$: txState = (() => {
		if (status?.startsWith('Error:')) {
			return { state: 'failed' as const, message: status.replace('Error: ', '') };
		}
		if (status === 'No proofs available') {
			return { state: 'failed' as const, message: status };
		}
		if (processing === 'paying' || processing) {
			return { state: 'processing' as const, message: status || processing, progress: 0.5 };
		}
		if (status && status.includes('Success')) {
			return { state: 'success' as const, message: status };
		}
		return { state: 'idle' as const, message: '' };
	})();

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
		if (!fromMint || !invoice || !$nutsWallet) return;

		processing = 'paying';
		status = 'Preparing payment...';

		console.log('[melt:payInvoice] ========== PAYMENT START ==========');
		console.log('[melt:payInvoice] fromMint:', fromMint);
		console.log('[melt:payInvoice] invoice:', invoice?.slice(0, 50) + '...');
		console.log('[melt:payInvoice] amount (user input):', amount);
		console.log('[melt:payInvoice] invoiceAmount (from decoded):', invoiceAmount);
		console.log('[melt:payInvoice] actualAmount (used for selection):', actualAmount);
		console.log('[melt:payInvoice] fees (meltquote.fee_reserve):', fees);
		console.log('[melt:payInvoice] amountPlusFees:', amountPlusFees);
		console.log('[melt:payInvoice] balance (UI):', balance);
		console.log('[melt:payInvoice] meltquote:', meltquote ? {
			quote: meltquote.quote?.slice(0, 20) + '...',
			amount: meltquote.amount,
			fee_reserve: meltquote.fee_reserve,
			state: meltquote.state
		} : 'null');

		// Determine transaction type
		const txType: TxType = 'melt';

		// Get wallet and select proofs
		const wallet = await $nutsWallet.getWallet(fromMint);
		const unspentProofs = $nutsWallet.unspentProofs.get(fromMint) || [];
		const reservedProofs = $nutsWallet.reservedProofs.get(fromMint) || [];
		
		const unspentTotal = unspentProofs.reduce((sum, p) => sum + p.amount, 0);
		const reservedTotal = reservedProofs.reduce((sum, p) => sum + p.amount, 0);
		const proofAmounts = unspentProofs.map((p) => p.amount);

		console.log('[melt:payInvoice] --- Wallet State ---');
		console.log('[melt:payInvoice] unspentProofs count:', unspentProofs.length);
		console.log('[melt:payInvoice] unspentProofs total:', unspentTotal);
		console.log('[melt:payInvoice] reservedProofs count:', reservedProofs.length);
		console.log('[melt:payInvoice] reservedProofs total:', reservedTotal);
		console.log('[melt:payInvoice] proof amounts:', proofAmounts);
		console.log('[melt:payInvoice] amountPlusFees <= unspentTotal?', amountPlusFees <= unspentTotal);

		console.log('[melt:payInvoice] Calling selectProofsToSend with:', {
			unspentProofsCount: unspentProofs.length,
			amountPlusFees,
			includeFees: true
		});

		const { keep, send: proofs } = wallet.selectProofsToSend(unspentProofs, amountPlusFees, true);

		const keepTotal = keep?.reduce((sum, p) => sum + p.amount, 0) || 0;
		const sendTotal = proofs?.reduce((sum, p) => sum + p.amount, 0) || 0;

		console.log('[melt:payInvoice] --- selectProofsToSend Result ---');
		console.log('[melt:payInvoice] keep count:', keep?.length, 'total:', keepTotal);
		console.log('[melt:payInvoice] send count:', proofs?.length, 'total:', sendTotal);
		console.log('[melt:payInvoice] send proof amounts:', proofs?.map((p) => p.amount));

		if (!proofs?.length) {
			console.error('[melt:payInvoice] ERROR: No proofs selected!');
			status = 'No proofs available';
			processing = '';
			setTimeout(() => (status = ''), 3000);
			return;
		}

		// Temporarily update wallet with reserved proofs (keep only)
		$nutsWallet.unspentProofs.set(fromMint, keep);
		$nutsWallet.updateBalanceByMint();

		txId = await startTransaction(
			txType,
			{
				fromMint,
				amount: actualAmount,
				memo: invoiceMemo || ''
			},
			proofs
		);

		try {
			await executePayment(txId, proofs, keep);
			// Don't close modal on success - let user see the result
		} catch (err) {
			console.error('[melt] Payment failed:', err);

			const errorMsg = (err as Error).message || '';

			// Try to recover from "already spent" error
			if (errorMsg.toLowerCase().includes('spent') && $nutsWallet) {
				console.log('[melt] Attempting to recover from spent token error...');
				status = 'Checking for spent tokens...';

				try {
					const validProofs = await $nutsWallet.checkAndFilterProofs(fromMint, proofs);
					if (validProofs.length === 0) {
						status = 'All tokens already spent';
					} else if (validProofs.length < proofs.length) {
						console.log(`[melt] Recovered ${validProofs.length}/${proofs.length} unspent proofs`);
						status = `Recovered ${validProofs.length} unspent proofs, please try again`;
						// Return only valid proofs to wallet
						$nutsWallet.addProofs(fromMint, validProofs);
					} else {
						// Proofs were valid but error was something else, retry
						$nutsWallet.addProofs(fromMint, proofs);
						status = 'Error, please try again';
					}
				} catch (recoverErr) {
					console.error('[melt] Recovery failed:', recoverErr);
					// Return proofs as-is
					$nutsWallet.addProofs(fromMint, proofs);
					status = 'Error: ' + errorMsg;
				}
			} else {
				// Not a spent token error
				await failTransaction(txId, errorMsg);
				$nutsWallet.addProofs(fromMint, proofs);
				status = 'Error: ' + errorMsg;
			}

			processing = '';
			setTimeout(() => (status = ''), 4000);
		}
	}

	// Execute the payment
	const executePayment = async (txId: string, proofs: Proof[], keep: Proof[]) => {
		if (!fromMint || !meltquote) throw new Error('Missing required parameters');

		const proofsTotal = proofs.reduce((sum, p) => sum + p.amount, 0);
		const requiredAmount = meltquote.amount + meltquote.fee_reserve;

		console.log('[melt:executePayment] ========== EXECUTE PAYMENT ==========');
		console.log('[melt:executePayment] fromMint:', fromMint);
		console.log('[melt:executePayment] meltquote.amount:', meltquote.amount);
		console.log('[melt:executePayment] meltquote.fee_reserve:', meltquote.fee_reserve);
		console.log('[melt:executePayment] required (amount + fee_reserve):', requiredAmount);
		console.log('[melt:executePayment] proofs count:', proofs.length);
		console.log('[melt:executePayment] proofs total:', proofsTotal);
		console.log('[melt:executePayment] proofs amounts:', proofs.map((p) => p.amount));
		console.log('[melt:executePayment] proofsTotal >= requiredAmount?', proofsTotal >= requiredAmount);
		console.log('[melt:executePayment] meltquote:', {
			quote: meltquote.quote,
			amount: meltquote.amount,
			fee_reserve: meltquote.fee_reserve,
			state: meltquote.state,
			expiry: meltquote.expiry
		});

		status = 'Paying invoice...';
		await updateTransaction(txId, { meltQuote: { ...meltquote, mintUrl: fromMint } });

		console.log('[melt:executePayment] Calling meltProofsWithVerification...');

		// Use the wallet helper that handles melt + verification automatically
		const { quote, change } = await $nutsWallet!.meltProofsWithVerification(
			fromMint,
			meltquote,
			proofs
		);

		console.log('[melt:executePayment] meltProofsWithVerification result:', {
			quoteState: quote.state,
			changeCount: change?.length,
			changeTotal: change?.reduce((sum, p) => sum + p.amount, 0) || 0
		});

		if (quote.state !== 'PAID') throw new Error('Payment failed');

		// Update wallet with keep + change as unspent
		$nutsWallet!.unspentProofs.set(fromMint, keep.concat(change || []));
		$nutsWallet!.saveProofs(fromMint, keep.concat(change || []));
		$nutsWallet!.updateBalanceByMint();

		// Mark transaction as completed
		await updateTransaction(txId, { status: 'completed' });

		status = 'Success! 🎉';
		processing = '';

		// Close modal after success
		setTimeout(() => {
			animator.goBack();
		}, 1000);

		// Clear status after 1.5 seconds to show idle state
		setTimeout(() => {
			status = '';
			resetState();
		}, 1500);

		console.log('[melt] Payment successful:', quote.payment_preimage);
	};
</script>

<svelte:window
	on:keydown={(e) => {
		// Command (Meta) + Enter or Ctrl + Enter
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			// Mirror disabled conditions
			if (!!processing) return;
			if (!decoded || (actualAmount || 0) < 10 || !fromMint || amountPlusFees > balance) return;

			e.preventDefault();
			e.stopPropagation();
			payInvoice();
		}
	}}
/>

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

	<!-- <div class="w-full px-4 mt-10 flex justify-center">
		<input
			class="input input-bordered join-item px-2 bg-transparent md:w-1/2 w-full mx-4 m-auto"
			type="text"
			placeholder="Lightning invoice or address"
			bind:value={invoice}
		/>
	</div> -->

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
			{#if processing || status}
				<div class="mt-10">
					<TransactionStatus
						state={txState.state}
						message={txState.message}
						progress={txState.progress}
					/>
				</div>
			{:else}
				<button
					class="btn btn-accent btn-wide m-auto block mt-10"
					disabled={(actualAmount || 0) < 10 || !fromMint || amountPlusFees > balance}
					on:click={() => payInvoice()}
				>
					{(actualAmount || 0) < 10 ? 'At Least 10 Sats' : 'Pay'}
				</button>
			{/if}
		{/if}
	{/if}
</div>
