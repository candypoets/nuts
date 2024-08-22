<script lang="ts">
	import { onMount } from 'svelte';
	import { Html5Qrcode, type QrcodeSuccessCallback, type QrcodeErrorCallback } from 'html5-qrcode';
	import Icon from '@iconify/svelte';
	import {
		accountModalOpen,
		lightningInvoice,
		meltModalOpen,
		scannedPubkey,
		scanning
	} from 'src/stores';
	import { isLightningInvoice, isNpub } from './util/walletUtils';
	import { nip19 } from 'nostr-tools';

	let videoElement;
	// let qrScanner;
	let cameraId;

	const qrCodeSuccessCallback: QrcodeSuccessCallback = (decodedText, decodedResult) => {
		console.log('success', decodedText, decodedResult);
		// console;log()
		/* handle success */
		if (isLightningInvoice(decodedText)) {
			console.log('Lightning Invoice');
			$scanning = false;
			$meltModalOpen = true;
			$lightningInvoice = decodedText;
			// open the melt modal
		} else if (isNpub(decodedText)) {
			$scanning = false;
			$accountModalOpen = true;
			$scannedPubkey = nip19.decode(decodedText).data as string;
			// open the contact modal
			// either send ecash or add as friend
		}
	};
	const qrCodeErrorCallback: QrcodeErrorCallback = (decodedText, decodedResult) => {
		/* handle success */
	};

	const config = { fps: 10, qrbox: { width: 250, height: 250 } };

	let html5QrCode: Html5Qrcode;

	onMount(() => {
		html5QrCode = new Html5Qrcode('reader');
	});

	$: {
		$scanning;
		if ($scanning) start();
		else stop();
	}

	async function start() {
		if (!html5QrCode) return;
		console.log('start');
		$scanning = true;

		await html5QrCode.start(
			{ facingMode: 'environment' },
			config,
			qrCodeSuccessCallback,
			qrCodeErrorCallback
		);
	}

	async function stop() {
		if (!html5QrCode) return;
		console.log('stop');
		$scanning = false;
		await html5QrCode.stop();
	}
</script>

<Icon icon="carbon:camera" class="text-2xl" />
<!-- <div
	id="reader"
	class="fixed mobile-height w-full top-0 left-0 bg-red-700 z-10"
	class:hidden={scanning == false}
></div> -->
