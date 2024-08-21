<script lang="ts">
	import Icon from '@iconify/svelte';
	import Minting from 'src/comp/mint/Minting.svelte';
	import Send from 'src/comp/wallet/Send.svelte';
	import { amountAvailable, mints, totalAmountAvailable } from 'src/stores/mints';
	import { Drawer } from 'vaul-svelte';
	import { db } from 'src/stores/db';
	import { liveQuery } from 'dexie';
	import { onMount } from 'svelte';
	import { updateVc } from 'src/lib';
	import type { Contact } from 'src/model/contact';
	import MintSelector from 'src/comp/elements/MintSelector.svelte';
	import ScanLN from 'src/comp/elements/ScanLN.svelte';
	import TokenIcon from 'src/comp/tokens/TokenIcon.svelte';
	import { formatAmount } from 'src/comp/util/walletUtils';
	import { unit } from 'src/stores/settings';
	import ScanLn from 'src/comp/elements/ScanLN.svelte';
	import { profile } from 'src/stores/nostr';

	let active: string;
	let search: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	let addFriend = false;
	let scan = false;
	let scannedNpub: string;

	export let subopen: boolean = false;

	let mint = $mints[0];

	let isToken = false;
	let isMinting = false;
	let doMint = false;
	let activeR: string;

	let activeMint = $mints[0];

	let paymentType: 'Tapcash' | 'Zap' | 'Invoice' = 'Tapcash';

	let selectedContact: Contact;

	// const navigate = () => {
	// 	isMinting = false;
	// 	isToken = false;
	// 	if (activeR === 'scan-receive' || doMint) {
	// 		activeR = 'receive';
	// 		doMint = false;
	// 	} else {
	// 		active = 'base';
	// 	}
	// };
	let contacts = liveQuery(() => $db.contacts.orderBy('createdAt').reverse().limit(30).toArray());
	$: console.log('open', open, addFriend);

	onMount(updateVc);
</script>

<!-- <ScanLN bind:invoice={scannedNpub} /> -->
<Drawer.Root dismissible={!subopen} bind:open shouldScaleBackground={true}>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="fixed inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="pb-8 pt-3 bg-basic absolute top-0 left-0 right-0 z-10"
			style="height: 100vh;"
		>
			<div class="fixed w-full bg-basic">
				<div class="px-4 flex justify-between">
					<div on:click={() => (open = false)}>
						<Icon icon="mingcute:down-line" class="text-xl" />
					</div>
					<!-- <div class="flex space-x-8">
						<div on:click={() => (scan = true)}>
							<Icon icon="ic:baseline-qrcode" class="text-xl" />
						</div>
						<div on:click={() => (addFriend = true)}>
							<Icon icon="mingcute:add-fill" class="text-xl" />
						</div>
					</div> -->
				</div>
				<h2 class="text-xl font-bold px-4 pt-4">{$profile.name || 'Profile'}</h2>
			</div>
			<div class="p-4 container-height overflow-scroll !pt-20" id="container">
				<div class="join bg-base-200 rounded-md w-full">
					<div class="join-item p-2">
						<Icon icon="carbon:search" />
					</div>
					<input
						placeholder="Search"
						bind:value={search}
						class="join-item flex-grow px-2 outline-none bg-transparent"
					/>
				</div>
				<div class="my-4 rounded-lg border">
					<div
						class="flex items-center justify-around py-4 border-b last:border-none"
						on:click={() => {
							subopen = true;
							paymentType = 'Tapcash';
						}}
					>
						<Icon icon="mdi:bell-outline" class="w-16 h-6" />
						<div class="flex-grow">
							<strong>Notifications</strong>
							<!-- <p class="text-xs">Notifications</p> -->
						</div>
						<Icon icon="carbon:arrow-right" class="w-16 h-6" />
					</div>
				</div>
				<h3 class="font-bold">Profile</h3>
				<div class="my-4 rounded-lg border">
					<div
						class="flex items-center justify-around py-2 border-b"
						on:click={() => {
							subopen = true;
							paymentType = 'Zap';
						}}
					>
						<Icon icon="game-icons:bird-mask" class="w-16 h-6" />
						<div class="flex-grow">
							<strong>Relays</strong>
							<p class="text-xs">Your relay of choice</p>
						</div>
						<Icon icon="carbon:arrow-right" class="w-16 h-6" />
					</div>
					<div
						class="flex items-center justify-around py-2"
						on:click={() => {
							subopen = true;
							// paymentType = 'Invoice';
						}}
					>
						<Icon icon="mdi:bank-outline" class="w-16 h-6" />
						<div class="flex-grow">
							<strong>Mints</strong>
							<p class="text-xs">The mint you trust</p>
						</div>
						<Icon icon="carbon:arrow-right" class="w-16 h-6" />
					</div>
				</div>
			</div>

			<Drawer.NestedRoot bind:open={subopen}>
				<!-- <Drawer.Trigger /> -->
				<Drawer.Portal>
					<Drawer.Overlay class="fixed inset-0 bg-black/40" />
					<Drawer.Content
						class="pb-8 pt-3 bg-white fixed bottom-0 left-0 right-0"
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
												{formatAmount($totalAmountAvailable, $unit)}
											</p>
										</div>
									</div>
									<div class="flex justify-center">
										<Icon icon="mdi:arrow-right" class="text-2xl border rounded-full" />
									</div>
									<!-- <div
										class="flex items-center justify-center py-2 border-b last:border-none w-1/2"
									>
										<div class="w-16">
											<img
												src={selectedContact.picture || '/ns-naked.svg'}
												alt={selectedContact.name}
												class="border w-8 h-8 rounded-full space-x-4 mx-auto"
											/>
										</div>
										<div class="text-xs">
											<strong>{selectedContact.name}</strong>
										</div>
									</div> -->
								</div>
							</div>
						</div></Drawer.Content
					>
				</Drawer.Portal>
			</Drawer.NestedRoot>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
