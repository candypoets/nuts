<script lang="ts">
	import { Html5Qrcode, type QrcodeSuccessCallback, type QrcodeErrorCallback } from 'html5-qrcode';
	import Icon from '@iconify/svelte';
	import {} from 'src/stores';
	import { isLightningInvoice, isNostr, isNpub, isValidLNURL } from 'src/actions/wallet';
	import AccountModal from 'src/routes/home/account-modal.svelte';

	import LightningModal from 'src/routes/home/send/lightning.svelte';
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';
	import Layer from 'src/comp/drawers/Layer.svelte';
	import { nip19 } from 'nostr-tools';

	export let open = false;

	let accountModalOpen = false;
	let meltModalOpen = false;
	let scannedPubkey = '';
	let lightningInvoice = '';

	const qrCodeSuccessCallback: QrcodeSuccessCallback = (decodedText, decodedResult) => {
		console.log('success', decodedText, decodedResult);
		// console;log()
		/* handle success */
		if (isLightningInvoice(decodedText)) {
			open = false;
			console.log('Lightning Invoice');

			meltModalOpen = true;
			lightningInvoice = decodedText;
			// open the melt modal
		} else if (isValidLNURL(decodedText)) {
			open = false;
			console.log(decodedText);

			meltModalOpen = true;
			lightningInvoice = decodedText;
			// open the contact modal
			// either send ecash or add as friend
		} else if (isNpub(decodedText)) {
			open = false;
			console.log(decodedText);

			accountModalOpen = true;
			scannedPubkey = nip19.decode(decodedText).data as string;
			// open the contact modal
			// either send ecash or add as friend
		} else if (isNostr(decodedText)) {
			open = false;
			console.log(decodedText, decodedText.slice(6));

			accountModalOpen = true;
			scannedPubkey = nip19.decode(decodedText.slice(6)).data as string;
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
		console.log('start');

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
		await html5QrCode.stop();
	}

	$: {
		if (open) {
			setTimeout(start, 0);
		} else {
			stop();
		}
	}
</script>

<button on:click={() => (open = true)}>
	<Icon icon="teenyicons:scan-solid" class="text-2xl" />
</button>
<Fullscreen bind:open scaleBackground={false}>
	<div class="px-4 flex">
		<div on:click={() => (open = false)}>
			<Icon icon="mingcute:down-line" class="text-xl" />
		</div>
	</div>
	<div id="reader" class="w-full mt-32"></div>
</Fullscreen>

<AccountModal bind:open={accountModalOpen} npub={scannedPubkey} />

<Layer bind:open={meltModalOpen} scaleBackground={false}>
	<LightningModal bind:subopen={meltModalOpen} invoice={lightningInvoice} />
</Layer>
