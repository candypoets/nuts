<script lang="ts">
	import type { Mint } from '../../model/mint';
	import { amountAvailable, getAmountAvailable, mint, mints } from '../../stores/mints';
	import { unit } from '../../stores/settings';
	import { token } from '../../stores/tokens';
	import TokenIcon from '../tokens/TokenIcon.svelte';
	import { formatAmount, getAmountForTokenSet, getTokensForMint } from '../util/walletUtils';

	const formatMintText = (url: string) => {
		if (url.length <= 20) {
			return url;
		}
		const first10 = url.substring(0, 10);
		const last10 = url.substring(url.length - 10, url.length);
		return `${first10}...${last10}`;
	};

	$: console.log($mints);
</script>

<button class="dropdown dropdown-bottom w-full my-2">
	<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
	<!-- svelte-ignore a11y-label-has-associated-control -->
	<label tabindex="0" class="join-item w-full">
		<div class="flex items-center justify-between gap-1 w-full px-4">
			<div class="rounded-full bg-success w-4 h-4 p-0.5">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-white"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
				</svg>
			</div>
			<p class="max-w-xs text-xs flex-grow">
				{$mint?.mintURL ?? '----'}
			</p>
			<div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-6 h-6"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</div>
		</div>
	</label>

	<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
	<ul
		tabindex="0"
		class="z-10 dropdown-content menu py-2 shadow bg-base-100 rounded-box md:w-72 max-h-56 overflow-scroll flex-row scrollbar-hide w-full"
	>
		{#each $mints as m}
			<li on:click={() => ($mint = m)} class="rounded-xl w-full">
				<div class="flex gap-1 items-center w-full">
					{#if m.mintURL === $mint?.mintURL}
						<div class="rounded-full bg-success w-4 h-4 p-0.5">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-white"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
						</div>
					{:else}
						<div class="w-4 h-4" />
					{/if}
					<a class="flex-grow text-xs">{m.mintURL}</a>
					<div class="flex gap-1 items-center w-20 justify-end">
						<p class="font-bold">
							{#await getAmountAvailable(m) then amount}
								{formatAmount(amount, 'sat')}
							{/await}
						</p>
					</div>
				</div>
			</li>
		{/each}
	</ul>
</button>
