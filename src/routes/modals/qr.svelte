<script lang="ts">
	import Icon from '@iconify/svelte';
	import { QRCodeImage } from 'svelte-qrcode-image';
	import { getContext } from 'svelte';

	import { key } from 'src/controller';

	let animator = getContext('animator');

	// Add prop for QR code text
	export let qrText: string = $key?.npub;

	// Check if the qrText is an encoded URL and decode it if needed
	if (qrText && qrText.includes('%3A')) {
		const decoded = decodeURIComponent(qrText);
		qrText = decoded;
	}

	$: console.log('QR Text:', qrText);
</script>

<div
	class="top-0 w-feed flex items-center justify-center z-10 mobile-height bg-base-300 bg-opacity-85 pt-safe"
>
	<div class="absolute left-4 top-4 cursor-pointer" on:click|stopPropagation={animator.goBack}>
		<Icon icon="mingcute:down-line" class="text-xl" />
	</div>
	<div class="flex items-center justify-center flex-col">
		<!-- <div class="border-primary border-2 rounded-full p-4 bg-white shadow-lg"> -->
		<a class="cursor-pointer">
			<QRCodeImage
				text={qrText}
				displayType="canvas"
				displayHeight={300}
				displayWidth={300}
				margin={2}
				errorCorrectionLevel="H"
				displayClass="rounded-md"
			/>
		</a>
		<!-- </div> -->
	</div>
</div>
