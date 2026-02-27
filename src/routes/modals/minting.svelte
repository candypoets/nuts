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

	function copyToClipboard() {
		if (qrCode) {
			navigator.clipboard.writeText(qrCode);
		}
	}

	async function handleCreateInvoice() {
		if ($activeMintUrl && $nutsWallet) {
			const cashu = await $nutsWallet.getWallet($activeMintUrl);
			if (cashu) {
				isLoading = true;
				const quote = await cashu.createMintQuote(Number(amount));
				doMint = true;
				qrCode = quote.request;
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

<div class="pt-safe bg-base-300 bg-opacity-85 h-full rounded-xl">
	<Alert />
	<p class="font-bold text-xl text-center pt-4">Topup</p>
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
				<div class="flex flex-col items-center">
					<div class="join items-center mt-10">
						<div class="join-item w-0">
							<Icon icon="bitcoin-icons:satoshi-v2-filled" class="text-4xl" />
						</div>
						<input
							autofocus
							id="send-amt"
							placeholder="0"
							type="text"
							inputmode="decimal"
							bind:value={amount}
							class="join-item text-7xl bg-transparent caret-primary focus:outline-none text-center max-w-xs rounded-xl placeholder-base-content/30"
							on:keydown|stopPropagation={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									if (Number(amount) > 0 && $activeMintUrl) {
										handleCreateInvoice(); // Use combined handler
									}
								}
							}}
						/>
					</div>
				</div>

				<div class="flex join justify-center lg:px-12 px-4">
					<button
						class="btn btn-outline join-item border flex-grow mt-10"
						disabled={isLoading || !$activeMintUrl || !amount || Number(amount) <= 0}
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
					{#if isPaid}
						<div
							class="border-4 border-success rounded-xl p-3 shadow-lg"
						>
							<div class="flex justify-center items-center p-2">
								<Icon
									icon="streamline:ok-hand"
									style="width: 275px; height: 275px;"
									class="text-success"
								/>
							</div>
						</div>
						<div class="text-sm text-center mt-2 text-success font-medium">
							Payment received!
						</div>
					{:else if qrCode}
						<!-- QR Code with hover effect - styled like qr.svelte -->
						<button
							class="relative group cursor-pointer p-4 rounded-xl bg-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
							on:click={copyToClipboard}
							aria-label="Copy invoice"
						>
							<QRCodeImage
								text={'lightning:' + qrCode}
								displayType="canvas"
								displayHeight={275}
								displayWidth={275}
								margin={2}
								errorCorrectionLevel="M"
								displayClass="rounded-md"
							/>
							<!-- Hover overlay with copy icon -->
							<div
								class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 rounded-xl transition-all duration-200"
							>
								<Icon
									icon="heroicons:clipboard-document"
									class="w-12 h-12 text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-md"
								/>
							</div>
						</button>
						<div class="text-sm text-center mt-2 text-base-content/70">
							Tap to copy invoice
						</div>
					{:else}
						<!-- Placeholder while QR is loading -->
						<div
							class="w-[275px] h-[275px] flex items-center justify-center bg-base-200 rounded-xl shadow-lg"
						>
							<span class="loading loading-spinner text-warning"></span>
						</div>
						<div class="text-sm text-center mt-2 text-base-content/70">
							Generating QR Code...
						</div>
					{/if}
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
</div>
