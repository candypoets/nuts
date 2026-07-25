<script lang="ts">
	import { page } from '$app/stores';
	import { Building2, CreditCard } from 'lucide-svelte';
	import CommunityProfileSettings from 'src/components/admin/CommunityProfileSettings.svelte';
	import StripeSettings from '../payments/+page.svelte';

	type SettingsSection = 'community' | 'payments';
	let activeSection: SettingsSection = 'community';
	let initializedFromUrl = false;

	$: if (!initializedFromUrl) {
		initializedFromUrl = true;
		const section = $page.url.searchParams.get('section');
		activeSection = section === 'payments' ? 'payments' : 'community';
	}
</script>

<main class="mx-auto max-w-[1180px] px-5 py-10 sm:px-6 lg:py-14">
	<div
		class="mb-8 flex gap-2 overflow-x-auto border-b border-stone-200"
		aria-label="Community settings sections"
	>
		<button
			type="button"
			class={`inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-black ${activeSection === 'community' ? 'border-emerald-900 text-emerald-950' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
			on:click={() => (activeSection = 'community')}><Building2 size={18} /> Community</button
		>
		<button
			type="button"
			class={`inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-black ${activeSection === 'payments' ? 'border-emerald-900 text-emerald-950' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
			on:click={() => (activeSection = 'payments')}><CreditCard size={18} /> Payments</button
		>
	</div>

	{#if activeSection === 'community'}
		<CommunityProfileSettings />
	{:else}
		<div class="-mx-5 -mt-10 sm:-mx-6 lg:-mt-14"><StripeSettings /></div>
	{/if}
</main>
