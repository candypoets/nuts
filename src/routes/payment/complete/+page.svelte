<script lang="ts">
	import { CheckCircle2, Clock3 } from 'lucide-svelte';
	import { resolve } from 'src/lib/paths';
	export let data: { status: string; customerEmail: string; community: string };
</script>

<svelte:head><title>Payment status · Nuts</title></svelte:head>

<main class="grid min-h-screen place-items-center bg-stone-50 px-5 py-12 text-stone-950">
	<section class="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-xl shadow-stone-950/5 sm:p-12">
		{#if data.status === 'paid'}
			<span class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={34} /></span>
			<h1 class="mt-6 text-3xl font-black">Payment confirmed</h1>
			<p class="mt-3 font-semibold leading-7 text-stone-500">Your entrance purchase is recorded. Badge delivery will be activated when the community payment webhook is connected.</p>
		{:else}
			<span class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-700"><Clock3 size={34} /></span>
			<h1 class="mt-6 text-3xl font-black">Payment processing</h1>
			<p class="mt-3 font-semibold leading-7 text-stone-500">Stripe has not marked this payment as complete yet. Some payment methods take longer to confirm.</p>
		{/if}
		<a href={resolve('/explore')} class="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-[#073c32] px-6 text-sm font-black text-white no-underline">Return to Nuts</a>
	</section>
</main>
