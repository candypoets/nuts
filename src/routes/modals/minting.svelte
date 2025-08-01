<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from '@iconify/svelte';

	import Alert from 'src/components/Alert.svelte';
	import MintSelector from 'src/components/MintSelector.svelte';
	import { key, kind17375 } from 'src/controller';
	import { nutsWallet } from 'src/controller/proofs';
	import { activeMintUrl } from 'src/controller/wallet';
	import { now } from 'src/lib/period';
	import { formatAmount } from 'src/lib/wallet';
	import { QRCodeImage } from 'svelte-qrcode-image';

	export let doMint = false;
	let amount: number | undefined = 200;
	let isPaid = false;
	let mintingHash = '';
	let qrCode: string | undefined;
	let isLoading: boolean = false;
	let isPolling: boolean = false;
	let memo = '';

	let scrollContainer: HTMLElement;

	$: {
		amount;
		if (!/^[0-9]*$/.test(amount)) {
			amount = undefined;
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

	function copyToClipboard(event: MouseEvent) {
		event.preventDefault(); // Prevent the default link behavior

		navigator.clipboard.writeText(qrCode ?? '');

		// $alert = 'copied to clipboard!';
	}

	async function handleCreateInvoice() {
		if ($activeMintUrl && $nutsWallet) {
			const cashu = await $nutsWallet.getWallet($activeMintUrl);
			if (cashu) {
				const quote = await cashu.createMintQuote(Number(amount));
				doMint = true;
				qrCode = quote.request;
				console.log('quote', quote);
				$nutsWallet.saveMintQuote(now(), quote, $activeMintUrl);
				$nutsWallet.monitorMintQuote(quote, now(), $activeMintUrl);
				scrollTo('right');
			}
		}
	}

	function scrollTo(side: 'left' | 'right') {
		if (scrollContainer) {
			if (side == 'left') {
				scrollContainer.scrollTo({
					left: 0,
					behavior: 'smooth'
				});
			} else {
				scrollContainer.scrollTo({
					left: scrollContainer.clientWidth,
					behavior: 'smooth'
				});
			}
		}
	}
</script>

<div class="pt-4 bg-base-300 bg-opacity-85 h-full border rounded-xl">
	<Alert />
	<p class="font-bold text-xl text-center">Topup</p>
	{#if isLoading}
		<div class=" h-full flex items-center justify-center gap-5 flex-col">
			<p>Creating lightning invoice...</p>
		</div>
	{:else}
		<!-- Create the scroll container -->
		<div
			bind:this={scrollContainer}
			class="flex w-full overflow-x-auto scroll-smooth snap-x snap-mandatory h-full"
		>
			<!-- Screen 1: Input -->
			<div id="input-screen" class="w-full flex-shrink-0 snap-start h-full overflow-y-auto">
				<div class="pt-8">
					<!-- have an invisible focusable element that focus first -->
					<span tabindex="-1"></span>
					<!-- Using span to avoid a11y issues with empty link -->
					<div class="m-auto lg:w-1/3 max-w-xs">
						<MintSelector
							mints={$kind17375?.parsed?.mints}
							pubkey={$key?.pub}
							activeMint={$activeMintUrl || $kind17375?.parsed?.mints?.[0]}
						/>
					</div>
					<div class="h-52 flex flex-col items-center">
						<input
							autofocus
							id="send-amt"
							placeholder="0"
							type="text"
							inputmode="decimal"
							bind:value={amount}
							class="mt-10 text-7xl focus:outline-none text-center max-w-xs rounded-xl"
							on:keydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									if (Number(amount) > 0 && $activeMintUrl) {
										handleCreateInvoice(); // Use combined handler
									}
								}
							}}
						/>
						<p />
						<p class="font-bold text-xl">Sats</p>
					</div>

					<div class="flex join justify-center">
						<button
							class="btn btn-warning flex gap-1 mt-40"
							disabled={isLoading || !$activeMintUrl || !amount || Number(amount) <= 0}
							class:loading={isLoading}
							on:click={handleCreateInvoice}
						>
							{#if isLoading}
								<span>Creating...</span>
							{:else}
								<p>Create Lightning Invoice</p>
							{/if}
						</button>
					</div>
				</div>
			</div>

			<!-- Screen 2: Invoice/Minting -->
			<div id="invoice-screen" class="w-full flex-shrink-0 snap-start h-full overflow-y-auto">
				<div class="container mx-auto px-4 py-6">
					<!-- Back Button -->
					<button class="btn btn-ghost btn-sm mb-4" on:click={() => scrollTo('left')}>
						<Icon icon="heroicons:arrow-left" class="w-5 h-5" />
						Back
					</button>

					<div class="mb-8">
						<div
							class="flex items-center justify-center gap-2 bg-base-200 py-3 rounded-lg shadow-sm max-w-md mx-auto"
						>
							<p class="text-3xl">
								{formatAmount(amount ?? 0, 'sat', false)}
							</p>
							<p class="text-3xl font-bold">sats</p>
						</div>
					</div>

					<div class="flex flex-col items-center justify-center mb-8">
						<div
							class={`border-4 rounded-xl p-3 shadow-lg ${
								isPaid ? 'border-success' : 'border-warning'
							}`}
						>
							{#if isPaid}
								<div class="flex justify-center items-center p-2">
									<Icon
										icon="streamline:ok-hand"
										style="width: 275px; height: 275px;"
										class="text-success"
									/>
								</div>
							{:else if qrCode}
								<a
									class="cursor-pointer block hover:opacity-90 transition-opacity"
									href="lightning:{qrCode}"
									on:click={(e) => copyToClipboard(e)}
								>
									<QRCodeImage
										text={'lightning:' + qrCode}
										displayHeight={275}
										displayWidth={275}
										margin={1}
									/>
								</a>
							{:else}
								<!-- Placeholder while QR is loading -->
								<div
									class="w-[275px] h-[275px] flex items-center justify-center bg-base-200 rounded-lg"
								>
									<span class="loading loading-spinner text-warning"></span>
								</div>
							{/if}
						</div>

						<div class="text-sm text-center mt-2 text-base-content/70">
							{#if isPaid}
								Payment received!
							{:else if qrCode}
								Tap/click QR code to copy
							{:else}
								Generating QR Code...
							{/if}
						</div>
					</div>

					<div class="space-y-4 max-w-md mx-auto">
						<div class="relative">
							<input
								type="text"
								class="input input-bordered input-warning w-full pr-10"
								id="invoice-input"
								readonly
								value={qrCode ?? 'Generating...'}
								disabled={!qrCode}
							/>
							<button
								class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-sm btn-ghost"
								on:click={copyInvoice}
								disabled={!qrCode}
							>
								<Icon icon="heroicons:clipboard" class="w-5 h-5" />
							</button>
						</div>

						<div class="w-full">
							<input
								type="text"
								class="input input-bordered w-full focus:outline-warning focus:border-warning"
								placeholder="Memo (internal)"
								bind:value={memo}
							/>
						</div>

						<div class="h-8 flex justify-center">
							{#if isPolling}
								<div class="flex items-center gap-2">
									<div class="btn btn-disabled btn-sm loading btn-circle"></div>
									<span class="text-sm text-base-content/70">Checking payment status...</span>
								</div>
							{:else if isPaid}
								<!-- Optional: Show success message after polling -->
								<span class="text-success font-semibold">Payment Confirmed!</span>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
