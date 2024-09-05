<script lang="ts">
	import { formatAmount } from 'src/actions/wallet';
	import { QRCodeImage } from 'svelte-qrcode-image';

	import Icon from '@iconify/svelte';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import { accountModalOpen, lightningInvoice, meltModalOpen, scannedPubkey } from 'src/stores';

	import AccountModal from './account-modal.svelte';
	import MeltModal from './melt-modal.svelte';
	import { checkProofsSpent } from 'src/actions/wallet';
	import { pendingProofs, proofs, proofsCache, settings, spentProofs } from 'src/stores/db';
	import { balance } from 'src/stores/wallet';
	import { profile } from 'src/stores/profile';
	import QrModal from './qr-modal.svelte';

	import _ from 'lodash';
	import { ADDRESS_ZERO } from 'src/stores/constants';
	import { getEncryptedContent } from 'src/actions/chat';
	import { onMount } from 'svelte';

	let profileOpen: boolean = false;
	let qrOpen: boolean = false;
	let isRefresh = false;

	let isViewing = false;

	let scrollY: number = 0;
</script>

<svelte:window bind:scrollY />
<div
	class="fixed lg:relative w-full lg:w-1/3 place-content-center m-auto px-4 py-2 pb-3 lg:pt-12 bg-basic z-10"
	id="top"
	class:shadow-md={scrollY > 20}
>
	<div class="flex w-full justify-between items-start">
		<h1 class="text-2xl mb-4 font-semibold">Home</h1>
		<div class="flex gap-2 items-center">
			<div on:click={() => (isViewing = !isViewing)}>
				<Icon icon={isViewing ? 'ph:eye-closed' : 'ph:eye'} class="text-2xl" />
			</div>
			<button on:click={() => (qrOpen = true)}><Icon icon="ph:qr-code" class="text-2xl" /></button>
			<div on:click={() => (profileOpen = true)} class="cursor-pointer">
				<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
			</div>
		</div>
	</div>
	<div class="lg:w-full w-11/12 p-4 bg-primary-content rounded-xl py-6">
		<div class="flex w-full justify-between items-center mb-4">
			<div class="text-lg font-semibold">{$profile.name || 'Main Account'}</div>
			<div
				on:click={async () => {
					// console.log($proofsCache, $spentProofs, $pendingProofs);
					isRefresh = true;
					// console.log('checking', allProofs);
					await checkProofsSpent($proofs);
					isRefresh = false;
				}}
			>
				<Icon icon="mdi:reload" class={'text-2xl ' + (isRefresh ? 'animate-spin' : '')} />
			</div>
		</div>

		<strong class="text-3xl" class:blur-md={isViewing}>
			{formatAmount($balance, $settings.unit, true)}
		</strong>
	</div>
</div>
<div
	class="lg:h-auto lg:pt-0 overflow-scroll scrollbar-hide container-height lg:w-1/3 lg:m-auto"
	id="container"
>
	<slot />
</div>

<ProfileModal bind:open={profileOpen} />

<MeltModal bind:open={$meltModalOpen} invoice={$lightningInvoice} />

<AccountModal bind:open={$accountModalOpen} npub={$scannedPubkey} />

<QrModal bind:open={qrOpen} />
