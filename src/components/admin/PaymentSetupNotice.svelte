<script lang="ts">
	import { resolve } from 'src/lib/paths';
	import { key } from 'src/controller';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { paymentServiceUrl } from 'src/lib/paymentService';
	import { CreditCard, X } from 'lucide-svelte';

	export let community: string;

	let visible = false;
	let checkedCommunity = '';

	$: if (community && community !== checkedCommunity) {
		checkedCommunity = community;
		checkConnection();
	}

	function dismissalKey() {
		return `admin/stripe-notice-dismissed/v2/${community}`;
	}

	async function checkConnection() {
		if (!community || typeof window === 'undefined') return;
		const requestedCommunity = community;
		if (sessionStorage.getItem(dismissalKey())) {
			visible = false;
			return;
		}
		visible = false;
		try {
			const body = JSON.stringify({ action: 'status', community: requestedCommunity });
			const url = paymentServiceUrl('/stripe/connect');
			const authorization = await makeInviteAuthorization(url, body, $key?.pub);
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization },
				body
			});
			const status = await response.json();
			if (community !== requestedCommunity) return;
			visible = response.ok && status.connected === false;
		} catch {
			if (community === requestedCommunity) visible = false;
		}
	}

	function dismiss() {
		sessionStorage.setItem(dismissalKey(), 'true');
		visible = false;
	}
</script>

{#if visible}
	<aside
		class="fixed bottom-5 left-5 z-40 w-[min(420px,calc(100vw-2.5rem))] rounded-2xl border border-stone-200 bg-white p-5 text-stone-950 shadow-2xl shadow-stone-950/15"
		aria-label="Payment setup required"
	>
		<button
			type="button"
			class="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
			aria-label="Dismiss payment setup notice"
			on:click={dismiss}><X size={17} /></button
		>
		<div class="flex items-start gap-4 pr-7">
			<span
				class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-[#635bff]"
				><CreditCard size={21} /></span
			>
			<div>
				<p class="font-black">Link your payment information</p>
				<p class="mt-1 text-sm font-semibold leading-5 text-stone-500">
					Connect Stripe before selling memberships or paid event entrance.
				</p>
				<a
					href={resolve('/admin/settings?section=payments')}
					class="mt-4 inline-flex h-9 items-center rounded-lg bg-[#073c32] px-4 text-sm font-black text-white no-underline transition hover:bg-[#0a4b3e]"
					>Open settings</a
				>
			</div>
		</div>
	</aside>
{/if}
