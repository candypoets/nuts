<script lang="ts">
	import { getContact } from 'src/stores/contacts';
	import { Drawer } from 'vaul-svelte';

	export let npub: string;

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
				{#await getContact(npub)}
					unknown
				{:then contact}
					<div class="flex gap-4">
						<img src={contact?.picture} alt="profile" class="w-8 h-8 rounded-full" />
						<div class="flex">
							<strong>{contact?.name}</strong>
							<p class="text-xs">{contact?.about}</p>
						</div>
					</div>
					<div class="flex flex-col gap-4 items-center">
						<button class="btn btn-primary btn-wide">Send Message</button>
						<button class="btn btn-primary btn-wide">Add as friend</button>
						<button class="btn btn-primary btn-wide">Send ecash</button>
					</div>
				{:catch}
					unknown
				{/await}
			</div>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
