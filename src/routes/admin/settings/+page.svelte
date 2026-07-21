<script lang="ts">
	import { page } from '$app/stores';
	import { CreditCard, UsersRound } from 'lucide-svelte';
	import MembershipSettings from 'src/components/admin/MembershipSettings.svelte';
	import StripeSettings from '../payments/+page.svelte';

	type SettingsSection = 'memberships' | 'payments';
	let activeSection: SettingsSection = 'memberships';
	let initializedFromUrl = false;

	$: if (!initializedFromUrl) {
		initializedFromUrl = true;
		activeSection = $page.url.searchParams.get('section') === 'payments' ? 'payments' : 'memberships';
	}
</script>

<main class="mx-auto max-w-[1180px] px-5 py-10 sm:px-6 lg:py-14">
	<div class="mb-8 flex gap-2 overflow-x-auto border-b border-stone-200" aria-label="Community settings sections">
		<button type="button" class={`inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-black ${activeSection === 'memberships' ? 'border-emerald-900 text-emerald-950' : 'border-transparent text-stone-500 hover:text-stone-800'}`} on:click={() => (activeSection = 'memberships')}><UsersRound size={18} /> Memberships</button>
		<button type="button" class={`inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-black ${activeSection === 'payments' ? 'border-emerald-900 text-emerald-950' : 'border-transparent text-stone-500 hover:text-stone-800'}`} on:click={() => (activeSection = 'payments')}><CreditCard size={18} /> Payments</button>
	</div>

	{#if activeSection === 'memberships'}
		<MembershipSettings onOpenPayments={() => (activeSection = 'payments')} />
	{:else}
		<div class="-mx-5 -mt-10 sm:-mx-6 lg:-mt-14"><StripeSettings /></div>
	{/if}
</main>
