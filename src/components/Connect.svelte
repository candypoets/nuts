<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { go } from 'src/routes/modals/modal';

	// Optional props to tweak copy or layout
	export let headline = 'Nostr is for you';
	export let subtext =
		'Connect your keys to send encrypted messages, hold eCash, and zap. No accounts. No email. Just keys.';
	export let ctaLabel = 'Connect your keys';
	export let showExploreLink = true;
	export let compact = false;

	let hasSigner = false;

	onMount(() => {
		try {
			hasSigner = typeof window !== 'undefined' && !!(window as any).nostr;
		} catch {}
	});

	function connect() {
		go('login'); // your existing modal for key connect/import/create
	}
</script>

<div class="m-auto bg-base-300 bg-opacity-85 backdrop-blur-gpu rounded-xl p-6 mx-1 shadow-widget">
	<div class="flex flex-col items-center text-center">
		<div class="mb-3">
			<span
				class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-base-200 text-primary"
			>
				<Icon icon="ph:key-duotone" class="text-3xl" />
			</span>
		</div>

		<h2 class="text-2xl font-semibold mb-2">{headline}</h2>
		<p class="text-base-content/70 max-w-prose mb-4">{subtext}</p>

		<!-- {#if hasSigner}
			<div class="alert alert-info bg-info/20 border border-info/30 mb-3 text-sm">
				<Icon icon="ph:plug-duotone" class="text-lg" />
				<span>Signer detected. You can connect with your Nostr signer.</span>
			</div>
		{/if} -->

		<div class="w-full max-w-xl">
			<button class="btn btn-accent w-full" on:click|stopPropagation={connect}>
				<Icon icon="ph:link-duotone" class="text-lg mr-2" />
				{ctaLabel}
			</button>

			{#if showExploreLink}
				<a href="/explore" class="btn btn-ghost w-full mt-2">Explore without keys</a>
			{/if}
		</div>

		{#if !compact}
			<div class="flex flex-wrap justify-center gap-2 mt-6">
				<div class="badge badge-outline">End‑to‑end encrypted DMs</div>
				<div class="badge badge-outline">Own your keys</div>
				<div class="badge badge-outline">eCash ready</div>
				<div class="badge badge-outline">No accounts. No email.</div>
			</div>
		{/if}
	</div>
</div>
