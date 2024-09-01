<script lang="ts">
	import { onMount } from 'svelte';
	import { Html5Qrcode, type QrcodeSuccessCallback, type QrcodeErrorCallback } from 'html5-qrcode';
	import Icon from '@iconify/svelte';
	import {} from 'src/stores';
	import { isLightningInvoice, isNostr, isNpub } from 'src/actions/wallet';
	import AccountModal from 'src/routes/home/account-modal.svelte';
	import MeltModal from 'src/routes/home/melt-modal.svelte';
	import { nip19 } from 'nostr-tools';
	import { Drawer } from 'vaul-svelte';

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
<Drawer.Root bind:open>
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="pb-8 pt-3 bg-basic absolute top-0 left-0 right-0 z-10"
			style="height: 100vh;"
		>
			<div class="px-4 flex">
				<div on:click={() => (open = false)}>
					<Icon icon="mingcute:down-line" class="text-xl" />
				</div>
			</div>
			<div id="reader" class="w-full mt-32"></div>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>

<AccountModal bind:open={accountModalOpen} npub={scannedPubkey} />
<MeltModal bind:open={meltModalOpen} invoice={lightningInvoice} />
