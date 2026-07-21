<script lang="ts">
	import { page } from '$app/stores';
	import { CheckCircle2, RotateCcw } from 'lucide-svelte';
	import { onMount } from 'svelte';

	$: result = $page.url.searchParams.get('result') === 'refresh' ? 'refresh' : 'complete';

	onMount(() => {
		window.opener?.postMessage(
			{ type: 'nuts:stripe-connect-return', result },
			window.location.origin
		);
		window.setTimeout(() => window.close(), 500);
	});
</script>

<svelte:head><title>Returning to Nuts…</title></svelte:head>

<main class="grid min-h-screen place-items-center bg-stone-50 p-6 text-center text-stone-950">
	<div class="max-w-sm">
		<span class={`mx-auto grid h-14 w-14 place-items-center rounded-full ${result === 'complete' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{#if result === 'complete'}<CheckCircle2 size={29} />{:else}<RotateCcw size={27} />{/if}</span>
		<h1 class="mt-5 text-2xl font-black">{result === 'complete' ? 'Returning to Nuts' : 'Onboarding link expired'}</h1>
		<p class="mt-2 font-semibold leading-6 text-stone-500">This window should close automatically.</p>
		<button type="button" class="mt-6 text-sm font-black text-emerald-900" on:click={() => window.close()}>Close window</button>
	</div>
</main>
