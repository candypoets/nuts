<script lang="ts">
	import Icon from '@iconify/svelte';
	import { checkProofsSpent, formatAmount } from 'src/actions/wallet';
	import User from 'src/routes/explore/user.svelte';
	import { satsLoading } from 'src/stores';
	import { activeAccount, key, keysCache, proofs, settings } from 'src/stores/db';
	import { balance } from 'src/stores/wallet';
	import { onMount } from 'svelte';

	// Props
	export let isViewing;

	// Local state
	let accounts: HTMLElement;
	let isRefresh = false;

	onMount(() => {
		accounts.scrollTo({ left: $activeAccount * accounts.offsetWidth });
	});
</script>

<div
	class="flex gap-2 overflow-x-scroll items-stretch scrollbar-hide snap-x snap-mandatory scroll-smooth"
	bind:this={accounts}
	on:wheel={(e) => {
		$activeAccount = Math.round(accounts.scrollLeft / accounts.clientWidth);
	}}
	on:touchmove={(e) => {
		$activeAccount = Math.round(accounts.scrollLeft / accounts.clientWidth);
	}}
>
	{#each Array.from($keysCache.values()) as k, index}
		{@const isError =
			$activeAccount == index && Array.from($keysCache.values())[$activeAccount]?.pub != $key?.pub}
		<div
			class="w-11/12 shrink-0 p-4 bg-primary-content bg-opacity-50 rounded-xl py-6 overflow-hidden snap-always"
			class:snap-start={index == 0}
			class:snap-center={index != 0}
			class:bg-error-content={isError}
		>
			<div class="flex w-full justify-between items-center mb-4">
				<User pubkey={k.pub} link={false} context={[]} />
				<div
					on:click={async () => {
						isRefresh = true;
						await checkProofsSpent($proofs);
						isRefresh = false;
					}}
				>
					<Icon icon="mdi:reload" class={'text-2xl ' + (isRefresh ? 'animate-spin' : '')} />
				</div>
			</div>
			<strong class="text-3xl" class:blur-md={isViewing || isError}>
				{#if satsLoading}
					<Icon icon="mdi:loading" class="animate-spin text-2xl inline" /> sats
				{:else}
					{formatAmount($balance, $settings?.unit, true)}
				{/if}
			</strong>
		</div>
	{/each}
	<div
		class="w-11/12 shrink-0 p-4 bg-secondary-content bg-opacity-50 rounded-xl py-6 overflow-hidden snap-end snap-always cursor-pointer"
	>
		<div class="flex w-full justify-between items-center mb-4">
			<div class="text-lg font-semibold">New account</div>
			<div>
				<!-- Placeholder for consistency -->
			</div>
		</div>

		<p class="text-sm" class:blur-md={isViewing}>
			Create a new account to receive ecash and navigate nostr. <br />
		</p>
	</div>
</div>
