<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getContext } from 'svelte';
	import type { Readable } from 'svelte/store';
	import type { RelayInfo } from 'src/lib/adminRelays';

	type AdminRelayDiscovery = {
		adminRelays: Readable<RelayInfo[]>;
		adminRelaysLoading: Readable<boolean>;
	};

	const discovery = getContext<AdminRelayDiscovery>('adminRelayDiscovery');
	const adminRelays = discovery.adminRelays;
	const adminRelaysLoading = discovery.adminRelaysLoading;

	let redirected = false;

	$: firstRelay = $adminRelays[0];
	$: if (!redirected && !$adminRelaysLoading && firstRelay?.url) {
		redirected = true;
		goto(resolve(`/admin/${encodeURIComponent(firstRelay.url)}`));
	}
</script>

<svelte:head>
	<title>Admin - Nuts</title>
</svelte:head>

<main class="px-5 py-7 sm:px-8 lg:px-10">
	<div class="mx-auto max-w-[1880px]">
		{#if $adminRelaysLoading}
			<section class="rounded-2xl border border-black/10 bg-white/80 p-8 shadow-sm">
				<p class="text-lg font-bold text-stone-600">Loading admin communities...</p>
			</section>
		{:else if $adminRelays.length === 0}
			<section class="rounded-2xl border border-black/10 bg-white/80 p-8 shadow-sm">
				<h1 class="text-3xl font-black tracking-normal text-[#171614]">
					No admin communities found.
				</h1>
				<p class="mt-3 max-w-2xl text-lg font-semibold text-stone-600">
					Create a community first, or check that your account is listed as an admin.
				</p>
				<a
					href={resolve('/create')}
					class="mt-6 inline-flex h-12 items-center rounded-xl bg-emerald-800 px-5 text-sm font-bold text-white no-underline shadow-sm"
				>
					Create community
				</a>
			</section>
		{:else}
			<section class="rounded-2xl border border-black/10 bg-white/80 p-8 shadow-sm">
				<p class="text-lg font-bold text-stone-600">
					Opening {firstRelay.name || firstRelay.url}...
				</p>
			</section>
		{/if}
	</div>
</main>
