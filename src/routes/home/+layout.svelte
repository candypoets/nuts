<script lang="ts">
	import { formatAmount } from 'src/comp/util/walletUtils';
	import { totalAmountAvailable } from 'src/stores/mints';
	import { QRCodeImage } from 'svelte-qrcode-image';

	import { nostrPubKey, profile } from 'src/stores/nostr';
	import Icon from '@iconify/svelte';
	import { get } from 'svelte/store';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import {
		accountModalOpen,
		lightningInvoice,
		meltModalOpen,
		scannedPubkey,
		scanning,
		showQR
	} from 'src/stores';
	import { nip19 } from 'nostr-tools';
	import AccountModal from './account-modal.svelte';
	import MeltModal from './melt-modal.svelte';
	import { checkProofsSpent } from 'src/actions/wallet';
	import { db, proofs, settings } from 'src/stores/db';
	import { balance } from 'src/stores/wallet';

	let profileOpen: boolean = false;
	let isRefresh = false;
</script>

<div
	class="px-4 lg:px-0 lg:w-1/2 w-full m-auto p-2 lg:mt-40 lg:relative fixed bg-basic z-10"
	id="top"
>
	<div class="flex justify-between items-start">
		<h1 class="text-2xl mb-4 font-semibold">Home</h1>
		<div class="flex gap-2 items-center">
			<div on:click={() => console.log('ohoh')}><Icon icon="ph:eye" class="text-2xl" /></div>
			<div on:click={() => ($showQR = true)}><Icon icon="ph:qr-code" class="text-2xl" /></div>
			<div on:click={() => (profileOpen = true)} class="cursor-pointer">
				<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
			</div>
		</div>
	</div>
	<div class="p-4 bg-primary-content rounded-xl py-6 w-11/12">
		<div class="flex w-full justify-between items-center">
			<div class="text-lg font-semibold">{$profile.name || 'Main Account'}</div>
			<div
				on:click={async () => {
					isRefresh = true;
					console.log('checking');
					await checkProofsSpent($proofs);
					isRefresh = false;
				}}
			>
				<Icon icon="mdi:reload" class={'text-2xl ' + (isRefresh ? 'animate-spin' : '')} />
			</div>
		</div>
		<br />
		<strong class="text-3xl">
			{formatAmount($balance, $settings.unit, true)}
		</strong>
	</div>
</div>
<div class="lg:h-auto lg:pt-0 overflow-scroll scrollbar-hide container-height" id="container">
	<slot />
</div>

<ProfileModal bind:open={profileOpen} />
<MeltModal bind:open={$meltModalOpen} invoice={$lightningInvoice} />
<AccountModal bind:open={$accountModalOpen} npub={$scannedPubkey} />

<!-- Scanner -->
<div
	class:!z-10={$scanning}
	class:bg-black={$scanning}
	class="-z-10 !fixed w-full top-0 left-0 mobile-height flex flex-col justify-around"
>
	<div class="absolute left-4 top-4 cursor-pointer" on:click={() => ($scanning = false)}>
		<Icon icon="carbon:close" class="text-5xl" />
	</div>
	<!-- header -->
	<div></div>
	<div id="reader" class="w-full"></div>
	{#if $scanning}
		<div class="w-full flex justify-center">
			<button class="btn btn-primary btn-wide" on:click={() => ($scanning = false)}>Close</button>
		</div>
	{/if}
</div>

{#if $showQR}
	<!-- PubKey QR code -->
	<div class="fixed top-0 w-full flex items-center justify-center z-10 mobile-height bg-basic">
		<div class="absolute left-4 top-4 cursor-pointer" on:click={() => ($showQR = false)}>
			<Icon icon="carbon:close" class="text-5xl" />
		</div>
		<div class="flex items-center justify-center flex-col">
			<div class="border-primary border rounded-md p-2">
				<a class="cursor-pointer">
					<QRCodeImage
						text={nip19.npubEncode($nostrPubKey)}
						displayHeight={275}
						displayWidth={275}
						margin={1}
					/>
				</a>
			</div>
		</div>
	</div>
{/if}
