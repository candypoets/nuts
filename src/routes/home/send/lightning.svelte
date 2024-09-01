<script lang="ts">
	import { browser } from '$app/environment';
	import type { Proof } from '@cashu/cashu-ts';
	import { settings } from 'src/stores/db';
	import { onMount } from 'svelte';
	import MintSelector from 'src/comp/MintSelector.svelte';
	import TokenIcon from 'src/comp/TokenIcon.svelte';
	import { formatAmount, getAmountForTokenSet } from 'src/actions/wallet';
	import { amountAvailable, mint, mints } from 'src/stores/mints';
	import Icon from '@iconify/svelte';
	import { scanning } from 'src/stores';
	import QrScanner from 'src/comp/QRScanner.svelte';

	export let subopen: boolean = false;

	let send: () => Promise<void>;
	let getMeltQuote: () => Promise<void>;
	let amount: number | undefined = undefined;
	let isCoinSelection = false;
	let selectedTokens: Proof[];
	let isSend = true;
	let encodedToken: string;
	let invoice: string;
	let fees: 0;
	let activeS = 'send';
	let processing = false;

	$: mintbalance = amountAvailable($mint);

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
</script>

<div class="px-4 flex justify-between">
	<div on:click={() => (subopen = false)} aria-label="Close" role="button" tabindex="-1" autofocus>
		<Icon icon="mdi:close" class="w-6 h-6" />
	</div>
	<strong> Lightning Payment </strong>
	<div />
</div>
<br />
<MintSelector />
<div class="flex gap-1 items-center justify-center mt-4">
	<TokenIcon />

	<p class="font-bold">
		{formatAmount($mint ? $mintbalance : 0, $settings.unit)}
	</p>
	<p>available</p>
</div>

<div class="join w-full px-4 mt-20">
	<input class="w-full join-item px-2" type="text" placeholder="Lightning invoice or address" />
	<button class="btn btn-primary join-item"><QrScanner /></button>
	<!-- <button class="btn join-item">Submit</button> -->
</div>

<!-- <div class=" flex items-center justify-center w-full">
			{#if !isSend}
				<Melting
					bind:getMeltQuote
					bind:active
					bind:invoice
					bind:mint
					bind:selectedTokens
					bind:isCoinSelection
					bind:fees
					bind:amount
					bind:activeS
					bind:processing
				/>
			{/if}
		</div>
		{#if isSend}
			<Sending
				bind:send
				bind:active
				bind:mint
				bind:amount
				bind:selectedTokens
				bind:isCoinSelection
				bind:encodedToken
				bind:processing
			/>
		{/if}
	{:else if activeS === 'send-scan'}
		<ScanLn bind:invoice bind:activeS />
	{/if} -->
<!-- {/if} -->
<!-- </div> -->
