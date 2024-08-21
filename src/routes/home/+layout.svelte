<script lang="ts">
	import { formatAmount } from 'src/comp/util/walletUtils';
	import { totalAmountAvailable } from 'src/stores/mints';
	import { isEncrypted, unit } from '../../stores/settings';

	import { profile } from 'src/stores/nostr';
	import Icon from '@iconify/svelte';
	import { get } from 'svelte/store';
	import ProfileModal from './profile-modal.svelte';

	let profileOpen: boolean = false;
</script>

<div
	class="px-4 lg:px-0 lg:w-1/2 w-full m-auto p-2 lg:mt-40 lg:relative fixed bg-basic z-10"
	id="top"
>
	<div class="flex justify-between items-start">
		<h1 class="text-2xl mb-4 font-semibold">Home</h1>
		<div class="flex gap-4 items-center">
			<div on:click={() => console.log('ohoh')}><Icon icon="ph:eye" class="text-2xl" /></div>
			<div on:click={() => (profileOpen = true)} class="cursor-pointer">
				<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
			</div>
		</div>
	</div>
	<div class="p-4 bg-primary-content rounded-xl py-6 w-11/12">
		<div class="flex w-full justify-between">
			<div class="text-lg font-semibold">{$profile.name || 'Main Account'}</div>
			<!-- <div>Main Account</div> -->
			<!-- <img src={$profile.picture || '/ns-naked.svg'} class="w-6 h-6" /> -->
		</div>
		<br />
		<strong class="text-3xl">
			{formatAmount($totalAmountAvailable, $unit, true)}
		</strong>
	</div>
</div>
<div class="lg:h-auto lg:pt-0 overflow-scroll scrollbar-hide container-height" id="container">
	<slot />
</div>

<ProfileModal bind:open={profileOpen} />
