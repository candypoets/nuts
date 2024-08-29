<script lang="ts">
	import Icon from '@iconify/svelte';
	import { key } from 'src/stores/db';
	import { QRCodeImage } from 'svelte-qrcode-image';
	import { Drawer } from 'vaul-svelte';

	export let open: boolean = false;
</script>

<Drawer.Root bind:open>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="rounded-t-3xl pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 fine-border z-10"
			style="height: 95vh;"
		>
			<div class="fixed top-0 w-full flex items-center justify-center z-10 mobile-height bg-basic">
				<div class="absolute left-4 top-4 cursor-pointer" on:click={() => (open = false)}>
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
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
