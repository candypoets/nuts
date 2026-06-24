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

<main class="px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-[1200px]">
		{#if $adminRelaysLoading}
			<section
				class="rounded-2xl border border-stone-200 bg-white/85 p-8 shadow-sm shadow-stone-950/5"
			>
				<div class="flex items-center gap-4">
					<div class="h-12 w-12 animate-pulse rounded-xl bg-emerald-950/15"></div>
					<div class="grid flex-1 gap-3">
						<div class="h-4 w-56 animate-pulse rounded bg-stone-200"></div>
						<div class="h-3 w-80 max-w-full animate-pulse rounded bg-stone-100"></div>
					</div>
				</div>
			</section>
		{:else if $adminRelays.length === 0}
			<section
				class="overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm shadow-stone-950/5"
			>
				<div class="grid gap-8 p-8 md:grid-cols-[minmax(0,1fr)_280px] md:items-center">
					<div>
						<p class="text-sm font-black text-emerald-900">Admin access</p>
						<h1 class="mt-3 text-3xl font-black text-[#171614]">No admin communities found</h1>
						<p class="mt-3 max-w-2xl text-lg font-medium leading-8 text-stone-600">
							Create a community first, or check that your account is listed as an admin.
						</p>
						<a
							href={resolve('/create')}
							class="mt-6 inline-flex h-11 items-center rounded-xl bg-emerald-950 px-5 text-sm font-black text-white no-underline shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
						>
							Create community
						</a>
					</div>
					<div class="rounded-2xl bg-stone-50 p-5">
						<div class="grid gap-3">
							<div class="h-3 w-24 rounded bg-stone-200"></div>
							<div class="h-12 rounded-xl bg-white"></div>
							<div class="h-12 rounded-xl bg-white"></div>
							<div class="h-12 rounded-xl bg-emerald-950/10"></div>
						</div>
					</div>
				</div>
			</section>
		{:else}
			<section
				class="rounded-2xl border border-stone-200 bg-white/85 p-8 shadow-sm shadow-stone-950/5"
			>
				<p class="text-lg font-bold text-stone-600">
					Opening {firstRelay.name || firstRelay.url}...
				</p>
			</section>
		{/if}
	</div>
</main>
