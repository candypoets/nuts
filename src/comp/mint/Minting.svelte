<script lang="ts">
	import { browser } from '$app/environment';
	import { CashuMint, type AmountPreference } from '@cashu/cashu-ts';
	import { decode } from '@gandlaf21/bolt11-decode';
	import { db } from 'src/stores/db';
	import { onMount } from 'svelte';
	import { QRCodeImage } from 'svelte-qrcode-image';
	import { mintRequests } from '../../stores/mintReqs';
	import { mint } from '../../stores/mints';
	import { unit } from '../../stores/settings';
	import { toast } from '../../stores/toasts';
	import MintSelector from '../elements/MintSelector.svelte';
	import LoadingCenter from '../LoadingCenter.svelte';
	import { formatAmount } from '../util/walletUtils';
	import { liveQuery } from 'dexie';
	import Icon from '@iconify/svelte';

	export let active;
	export let isMinting: boolean;
	export let doMint = false;
	let amount: number | undefined = 200;
	let mintingHash = '';
	let qrCode: string | undefined;
	let isLoading: boolean = false;
	let isPolling: boolean = false;
	let memo = '';

	$: {
		amount;
		if (!/^[0-9]*$/.test(amount)) {
			amount = undefined;
		}
		if (amount) {
			isMinting = true;
		} else {
			isMinting = false;
		}
	}

	// todo clean up the states

	const copyInvoice = () => {
		if (browser) {
			let input = document.getElementById('invoice-input');
			// @ts-expect-error
			input.select();
			document.execCommand('copy');
			toast('info', 'Invoice copied to clipboard.', 'Copied!');
		}
	};

	onMount(() => {
		if (browser) {
			if (
				/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
			) {
				return;
			}
			document.getElementById('mint-req-amt')?.focus();
		}
	});

	const mintRequest = async () => {
		try {
			if (!$mint?.mintURL) {
				toast('warning', 'No mint selected', 'Could not create invoice');
				return;
			}
			if (!amount) {
				toast('warning', 'No amount provided', 'Could not create invoice');
				return;
			}
			if (isNaN(amount) || amount <= 0) {
				toast('warning', 'amount must be a number greater than 0', 'Could not create invoice');
				return;
			}
			// isComplete = false;
			isLoading = true;
			const cashuMint = new CashuMint($mint?.mintURL);
			const mintQuote = await cashuMint.mintQuote({ amount: amount ?? 0, unit: 'sat' });
			mintingHash = mintQuote.quote;
			qrCode = mintQuote.request;

			$db.invoices.add({
				...mintQuote,
				date: Math.round(Date.now() / 1000),
				mint: $mint?.mintURL
			});
			doMint = true;
			// mintTokens();
		} catch (error) {
			console.error(error);
		} finally {
			isLoading = false;
		}
	};

	const resetState = () => {
		amount = undefined;
		qrCode = undefined;

		memo = '';
	};
	$: exist = liveQuery(() => $db.invoices.get(mintingHash));

	$: isPaid = mintingHash && !$exist;
	$: console.log(isPaid, $exist);
</script>

<div class="flex justify-center">
	<p class="font-bold text-xl absolute top-2">Receive</p>
	{#if isLoading}
		<div class=" h-full flex items-center justify-center gap-5 flex-col">
			<p>Creating lightning invoice...</p>
			<LoadingCenter />
		</div>
	{:else if doMint}
		<div class="">
			<div class="">
				<div class="flex items-center justify-center gap-1 m-auto">
					<p class="text-2xl">
						{formatAmount(amount ?? 0, $unit, false)}
					</p>
					<p class="text-2xl font-bold">sats</p>
				</div>
				<!-- <div class="flex items-center justify-center gap-1">
					<p class="font-bold">at</p>
					<div class="flex gap-1">
						<p class="font-bold">Custodian</p>
						<p class="break-all">
							{$mint?.mintURL}
						</p>
					</div>
				</div> -->
			</div>
			<div class="w-full flex items-center justify-center mt-24">
				<div class="flex items-center justify-center flex-col">
					<div class="border-warning border rounded-md p-2" class:!border-success={isPaid}>
						{#if isPaid}
							<Icon
								icon="streamline:ok-hand"
								style="width: 275px; height: 275px;"
								class="text-success"
							/>
						{:else}
							<a class="cursor-pointer" href="lightning:{qrCode}">
								<QRCodeImage text={qrCode} displayHeight={275} displayWidth={275} margin={1} />
							</a>
						{/if}
					</div>
				</div>
			</div>
			<div class="flex pt-4 w-full px-2 mt-12">
				<input
					type="text"
					class="input input-warning w-full"
					id="invoice-input"
					readonly
					value={qrCode}
				/>
			</div>
			<div class=" pt-3 px-2">
				<input
					type="text"
					class="bg-base-200 rounded-lg p-1 px-3 focus:outline-none w-80"
					placeholder="memo (internal)"
					bind:value={memo}
				/>
			</div>
			<div class="h-8">
				{#if isPolling}
					<div class="btn btn-disabled btn-xs loading btn-square" />
				{/if}
			</div>
			<!-- <div class="flex gap-2">
				<button class="btn btn-outline" on:click={resetState}>Cancel</button>
				<button
					class="btn btn-outline btn-error"
					on:click={() => {
						// abortMint();
						resetState();
					}}>delete invoice</button
				>
			</div> -->
		</div>
	{:else}
		<div class="pt-8">
			<!-- have an invisible focusable element that focus first -->
			<a autofocus tabindex={-1} />
			<MintSelector />
			<div class="">
				<div class="flex items-end gap-4 m-auto w-1/2 h-44">
					<input
						id="mint-req-amt"
						placeholder="0"
						type="text"
						inputmode="decimal"
						bind:value={amount}
						on:keydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								mintRequest();
							}
						}}
						class="text-3xl max-w-xs outline-none font-bold w-full text-center"
					/>
				</div>
				<p class="font-bold text-xl text-center text-base-300">SATs</p>

				<!-- <p class="">Create a Lightning invoice to top up this wallet.</p> -->
			</div>

			<div class="flex join justify-center">
				<button
					class="btn btn-warning flex gap-1 mt-60"
					on:click={() => {
						mintRequest();
					}}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-6 h-6"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
						/>
					</svg>
					<p>Create Lightning Invoice</p>
				</button>
				<!-- else content here -->
			</div>
		</div>
	{/if}
</div>
