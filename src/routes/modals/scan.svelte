<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Html5Qrcode, type QrcodeErrorCallback, type QrcodeSuccessCallback } from 'html5-qrcode';
	import { isLightningInvoice, isNostr, isNpub, isValidLNURL } from 'src/actions/wallet';
	import {} from 'src/stores';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { nip19 } from 'nostr-tools';
	import { go } from './modal';
	import { onMount } from 'svelte';

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
		if (isLightningInvoice(decodedText)) {
			go('melt:' + decodedText);
			// open the melt modal
		} else if (isValidLNURL(decodedText)) {
			go('melt:' + decodedText);
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

<div id="reader" class="w-full bg-white blur-0 h-auto"></div>
