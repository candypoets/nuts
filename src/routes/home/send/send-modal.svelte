<script lang="ts">
	import Icon from '@iconify/svelte';
	import QRScanner from 'src/comp/QRScanner.svelte';
	import type { Contact } from 'src/model/contact';
	import { contacts } from 'src/stores/db';
	import { mints } from 'src/stores/mints';

	import { onMount } from 'svelte';
	import AddFriendModal from '../add-friend-modal.svelte';
	import Ecash from './ecash.svelte';
	import Tapcash from './tapcash.svelte';
	import Lightning from './lightning.svelte';
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';
	import SubLayer from 'src/comp/drawers/SubLayer.svelte';
	import { getContact } from 'src/stores/contacts';

	let active: string;
	let search: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	$: {
		if (open) {
		} else {
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

	let paymentType: '' | 'Tapcash' | 'Zap' | 'Invoice' = '';

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
	// $: contacts = liveQuery(() => $db.contacts.orderBy('createdAt').reverse().limit(100).toArray());
</script>

<!-- <ScanLN bind:invoice={scannedNpub} /> -->
<Fullscreen dismissible={!subopen && !scan && !addFriend} bind:open>
	<!-- <Drawer.Trigger /> -->
	<div class="fixed w-full bg-basic">
		<div class="px-4 flex justify-between">
			<div on:click={() => (open = false)}>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</div>
			<div class="flex">
				<!-- <div on:click={() => (scan = true)}>
							<Icon icon="ic:baseline-qrcode" class="text-xl" />
						</div> -->

				<QRScanner />
				<div
					on:click={() => {
						addFriend = true;
						// subopen = true;
						paymentType = '';
					}}
					class="ml-4"
				>
					<Icon icon="teenyicons:add-outline" class="text-2xl" />
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
				class="flex items-center justify-around py-2 border-b opacity-40"
				on:click={() => {
					// subopen = true;
					// paymentType = 'Tapcash';
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
				{#await getContact(friend.pubkey) then f}
					<div
						class="flex items-center justify-around py-2 border-b last:border-none"
						on:click={() => {
							selectedContact = f;
							subopen = true;
							paymentType = 'Zap';
						}}
					>
						<!-- <Icon icon="carbon:lightning" class="w-16 h-6" />
							  -->
						<div class="w-16">
							<img
								src={f?.picture || '/ns-naked.svg'}
								alt={f?.name}
								class="border w-8 h-8 rounded-full space-x-4 mx-auto"
							/>
						</div>
						<div class="flex-grow">
							<strong>{f?.name}</strong>
							<!-- <p class="text-xs">Offline instant payment</p> -->
						</div>
						<!-- <Icon icon="carbon:arrow-right" class="w-16 h-6" /> -->
					</div>
				{/await}
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

	<SubLayer bind:open={addFriend}>
		<AddFriendModal bind:open={addFriend} scaleBackground={false} />
	</SubLayer>
	<SubLayer bind:open={subopen}>
		<!-- <Drawer.Trigger /> -->
		{#if paymentType === 'Tapcash'}
			<Tapcash />
		{:else if paymentType === 'Zap'}
			<Ecash selected={selectedContact} bind:subopen />
		{:else if paymentType === 'Invoice'}
			<Lightning bind:subopen />
		{/if}
	</SubLayer>
</Fullscreen>
