<script lang="ts">
	import Icon from '@iconify/svelte';
	import { carouselAnimator } from 'src/controller/carrousel';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';

	const nav = usePagerNavigation();

	function openRoot(eventPath: string) {
		nav ? nav.root(eventPath) : go(eventPath);
	}

	// If the user already has a wallet configured (e.g., $nutsWallet), set to true
	export let hasWallet = false;

	// Optional: show a few recommended or configured mint URLs
	export let recommendedMints: string[] = [];

	// Optional toggle for an explore link (to discover people/content)
	export let showExploreLink = true;

	function setupWallet() {
		openRoot('wallet');
	}
	function receive() {
		openRoot('receive');
	}
	function scan() {
		openRoot('scan');
	}
	function send() {
		openRoot('send');
	}
</script>

<div class="bg-base-300 bg-opacity-85 rounded-xl p-6 shadow-widget mx-1">
	<div class="flex flex-col items-center text-center">
		<div class="mb-3">
			<span
				class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-base-200 text-primary"
			>
				<Icon icon="ph:wallet-bold" class="text-3xl" />
			</span>
		</div>

		{#if hasWallet}
			<h2 class="text-2xl font-semibold mb-2">No activity yet</h2>
			<p class="text-base-content/70 max-w-prose mb-4">
				Your wallet is ready. Receive money or scan a QR code to get started.
			</p>
		{:else}
			<h2 class="text-2xl font-semibold mb-2">A simple wallet, built in</h2>
			<p class="text-base-content/70 max-w-prose mb-4">
				Send and receive money with people on Nuts. It only takes a moment to get started.
			</p>
		{/if}

		{#if hasWallet}
			<div class="w-full max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-2">
				<button class="btn btn-primary" on:click|stopPropagation={receive}>
					<Icon icon="teenyicons:add-outline" class="text-lg mr-2" />
					Receive
				</button>
				<button class="btn btn-outline" on:click|stopPropagation={scan}>
					<Icon icon="teenyicons:scan-solid" class="text-lg mr-2" />
					Scan QR
				</button>
				<button class="btn btn-ghost" on:click|stopPropagation={send}>
					<Icon icon="ph:arrow-right" class="text-lg mr-2" />
					Send
				</button>
			</div>
		{:else}
			<div class="w-full max-w-xl">
				<button class="btn btn-accent w-full" on:click|stopPropagation={setupWallet}>
					<Icon icon="ph:wallet-bold" class="text-lg mr-2" />
					Set up wallet
				</button>
				{#if showExploreLink}
					<button
						class="btn btn-ghost w-full mt-2"
						on:click|stopPropagation={() => carouselAnimator.moveLeft()}
					>
						Explore people and posts
					</button>
				{/if}
			</div>
		{/if}

		{#if recommendedMints?.length}
			<div class="divider my-6">Wallet providers</div>
			<div class="w-full max-w-xl flex flex-wrap gap-2 justify-center">
				{#each recommendedMints.slice(0, 6) as mint (mint)}
					<div class="badge badge-outline gap-2 py-3 px-4 bg-base-200 bg-opacity-70">
						<Icon icon="ph:coin-duotone" class="text-base" />
						<span class="truncate max-w-[16rem]">{mint}</span>
					</div>
				{/each}
			</div>
			{#if !hasWallet}
				<div class="mt-3">
					<button class="btn btn-sm btn-outline" on:click|stopPropagation={setupWallet}>
						<Icon icon="ph:gear-six" class="text-base mr-1" />
						Wallet settings
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>
