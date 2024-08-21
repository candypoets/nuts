<script lang="ts">
	import Icon from '@iconify/svelte';
	import ClaimOfflineTokens from 'src/comp/elements/ClaimOfflineTokens.svelte';
	import WalletLock from 'src/comp/elements/WalletLock.svelte';
	import { formatAmount, getAmountForTokenSet, getLockedTokens } from 'src/comp/util/walletUtils';
	import { onMount } from 'svelte';
	import { mints, totalAmountAvailable } from '../../stores/mints';
	import { isEncrypted, unit } from '../../stores/settings';
	import { token } from '../../stores/tokens';
	import AddModal from './add-modal.svelte';
	import Transactions from './transactions.svelte';
	import SendModal from './send/send-modal.svelte';
	import AddFriendModal from './add-friend-modal.svelte';
	import { profile } from 'src/stores/nostr';
	import ProfileModal from './profile-modal.svelte';

	let active = 'base';
	let encodedToken = '';
	let selectedMint = $mints[0];

	let addOpen: boolean = false;
	let sendOpen: boolean = false;
	let addFriend: boolean = false;

	onMount(() => {
		const keyDown = (e: KeyboardEvent) => {
			if (e.key === 'R') {
				active = 'receive';
			} else if (e.key === 'S') {
				if ($mints.length) {
					active = 'send';
				}
			} else if (e.key === 'B') {
				active = 'base';
			}
		};
		window.addEventListener('keydown', keyDown);

		return () => {
			// this function is called when the component is destroyed
			window.removeEventListener('keydown', keyDown);
		};
	});

	onMount(async () => {
		// const searchParams = $page.url.searchParams;
		// if (searchParams) {
		// 	isOnboarded.set(true);
		// 	const mintUrl = searchParams.get('mint');
		// 	if (mintUrl) {
		// 		$activeTab = 'mint';
		// 	} else if (searchParams.get('token')) {
		// 		isOnboarded.set(true);
		// 		isEncrypted.set(false);
		// 		active = 'receive';
		// 		const originalUrl = $page.url.toString();
		// 		const newUrl = originalUrl.split('?')[0];
		// 		encodedToken = searchParams.get('token') ?? '';
		// 		await goto(newUrl, {
		// 			replaceState: true,
		// 			keepFocus: true,
		// 			noScroll: true
		// 		});
		// 	}
		// }
	});

	$: console.log($profile);
</script>

<div class="flex gap-2 mx-4 -mt-4">
	<div class="text-center">
		<button class="btn w-14 h-14 btn-primary btn-circle" on:click={() => (addOpen = true)}>
			<Icon icon="carbon:add" class="w-8 h-8" />
		</button>
		<div class="text-sm mt-1 font-semibold">Add money</div>
	</div>
	<div class="text-center">
		<button class="btn w-14 h-14 btn-primary btn-circle" on:click={() => (sendOpen = true)}>
			<Icon icon="carbon:arrow-right" class="w-8 h-8" />
		</button>
		<div class="text-sm mt-1 font-semibold">Send money</div>
	</div>
	<div class="text-center">
		<button class="btn w-14 h-14 btn-circle btn-outline" on:click={() => (addFriend = true)}>
			<Icon icon="carbon:user" class="w-8 h-8" />
		</button>
		<div class="text-sm mt-1 font-semibold">Add friend</div>
	</div>

	{#if getLockedTokens($token).length}
		<ClaimOfflineTokens></ClaimOfflineTokens>
	{/if}
</div>
<Transactions />
{#if $isEncrypted}
	<WalletLock></WalletLock>
{/if}
<AddModal bind:open={addOpen} />

<SendModal bind:open={sendOpen} />

<AddFriendModal bind:open={addFriend} />
