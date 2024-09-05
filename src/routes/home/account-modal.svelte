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
	import Layer from 'src/comp/drawers/Layer.svelte';
	import SubLayer from 'src/comp/drawers/SubLayer.svelte';

	export let npub: string;

	export let open = false;
	let subopen = false;
</script>

<Layer bind:open dismissible={!subopen}>
	<!-- <Drawer.Trigger /> -->
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
			<button class="btn btn-primary btn-wide" on:click={() => (subopen = true)}>Send Ecash</button>
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
		<SubLayer bind:open={subopen}>
			<!-- <Drawer.Trigger /> -->
			<Ecash selected={contact} />
		</SubLayer>
	{:catch}
		Error
	{/await}
</Layer>
