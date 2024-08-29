<script lang="ts">
	import Icon from '@iconify/svelte';
	import { liveQuery } from 'dexie';
	import TokenIcon from 'src/comp/TokenIcon.svelte';
	import QRScanner from 'src/comp/QRScanner.svelte';
	import { formatAmount } from 'src/actions/wallet';
	import Send from 'src/comp/wallet/Send.svelte';
	import { updateVc } from 'src/lib';
	import type { Contact } from 'src/model/contact';
	import { db, settings } from 'src/stores/db';
	import { mints, totalAmountAvailable } from 'src/stores/mints';

	import { onMount } from 'svelte';
	import { Drawer } from 'vaul-svelte';
	import AddFriendModal from '../add-friend-modal.svelte';
	import Ecash from './ecash.svelte';
	import Tapcash from './tapcash.svelte';
	import Lightning from './lightning.svelte';

	let active: string;
	let search: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	$: {
		if (open) {
			updateVc();
		} else {
			updateVc();
		}
	}

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
	$: contacts = liveQuery(() => $db.contacts.orderBy('createdAt').reverse().limit(100).toArray());

	$: console.log('open', open, addFriend);

	onMount(updateVc);
</script>

<!-- <ScanLN bind:invoice={scannedNpub} /> -->
<Drawer.Root dismissible={!subopen} bind:open shouldScaleBackground={true}>
	<!-- <Drawer.Trigger /> -->
	<Drawer.Portal>
		<Drawer.Overlay class="absolute inset-0 bg-black/40 z-10" />
		<Drawer.Content
			class="pb-8 pt-3 bg-basic absolute top-0 left-0 right-0 z-10"
			style="height: 100vh;"
		>
			<div class="fixed w-full bg-basic">
				<div class="px-4 flex justify-between">
					<div on:click={() => (open = false)}>
						<Icon icon="mingcute:down-line" class="text-xl" />
					</div>
					<div class="flex space-x-8">
						<!-- <div on:click={() => (scan = true)}>
							<Icon icon="ic:baseline-qrcode" class="text-xl" />
						</div> -->
						<QRScanner />
						<div
							on:click={() => {
								addFriend = true;
								subopen = true;
							}}
						>
							<Icon icon="mingcute:add-fill" class="text-xl" />
						</div>
					</div>
				</div>
				<h2 class="text-xl font-bold px-4 pt-4">Send Money</h2>
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
						class="flex items-center justify-around py-2 border-b"
						on:click={() => {
							subopen = true;
							paymentType = 'Tapcash';
						}}
					>
						<Icon icon="carbon:lightning" class="w-16 h-6" />
						<div class="flex-grow">
							<strong>Tap cash</strong>
							<p class="text-xs">Offline instant payment</p>
						</div>
						<Icon icon="carbon:arrow-right" class="w-16 h-6" />
					</div>
					<!-- <div
						class="flex items-center justify-around py-2 border-b"
						on:click={() => {
							subopen = true;
							paymentType = 'Zap';
						}}
					>
						<Icon icon="carbon:lightning" class="w-16 h-6" />
						<div class="flex-grow">
							<strong>Send to friends</strong>
							<p class="text-xs">Instant zap</p>
						</div>
						<Icon icon="carbon:arrow-right" class="w-16 h-6" />
					</div> -->
					<div
						class="flex items-center justify-around py-2 border-b"
						on:click={() => {
							subopen = true;
							paymentType = 'Invoice';
						}}
					>
						<Icon icon="carbon:lightning" class="w-16 h-6" />
						<div class="flex-grow">
							<strong>Pay an invoice</strong>
							<p class="text-xs">Pay out with lightning</p>
						</div>
						<Icon icon="carbon:arrow-right" class="w-16 h-6" />
					</div>
				</div>
				<strong class="text-lg">Contacts</strong>
				<div class="my-4 rounded-lg border">
					{#each $contacts || [] as friend}
						<div
							class="flex items-center justify-around py-2 border-b last:border-none"
							on:click={() => {
								selectedContact = friend;
								subopen = true;
								paymentType = 'Zap';
							}}
						>
							<!-- <Icon icon="carbon:lightning" class="w-16 h-6" />
							  -->
							<div class="w-16">
								<img
									src={friend.picture || '/ns-naked.svg'}
									alt={friend.name}
									class="border w-8 h-8 rounded-full space-x-4 mx-auto"
								/>
							</div>
							<div class="flex-grow">
								<strong>{friend.name}</strong>
								<!-- <p class="text-xs">Offline instant payment</p> -->
							</div>
							<!-- <Icon icon="carbon:arrow-right" class="w-16 h-6" /> -->
						</div>
					{/each}
				</div>
				<!-- <Send active="send" /> -->
				<!-- <Minting bind:active bind:isMinting bind:doMint /> -->

				<!-- {#if !isMinting && !doMint && !isToken && $mints.length}
					<div class="divider">or</div>
				{/if} -->
				<!-- {#if !isMinting && !doMint}
					<Receiving bind:active bind:activeR bind:encodedToken bind:isToken />
				{/if} -->
			</div>

			<AddFriendModal bind:open={addFriend} />
			<Drawer.NestedRoot bind:open={subopen}>
				<!-- <Drawer.Trigger /> -->
				<Drawer.Portal>
					<Drawer.Overlay class="absolute inset-0 bg-black/40" />
					<Drawer.Content
						class="pb-8 pt-3 bg-basic absolute top-4 left-0 right-0"
						style="height: 95vh;"
					>
						{#if paymentType === 'Tapcash'}
							<Tapcash />
						{:else if paymentType === 'Zap'}
							<Ecash selected={selectedContact} bind:subopen />
						{:else if paymentType === 'Invoice'}
							<Lightning bind:subopen />
						{/if}
					</Drawer.Content>
				</Drawer.Portal>
			</Drawer.NestedRoot>
		</Drawer.Content>
	</Drawer.Portal>
</Drawer.Root>
