<script lang="ts">
	import { getContact } from 'src/stores/contacts';
	import { decode } from 'lightning-invoice';
	import { Drawer } from 'vaul-svelte';

	export let invoice: string;

	export let open = false;
</script>

<Drawer.Root bind:open>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="rounded-t-3xl pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 fine-border z-10"
			style="height: 95vh;"
		>
			<div>
				{#await decode(invoice)}
					unknown
				{:then res}
					<div class="flex gap-4">
						<div class="flex">
							<strong>{res?.amount}</strong>
							<p class="text-xs">{res?.shortDesc}</p>
						</div>
					</div>
					<div class="flex flex-col gap-4 items-center">
						<button class="btn btn-primary btn-wide">Pay Invoice</button>
					</div>
				{:catch}
					unknown
				{/await}
			</div>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
