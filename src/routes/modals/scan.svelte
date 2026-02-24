<script lang="ts">
	import { Html5Qrcode, type QrcodeErrorCallback, type QrcodeSuccessCallback } from 'html5-qrcode';
	import { isLightningInvoice, isNostr, isNpub, isValidLNURL } from 'src/lib/wallet';
	import {} from 'src/controller';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { nip19 } from 'nostr-tools';
	import { onMount } from 'svelte';
	import { go } from './modal';

	export let open = false;

	let scannedPubkey = '';

	function gopub(pubkey: string) {
		const currentPath = $page.url.pathname;
		const profilePath = `nprofile:${pubkey}`;

		// Check if the current URL already ends with the profile we're trying to navigate to
		if (!currentPath.endsWith(profilePath)) {
			goto(`${currentPath}/${profilePath}`);
		}
	}

	const qrCodeSuccessCallback: QrcodeSuccessCallback = (decodedText, decodedResult) => {
		/* handle success */
		console.log('[scan] QR detected:', decodedText.substring(0, 50) + '...');
		if (isLightningInvoice(decodedText)) {
			console.log('[scan] Lightning invoice detected');
			// Strip "lightning:" prefix if present (BIP-21 URI format)
			const invoice = decodedText.startsWith('lightning:') ? decodedText.slice(10) : decodedText;
			// Encode the invoice to handle special characters safely
			go('melt:' + encodeURIComponent(invoice));
			// open the melt modal
		} else if (isValidLNURL(decodedText)) {
			console.log('[scan] LNURL detected');
			go('melt:' + encodeURIComponent(decodedText));
			// open the contact modal
			// either send ecash or add as friend
		} else if (isNpub(decodedText)) {
			scannedPubkey = nip19.decode(decodedText).data as string;
			gopub(scannedPubkey);
			// open the contact modal
			// either send ecash or add as friend
		} else if (isNostr(decodedText)) {
			scannedPubkey = nip19.decode(decodedText.slice(6)).data as string;
			gopub(scannedPubkey);
		}
		stop();
	};
	const qrCodeErrorCallback: QrcodeErrorCallback = (decodedText, decodedResult) => {
		/* handle success */
	};

	const config = { fps: 10, qrbox: { width: 250, height: 250 } };

	let html5QrCode: Html5Qrcode;

	async function start() {
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

<div class="h-screen bg-base-300 bg-opacity-85 flex items-center pt-safe">
	<div id="reader" class="w-full bg-white blur-0 h-auto"></div>
</div>
