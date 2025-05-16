<script lang="ts">
	import Icon from '@iconify/svelte';
	import { QRCodeImage } from 'svelte-qrcode-image';

	import { goBack } from 'src/routes/modals/modal';
	import { key } from 'src/controller';
</script>

<div
	class="fixed top-0 w-full flex items-center justify-center z-10 mobile-height bg-base-300 bg-opacity-85"
>
	<div class="absolute left-4 top-4 cursor-pointer" on:click|stopPropagation={goBack}>
		<Icon icon="mingcute:down-line" class="text-xl" />
	</div>
	<div class="flex items-center justify-center flex-col">
		<div class="border-primary border rounded-md p-2">
			<a class="cursor-pointer">
				<QRCodeImage text={$key?.npub} displayHeight={275} displayWidth={275} margin={1} />
			</a>
		</div>
	</div>
</div>
