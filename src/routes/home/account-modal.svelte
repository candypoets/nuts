<script lang="ts">
	import { getContact } from 'src/stores/contacts';
	import { contacts } from 'src/stores/db';
	import { Drawer } from 'vaul-svelte';
	import Ecash from './send/ecash.svelte';
	import Icon from '@iconify/svelte';
	import TokenIcon from 'src/comp/tokens/TokenIcon.svelte';
	import { formatAmount } from 'src/comp/util/walletUtils';
	import { totalAmountAvailable } from 'src/stores/mints';

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
						class:hidden={$contacts.some((c) => c.pubkey == npub)}>Add as friend</button
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
							<div class="px-4 flex justify-between">
								<div on:click={() => (subopen = false)}>
									<Icon icon="mdi:close" class="w-6 h-6" />
								</div>
								<strong> Send Ecash </strong>
								<div />
							</div>
							<div class="">
								<div class="p-4">
									<div class="flex gap-4 items-center">
										<div class="w-1/2 text-center">
											<strong class="text-xs">Main Account</strong>
											<div class="flex gap-1 items-center justify-center">
												<TokenIcon />
												<p class="font-bold">
													{formatAmount($totalAmountAvailable, 'sats')}
												</p>
											</div>
										</div>
										<div class="flex justify-center">
											<Icon icon="mdi:arrow-right" class="text-2xl border rounded-full" />
										</div>
										<div
											class="flex items-center justify-center py-2 border-b last:border-none w-1/2"
										>
											<!-- <Icon icon="carbon:lightning" class="w-16 h-6" />
                        -->
											<div class="w-16">
												<img
													src={contact?.picture || '/ns-naked.svg'}
													alt={contact?.name}
													class="border w-8 h-8 rounded-full space-x-4 mx-auto"
												/>
											</div>
											<div class="text-xs">
												<strong>{contact?.name}</strong>
											</div>
										</div>
									</div>
								</div>
								<Ecash toPub={npub} />
							</div></Drawer.Content
						>
					</Drawer.Portal>
				</Drawer.NestedRoot>
			{:catch}
				Error
			{/await}
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
