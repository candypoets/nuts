<script lang="ts">
	import { formatAmount } from 'src/comp/util/walletUtils';
	import { totalAmountAvailable } from 'src/stores/mints';
	import { unit } from '../../stores/settings';

	import Icon from '@iconify/svelte';
	import { profile } from 'src/stores/nostr';
	import ProfileModal from 'src/routes/_profile/index.svelte';

	let profileOpen: boolean = false;
</script>

<div
	class="px-4 lg:px-0 lg:w-1/2 w-full m-auto p-2 lg:mt-40 lg:relative fixed bg-basic z-10"
	id="top"
>
	<div class="flex justify-between items-start">
		<h1 class="text-3xl mb-8">Chat</h1>
		<div class="flex gap-4 p-2 items-center">
			<div on:click={() => (profileOpen = true)} class="cursor-pointer">
				<img src={$profile?.picture || '/ns-naked.svg'} class="w-6 h-6 border-2 rounded-full" />
			</div>
		</div>
	</div>
	<div class="p-4 bg-primary-content rounded-xl w-5/6">
		<div class="flex w-full justify-between">
			<div></div>
			<!-- <div>Main Account</div> -->
			<!-- <img src={$profile.picture || '/ns-naked.svg'} class="w-6 h-6" /> -->
		</div>
		<br />
		<strong class="text-2xl">
			<!-- {formatAmount($totalAmountAvailable, $unit, true)} -->
		</strong>
	</div>
</div>
<div class="lg:h-auto lg:pt-0 overflow-scroll scrollbar-hide container-height" id="container">
	<slot />
</div>

<ProfileModal bind:open={profileOpen} />
