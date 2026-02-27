<script lang="ts">
	import { Html5Qrcode, type QrcodeErrorCallback, type QrcodeSuccessCallback } from 'html5-qrcode';
	import { isLightningInvoice, isNostr, isNpub, isValidLNURL } from 'src/lib/wallet';
	import { nip19 } from 'nostr-tools';
	import { getContext, onMount } from 'svelte';
	import Icon from '@iconify/svelte';

	// Import components for inline display
	import Melt from './melt.svelte';
	import Kind0 from '../_kinds/kind0.svelte';

	let animator = getContext('animator');

	export let open = false;

	// State for what to show
	let view: 'scan' | 'melt' | 'profile' = 'scan';
	let scannedInvoice = '';
	let scannedPubkey = '';

	// For Kind0 component
	let visible = true;

	function goBackToScan() {
		view = 'scan';
		scannedInvoice = '';
		scannedPubkey = '';
		// Restart scanning
		setTimeout(start, 100);
	}

	const qrCodeSuccessCallback: QrcodeSuccessCallback = (decodedText, decodedResult) => {
		console.log('[scan] QR detected:', decodedText.substring(0, 50) + '...');
		
		if (isLightningInvoice(decodedText)) {
			console.log('[scan] Lightning invoice detected');
			// Strip "lightning:" prefix if present (BIP-21 URI format)
			scannedInvoice = decodedText.startsWith('lightning:') ? decodedText.slice(10) : decodedText;
			view = 'melt';
			stop();
		} else if (isValidLNURL(decodedText)) {
			console.log('[scan] LNURL detected');
			scannedInvoice = decodedText;
			view = 'melt';
			stop();
		} else if (isNpub(decodedText)) {
			scannedPubkey = nip19.decode(decodedText).data as string;
			view = 'profile';
			stop();
		} else if (isNostr(decodedText)) {
			scannedPubkey = nip19.decode(decodedText.slice(6)).data as string;
			view = 'profile';
			stop();
		}
	};

	const qrCodeErrorCallback: QrcodeErrorCallback = (decodedText, decodedResult) => {
		/* handle error */
	};

	const config = { fps: 10, qrbox: { width: 250, height: 250 } };

	let html5QrCode: Html5Qrcode;

	async function start() {
		if (view !== 'scan') return;
		html5QrCode = new Html5Qrcode('reader');
		if (!html5QrCode) return;

		await html5QrCode.start(
			{ facingMode: 'environment' },
			config,
			qrCodeSuccessCallback,
			qrCodeErrorCallback
		);
	}

	async function stop() {
		if (!html5QrCode) return;
		await html5QrCode.stop();
	}

	onMount(() => {
		setTimeout(start, 0);
		return stop;
	});
</script>

{#if view === 'scan'}
	<div class="h-screen bg-base-300 bg-opacity-85 flex items-center pt-safe">
		<div id="reader" class="w-full bg-white blur-0 h-auto"></div>
	</div>
{:else if view === 'melt'}
	<div class="h-screen bg-base-300 bg-opacity-95 relative">
		<!-- Back button to return to scanner -->
		<button
			class="absolute top-4 left-4 z-50 btn btn-circle btn-sm"
			on:click={goBackToScan}
		>
			<Icon icon="mdi:arrow-left" class="text-lg" />
		</button>
		<Melt invoice={scannedInvoice} />
	</div>
{:else if view === 'profile'}
	<div class="h-screen bg-base-300 bg-opacity-95 relative">
		<!-- Back button to return to scanner -->
		<button
			class="absolute top-4 left-4 z-50 btn btn-circle btn-sm"
			on:click={goBackToScan}
		>
			<Icon icon="mdi:arrow-left" class="text-lg" />
		</button>
		<Kind0 pubkey={scannedPubkey} {visible} goBack={goBackToScan} />
	</div>
{/if}
