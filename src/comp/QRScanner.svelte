<script lang="ts">
	import { onMount } from 'svelte';
	import { Html5Qrcode, type QrcodeSuccessCallback, type QrcodeErrorCallback } from 'html5-qrcode';
	import Icon from '@iconify/svelte';
	import { scanning } from 'src/stores';

	let videoElement;
	// let qrScanner;
	let cameraId;

	const qrCodeSuccessCallback: QrcodeSuccessCallback = (decodedText, decodedResult) => {
		// console;log()
		/* handle success */
	};
	const qrCodeErrorCallback: QrcodeErrorCallback = (decodedText, decodedResult) => {
		/* handle success */
	};

	const config = { fps: 10, qrbox: { width: 250, height: 250 } };

	async function start() {
		console.log('start');
		$scanning = true;
		const html5QrCode = new Html5Qrcode('reader', true);
		await html5QrCode.start(
			{ facingMode: 'environment' },
			config,
			qrCodeSuccessCallback,
			qrCodeErrorCallback
		);
	}
</script>

<div on:click={() => start()}>
	<Icon icon="ic:baseline-qrcode" class="text-xl" />
</div>
<!-- <div
	id="reader"
	class="fixed mobile-height w-full top-0 left-0 bg-red-700 z-10"
	class:hidden={scanning == false}
></div> -->
