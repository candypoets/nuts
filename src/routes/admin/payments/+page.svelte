<script lang="ts">
	import { onMount } from 'svelte';
	import { key, selectedAdminRelayUrl } from 'src/controller';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { ArrowUpRight, Check, CircleAlert, CreditCard, Landmark, RefreshCw } from 'lucide-svelte';

	type StripeStatus = {
		connected: boolean;
		configured: boolean;
		accountId?: string;
		detailsSubmitted?: boolean;
		chargesEnabled?: boolean;
		payoutsEnabled?: boolean;
		country?: string;
		currency?: string;
		requirementsDue?: number;
		error?: string;
	};

	let status: StripeStatus | undefined;
	let loading = true;
	let action = '';
	let errorMessage = '';
	let lastCommunity = '';
	let onboardingWindow: Window | null = null;
	let popupTimer: number | undefined;
	let merchantCountry = 'LU';

	const merchantCountries = [
		['AT', 'Austria'],
		['AU', 'Australia'],
		['BE', 'Belgium'],
		['BR', 'Brazil'],
		['CA', 'Canada'],
		['CH', 'Switzerland'],
		['CZ', 'Czechia'],
		['DE', 'Germany'],
		['DK', 'Denmark'],
		['EE', 'Estonia'],
		['ES', 'Spain'],
		['FI', 'Finland'],
		['FR', 'France'],
		['GB', 'United Kingdom'],
		['GR', 'Greece'],
		['HK', 'Hong Kong'],
		['HR', 'Croatia'],
		['HU', 'Hungary'],
		['IE', 'Ireland'],
		['IT', 'Italy'],
		['JP', 'Japan'],
		['LT', 'Lithuania'],
		['LU', 'Luxembourg'],
		['LV', 'Latvia'],
		['MT', 'Malta'],
		['NL', 'Netherlands'],
		['NO', 'Norway'],
		['NZ', 'New Zealand'],
		['PL', 'Poland'],
		['PT', 'Portugal'],
		['RO', 'Romania'],
		['SE', 'Sweden'],
		['SG', 'Singapore'],
		['SI', 'Slovenia'],
		['SK', 'Slovakia'],
		['US', 'United States']
	] as const;

	$: community = $selectedAdminRelayUrl;
	$: if (community && community !== lastCommunity) {
		lastCommunity = community;
		loadStatus();
	}
	$: ready = Boolean(status?.chargesEnabled && status?.payoutsEnabled);

	async function stripeRequest(requestedAction: 'status' | 'onboard' | 'dashboard') {
		const body = JSON.stringify({
			action: requestedAction,
			community,
			...(requestedAction === 'onboard' ? { country: merchantCountry } : {})
		});
		const url = new URL('/api/stripe/connect', window.location.origin).toString();
		const authorization = await makeInviteAuthorization(url, body, $key?.pub);
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization },
			body
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.message || result.error || 'Stripe request failed');
		return result;
	}

	async function loadStatus() {
		if (!community) return;
		loading = true;
		errorMessage = '';
		try {
			status = await stripeRequest('status');
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Could not load Stripe status';
		} finally {
			loading = false;
		}
	}

	async function openStripe(requestedAction: 'onboard' | 'dashboard') {
		action = requestedAction;
		errorMessage = '';
		onboardingWindow = window.open('', 'nuts-stripe-connect', 'popup=yes,width=760,height=860');
		if (!onboardingWindow) {
			errorMessage = 'Allow popups to continue with Stripe.';
			action = '';
			return;
		}
		onboardingWindow.document.title = 'Opening Stripe…';
		try {
			const result = await stripeRequest(requestedAction);
			if (result.url) onboardingWindow.location.assign(result.url);
			window.clearInterval(popupTimer);
			popupTimer = window.setInterval(() => {
				if (!onboardingWindow?.closed) return;
				window.clearInterval(popupTimer);
				action = '';
				loadStatus();
			}, 500);
		} catch (error) {
			onboardingWindow.close();
			errorMessage = error instanceof Error ? error.message : 'Could not open Stripe';
			action = '';
		}
	}

	function handleStripeMessage(event: MessageEvent) {
		if (event.origin !== window.location.origin) return;
		if (event.data?.type !== 'nuts:stripe-connect-return') return;
		action = '';
		if (event.data.result === 'complete') {
			loadStatus();
		} else {
			errorMessage = 'The Stripe onboarding link expired. Open it again to continue.';
		}
	}

	onMount(() => {
		if (community) loadStatus();
		window.addEventListener('message', handleStripeMessage);
		return () => {
			window.removeEventListener('message', handleStripeMessage);
			window.clearInterval(popupTimer);
		};
	});
</script>

<svelte:head><title>Settings · Community admin</title></svelte:head>

<div class="mx-auto max-w-[1180px] px-5 py-10 sm:px-6 lg:py-14">
	<div
		class="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between"
	>
		<div>
			<p class="text-sm font-black uppercase tracking-[0.16em] text-emerald-800">
				Community settings
			</p>
			<h1 class="mt-2 text-4xl font-black tracking-tight text-stone-950">Payments and payouts</h1>
			<p class="mt-3 max-w-2xl text-base font-semibold leading-7 text-stone-500">
				Connect this community to Stripe to receive membership and event payments directly.
			</p>
		</div>
		<button
			type="button"
			class="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-black text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
			on:click={loadStatus}
			disabled={loading}
		>
			<RefreshCw size={16} class={loading ? 'animate-spin' : ''} /> Refresh
		</button>
	</div>

	{#if errorMessage}
		<div
			class="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
		>
			<CircleAlert size={20} class="mt-0.5 shrink-0" />
			<span>{errorMessage}</span>
		</div>
	{/if}

	<section class="mt-8 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
		<div class="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
			<div class="flex items-start justify-between gap-5">
				<div class="flex items-start gap-4">
					<span
						class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#635bff] text-white"
					>
						<CreditCard size={23} />
					</span>
					<div>
						<h2 class="text-xl font-black text-stone-950">Stripe account</h2>
						<p class="mt-1 text-sm font-semibold text-stone-500">Card payments and bank payouts</p>
					</div>
				</div>
				{#if loading}
					<span class="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-black text-stone-500"
						>Checking</span
					>
				{:else if ready}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800"
						><Check size={14} /> Connected</span
					>
				{:else}
					<span class="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800"
						>Action needed</span
					>
				{/if}
			</div>

			<div class="my-7 h-px bg-stone-100"></div>

			{#if loading}
				<div class="space-y-3">
					<div class="h-5 w-2/3 animate-pulse rounded bg-stone-100"></div>
					<div class="h-5 w-1/2 animate-pulse rounded bg-stone-100"></div>
				</div>
			{:else if !status?.configured}
				<h3 class="text-lg font-black text-stone-950">Stripe is not configured on this instance</h3>
				<p class="mt-2 text-sm font-semibold leading-6 text-stone-500">
					Add a platform <code>STRIPE_SECRET_KEY</code> to the community container, then restart it.
				</p>
			{:else if !status.connected}
				<h3 class="text-lg font-black text-stone-950">Start accepting payments</h3>
				<p class="mt-2 max-w-xl text-sm font-semibold leading-6 text-stone-500">
					Stripe will securely collect the business, identity and payout details. Nuts never sees
					card or bank credentials.
				</p>
				<label class="mt-5 block max-w-sm">
					<span class="mb-2 block text-sm font-black text-stone-800">Merchant’s legal country</span>
					<select
						bind:value={merchantCountry}
						class="h-12 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-bold outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
					>
						{#each merchantCountries as country (country[0])}
							<option value={country[0]}>{country[1]}</option>
						{/each}
					</select>
					<span class="mt-2 block text-xs font-semibold leading-5 text-stone-400"
						>Choose where the business is legally established. Stripe uses this to determine
						verification requirements.</span
					>
				</label>
				<button
					type="button"
					class="mt-6 inline-flex h-12 items-center gap-2 rounded-lg bg-[#635bff] px-5 text-sm font-black text-white transition hover:bg-[#5149e8] disabled:opacity-50"
					on:click={() => openStripe('onboard')}
					disabled={Boolean(action)}
				>
					{action === 'onboard' ? 'Opening Stripe…' : 'Connect with Stripe'}
					<ArrowUpRight size={17} />
				</button>
			{:else}
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="rounded-xl bg-stone-50 p-4">
						<p class="text-xs font-black uppercase tracking-wide text-stone-400">Payments</p>
						<p class="mt-2 font-black text-stone-900">
							{status.chargesEnabled ? 'Enabled' : 'Pending'}
						</p>
					</div>
					<div class="rounded-xl bg-stone-50 p-4">
						<p class="text-xs font-black uppercase tracking-wide text-stone-400">Payouts</p>
						<p class="mt-2 font-black text-stone-900">
							{status.payoutsEnabled ? 'Enabled' : 'Pending'}
						</p>
					</div>
					<div class="rounded-xl bg-stone-50 p-4">
						<p class="text-xs font-black uppercase tracking-wide text-stone-400">Settlement</p>
						<p class="mt-2 font-black uppercase text-stone-900">{status.currency || '—'}</p>
					</div>
				</div>
				{#if !ready}
					<p class="mt-5 text-sm font-bold text-amber-800">
						{status.requirementsDue || 0} onboarding requirement{status.requirementsDue === 1
							? ''
							: 's'} currently due.
					</p>
				{/if}
				<div class="mt-6 flex flex-wrap gap-3">
					{#if !ready}<button
							type="button"
							class="inline-flex h-11 items-center gap-2 rounded-lg bg-[#635bff] px-4 text-sm font-black text-white disabled:opacity-50"
							on:click={() => openStripe('onboard')}
							disabled={Boolean(action)}>Continue onboarding <ArrowUpRight size={16} /></button
						>{/if}
					{#if status.detailsSubmitted}<button
							type="button"
							class="inline-flex h-11 items-center gap-2 rounded-lg border border-stone-200 px-4 text-sm font-black text-stone-700 disabled:opacity-50"
							on:click={() => openStripe('dashboard')}
							disabled={Boolean(action)}>Open Stripe dashboard <ArrowUpRight size={16} /></button
						>{/if}
				</div>
			{/if}
		</div>

		<aside class="rounded-2xl bg-[#073c32] p-6 text-white shadow-sm sm:p-8">
			<Landmark size={26} class="text-emerald-300" />
			<h2 class="mt-5 text-xl font-black">Community-owned payouts</h2>
			<p class="mt-3 text-sm font-semibold leading-6 text-emerald-50/75">
				Customer payments are created as direct charges on this community’s connected account.
				Stripe handles verification and sends funds to the merchant’s payout account.
			</p>
			<div class="my-6 h-px bg-white/15"></div>
			<p class="text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
				Automatic access
			</p>
			<p class="mt-2 text-sm font-semibold leading-6 text-emerald-50/75">
				After a successful payment, the member will automatically receive the access they purchased.
				There is nothing for you to approve manually.
			</p>
		</aside>
	</section>
</div>
