<script lang="ts">
	import { getContact } from 'src/stores/contacts';
	import { contacts, db, key } from 'src/stores/db';
	import { Drawer } from 'vaul-svelte';
	import Ecash from './send/ecash.svelte';
	import Icon from '@iconify/svelte';
	import TokenIcon from 'src/comp/TokenIcon.svelte';
	import { formatAmount } from 'src/actions/wallet';
	import { totalAmountAvailable } from 'src/stores/mints';
	import { signAndSend } from 'src/actions/relay';

	export let npub: string;

	export let open = false;
	let subopen = false;
</script>

<Drawer.Root bind:open dismissible={!subopen}>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="rounded-t-3xl pb-8 pt-3 bg-basic absolute top-4 left-0 right-0 fine-border z-10"
			style="height: 95vh;"
		>
			{#await getContact(npub)}
				unknown
			{:then contact}
				<div class="flex gap-4 p-8 items-center">
					<img src={contact?.picture} alt="profile" class="w-8 h-8 rounded-full" />
					<div class="">
						<strong>{contact?.name}</strong>

						<p class="text-xs">{contact?.about}</p>
					</div>
				</div>
				<div class="flex flex-col gap-4 items-center">
					<button class="btn btn-primary btn-wide" on:click={() => (subopen = true)}
						>Send Ecash</button
					>
					<button
						class="btn btn-primary btn-outline btn-wide"
						class:hidden={$contacts.some((c) => c.pubkey == npub)}
						on:click={async () => {
							$db.contacts.add({
								...contact,
								pubkey: npub,
								createdAt: Math.floor(Date.now() / 1000)
							});
							await signAndSend({
								kind: 3,
								pubkey: $key.pub,
								created_at: Math.floor(Date.now() / 1000),
								tags: $contacts.map((c) => ['p', c.pubkey]),
								content: ''
							});
						}}>Add as friend</button
					>
					<button class="btn btn-primary btn-outline btn-wide">Chat</button>
				</div>
				<Drawer.NestedRoot bind:open={subopen}>
					<!-- <Drawer.Trigger /> -->
					<Drawer.Portal>
						<Drawer.Overlay class="absolute inset-0" />
						<Drawer.Content
							class="pb-8 pt-3 bg-basic absolute top-4 left-0 right-0"
							style="height: 95vh;"
						>
							<Ecash selected={contact} />
						</Drawer.Content>
					</Drawer.Portal>
				</Drawer.NestedRoot>
			{:catch}
				Error
			{/await}
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
