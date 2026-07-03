<script lang="ts">
	import { getContext } from 'svelte';
	import type { Readable } from 'svelte/store';
	import { selectAdminRelayUrl, selectedAdminRelayUrl } from 'src/controller';
	import type { RelayInfo } from 'src/lib/adminRelays';
	import DashboardPage from './[community_id]/+page.svelte';

	type AdminRelayDiscovery = {
		adminRelays: Readable<RelayInfo[]>;
		adminRelaysLoading: Readable<boolean>;
	};

	const discovery = getContext<AdminRelayDiscovery>('adminRelayDiscovery');
	const adminRelays = discovery.adminRelays;
	const adminRelaysLoading = discovery.adminRelaysLoading;

	$: preferredRelay =
		$adminRelays.find((relay) => relay.url === $selectedAdminRelayUrl) || $adminRelays[0];
	$: if (
		!$adminRelaysLoading &&
		preferredRelay?.url &&
		preferredRelay.url !== $selectedAdminRelayUrl
	) {
		selectAdminRelayUrl(preferredRelay.url);
	}
</script>

<svelte:head>
	<title>Admin - Nuts</title>
</svelte:head>

{#if $adminRelaysLoading && !$selectedAdminRelayUrl}
	<main class="px-4 py-8 sm:px-6 lg:px-8">
		<div class="mx-auto max-w-[1200px]">
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
		</div>
	</main>
{:else if !$adminRelaysLoading && !$adminRelays.length && !$selectedAdminRelayUrl}
	<main class="px-4 py-8 sm:px-6 lg:px-8">
		<div class="mx-auto max-w-[1200px]">
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
		</div>
	</main>
{:else}
	<DashboardPage />
{/if}
