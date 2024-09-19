<script lang="ts">
	import { browser } from '$app/environment';
	import { CashuMint } from '@cashu/cashu-ts';
	import Icon from '@iconify/svelte';
	import { liveQuery } from 'dexie';
	import { db } from 'src/stores/db';
	import { onMount } from 'svelte';
	import { QRCodeImage } from 'svelte-qrcode-image';
	import { mint } from 'src/stores/mints';
	import MintSelector from 'src/comp/MintSelector.svelte';
	import { formatAmount } from 'src/actions/wallet';
	import { alert } from 'src/stores';
	import Alert from 'src/comp/Alert.svelte';

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
			// toast('info', 'Invoice copied to clipboard.', 'Copied!');
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
				// toast('warning', 'No mint selected', 'Could not create invoice');
				return;
			}
			if (!amount) {
				// toast('warning', 'No amount provided', 'Could not create invoice');
				return;
			}
			if (isNaN(amount) || amount <= 0) {
				// toast('warning', 'amount must be a number greater than 0', 'Could not create invoice');
				return;
			}
			// isComplete = false;
			isLoading = true;
			const cashuMint = new CashuMint($mint?.mintURL);
			const mintQuote = await cashuMint.mintQuote({ amount: amount ?? 0, unit: 'sat' });
			mintingHash = mintQuote.quote;
			qrCode = mintQuote.request;
			console.log('add invoice');
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

	function copyToClipboard(event: MouseEvent) {
		event.preventDefault(); // Prevent the default link behavior

		navigator.clipboard.writeText(qrCode ?? '');
		console.log('hello');
		$alert = 'copied to clipboard!';
	}
</script>

<div class="flex justify-center">
	<Alert />
	<p class="font-bold text-xl absolute top-2">Receive</p>
	{#if isLoading}
		<div class=" h-full flex items-center justify-center gap-5 flex-col">
			<p>Creating lightning invoice...</p>
		</div>
	{:else if doMint}
		<div class="">
			<div class="">
				<div class="flex items-center justify-center gap-1 m-auto">
					<p class="text-2xl">
						{formatAmount(amount ?? 0, 'sat', false)}
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
							<a
								class="cursor-pointer"
								href="lightning:{qrCode}"
								on:click={(e) => copyToClipboard(e)}
							>
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
					class="btn btn-warning flex gap-1 mt-40"
					on:click={() => {
						mintRequest();
					}}
				>
					<p>Create Lightning Invoice</p>
				</button>
				<!-- else content here -->
			</div>
		</div>
	{/if}
</div>
