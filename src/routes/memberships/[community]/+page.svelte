<script lang="ts">
	import { page } from '$app/stores';
	import { type ParsedEvent, type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isEoce, isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		ArrowRight,
		BadgeCheck,
		Check,
		CircleAlert,
		ExternalLink,
		LoaderCircle,
		LockKeyhole,
		ShieldCheck,
		Sparkles
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key } from 'src/controller';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { parseMembershipDefinition, type MembershipDefinition } from 'src/lib/memberships';
	import { paymentServiceUrl } from 'src/lib/paymentService';
	import { onDestroy, onMount } from 'svelte';

	let memberships: MembershipDefinition[] = [];
	let loading = true;
	let relayName = '';
	let relayDescription = '';
	let relayImage = '';
	let checkoutAddress = '';
	let checkoutError = '';
	let subscription: (() => void) | undefined;
	let loadTimer: ReturnType<typeof setTimeout> | undefined;

	$: community = decodeCommunity($page.params.community || '');
	$: relayUrl = community ? normalizeURL(`wss://${community}`) : '';
	$: relayHttpUrl = relayUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
	$: embedded = $page.url.searchParams.get('embed') === '1';
	$: communityName = relayName || nameFromHostname(community);
	$: communityInitials =
		communityName
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'N';

	function decodeCommunity(value: string) {
		try {
			const decoded = decodeURIComponent(value).trim().replace(/\/$/, '');
			return decoded.replace(/^wss?:\/\//, '').split('/')[0];
		} catch {
			return '';
		}
	}

	function nameFromHostname(hostname: string) {
		const firstLabel = hostname.split('.')[0] || 'Community';
		return firstLabel
			.split(/[-_]+/)
			.filter(Boolean)
			.map((part) => part[0]?.toUpperCase() + part.slice(1))
			.join(' ');
	}

	function formatPrice(membership: MembershipDefinition) {
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: membership.currency,
				maximumFractionDigits: Number(membership.price) % 1 === 0 ? 0 : 2
			}).format(Number(membership.price));
		} catch {
			return `${membership.price} ${membership.currency}`;
		}
	}

	function billingLabel(value: MembershipDefinition['billing']) {
		if (value === 'monthly') return 'month';
		if (value === 'yearly') return 'year';
		return 'once';
	}

	function membershipGradient(name: string) {
		let hash = 0;
		for (let index = 0; index < name.length; index += 1) {
			hash = name.charCodeAt(index) + ((hash << 5) - hash);
		}
		const firstHue = Math.abs(hash) % 360;
		const secondHue = (firstHue + 55 + (Math.abs(hash) % 70)) % 360;
		return `linear-gradient(135deg, hsl(${firstHue} 72% 72%), hsl(${secondHue} 78% 88%))`;
	}

	function upsertMembership(event: ParsedEvent) {
		const membership = parseMembershipDefinition(event);
		if (!membership) return;
		if (Number(membership.price) <= 0) return;
		const index = memberships.findIndex((item) => item.address === membership.address);
		if (index !== -1) {
			if (membership.createdAt <= memberships[index].createdAt) return;
			memberships = memberships.map((item, itemIndex) => (itemIndex === index ? membership : item));
		} else {
			memberships = [...memberships, membership].sort((a, b) => Number(a.price) - Number(b.price));
		}
		loading = false;
	}

	function subscribeMemberships() {
		if (!relayUrl) {
			loading = false;
			return;
		}
		const requests: RequestObject[] = [
			{
				kinds: [30009],
				tags: { '#t': ['membership'] },
				limit: 20,
				relays: [relayUrl],
				cacheFirst: true
			}
		];
		subscription = useSubscription(
			`membership_store_classified_v1_${community}`,
			requests,
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (!event) {
					const status = isConnectionStatus(message);
					const eose = isEoce(message);
					console.info('[membership-subscription:storefront] worker message', {
						relay: status?.relayUrl()?.toString() || message.url()?.toString(),
						status: status?.status()?.toString(),
						statusMessage: status?.message()?.toString(),
						eose: Boolean(eose),
						subscriptionId: eose?.subscriptionId()?.toString(),
						messageType: message.type(),
						contentType: message.contentType()
					});
					return;
				}
				console.info('[membership-subscription:storefront] parsed event', {
					relay: message.url()?.toString(),
					id: event.id()?.toString(),
					kind: event.kind(),
					pubkey: event.pubkey()?.toString(),
					createdAt: Number(event.createdAt()),
					acceptedAsMembership: Boolean(parseMembershipDefinition(event))
				});
				upsertMembership(event);
			},
			{ bytesPerEvent: 10 * 1024 }
		);
		loadTimer = setTimeout(() => (loading = false), 2200);
	}

	async function fetchRelayInfo() {
		if (!relayHttpUrl) return;
		try {
			const response = await fetch(relayHttpUrl, {
				headers: { accept: 'application/nostr+json' }
			});
			if (!response.ok) return;
			const info = await response.json();
			relayName = typeof info.name === 'string' ? info.name.trim() : '';
			relayDescription = typeof info.description === 'string' ? info.description.trim() : '';
			for (const field of ['picture', 'image', 'icon', 'logo']) {
				if (typeof info[field] === 'string' && info[field].trim()) {
					relayImage = info[field].trim();
					break;
				}
			}
		} catch {
			// The storefront still works when a relay does not publish NIP-11 metadata.
		}
	}

	function openLogin() {
		const loginUrl = new URL('/explore/login', window.location.origin).toString();
		if (embedded) window.open(loginUrl, '_blank', 'noopener,noreferrer');
		else window.location.assign(loginUrl);
	}

	function openDestination(url: string) {
		if (embedded) window.open(url, '_blank', 'noopener,noreferrer');
		else window.location.assign(url);
	}

	async function startCheckout(membership: MembershipDefinition) {
		if (!$key?.pub || $key?.hasSigner === false) {
			openLogin();
			return;
		}
		checkoutAddress = membership.address;
		checkoutError = '';
		const checkoutWindow = embedded ? window.open('', '_blank') : null;
		try {
			const body = JSON.stringify({ community: relayUrl, eventAddress: membership.address });
			const url = paymentServiceUrl('/stripe/checkout');
			const authorization = await makeInviteAuthorization(url, body);
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization },
				body
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || result.error || 'Checkout unavailable');
			if (checkoutWindow) checkoutWindow.location.assign(result.url);
			else window.location.assign(result.url);
		} catch (error) {
			checkoutWindow?.close();
			checkoutError = error instanceof Error ? error.message : 'Checkout unavailable';
			checkoutAddress = '';
		}
	}

	onMount(() => {
		void fetchRelayInfo();
		subscribeMemberships();
	});

	onDestroy(() => {
		subscription?.();
		if (loadTimer) clearTimeout(loadTimer);
	});
</script>

<svelte:head>
	<title>{communityName} memberships · Nuts</title>
	<meta name="description" content={`Join ${communityName} and receive your membership badge.`} />
</svelte:head>

<main class:embedded class="min-h-screen bg-[#f5f1e8] text-[#10251f]">
	<div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
		<div
			class="absolute -right-32 -top-44 h-[30rem] w-[30rem] rounded-full bg-[#ffcd57]/25 blur-3xl"
		></div>
		<div
			class="absolute -bottom-40 -left-28 h-[28rem] w-[28rem] rounded-full bg-[#78b9a5]/20 blur-3xl"
		></div>
	</div>

	<div
		class={`relative mx-auto w-full ${embedded ? 'max-w-5xl px-4 py-5 sm:px-6' : 'max-w-6xl px-5 py-8 sm:px-8 sm:py-12'}`}
	>
		<header class="flex items-center justify-between gap-4">
			<button
				type="button"
				on:click={() => openDestination(relayHttpUrl || '/')}
				class="flex min-w-0 items-center gap-3 text-left"
			>
				{#if relayImage}
					<img
						src={relayImage}
						alt=""
						class="h-11 w-11 rounded-xl border border-white/80 object-cover shadow-sm"
					/>
				{:else}
					<span
						class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0a493d] text-sm font-black text-white shadow-sm"
						>{communityInitials}</span
					>
				{/if}
				<span class="truncate text-sm font-black sm:text-base">{communityName}</span>
			</button>
			<button
				type="button"
				on:click={() => openDestination('/explore')}
				class="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#10251f]/10 bg-white/70 px-4 py-2 text-xs font-black shadow-sm backdrop-blur transition hover:bg-white"
			>
				Powered by Nuts <ExternalLink size={13} />
			</button>
		</header>

		<section class={`text-center ${embedded ? 'pb-8 pt-10' : 'pb-12 pt-16 sm:pb-16 sm:pt-24'}`}>
			<span
				class="mx-auto inline-flex items-center gap-2 rounded-full bg-[#ffdf8b] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#624914]"
				><Sparkles size={14} /> Memberships</span
			>
			<h1
				class={`mx-auto mt-5 max-w-3xl font-black tracking-[-0.04em] ${embedded ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-7xl'}`}
			>
				Belong to something<br /><span class="text-[#08705c]">worth supporting.</span>
			</h1>
			<p class="mx-auto mt-5 max-w-2xl text-base font-semibold leading-7 text-[#496059] sm:text-lg">
				{relayDescription ||
					`Choose a ${communityName} membership. Your badge is issued automatically after checkout.`}
			</p>
		</section>

		{#if checkoutError}
			<p
				class="mx-auto mb-5 flex max-w-2xl items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"
			>
				<CircleAlert size={18} />
				{checkoutError}
			</p>
		{/if}

		{#if loading}
			<div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
				{#each [1, 2, 3] as item (item)}
					<div class="h-80 animate-pulse rounded-[1.75rem] border border-white bg-white/55"></div>
				{/each}
			</div>
		{:else if memberships.length === 0}
			<div
				class="mx-auto max-w-2xl rounded-[1.75rem] border border-[#10251f]/10 bg-white/75 px-6 py-14 text-center shadow-[0_20px_60px_rgba(21,50,40,0.08)] backdrop-blur"
			>
				<span
					class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#dcece6] text-[#08705c]"
					><BadgeCheck size={26} /></span
				>
				<h2 class="mt-5 text-2xl font-black">Memberships are coming soon</h2>
				<p class="mt-2 font-semibold text-[#60726c]">
					This community has not published a paid membership yet.
				</p>
			</div>
		{:else}
			<div
				class={`mx-auto grid max-w-5xl gap-5 ${memberships.length === 1 ? 'md:max-w-md' : 'md:grid-cols-2'} ${memberships.length > 2 ? 'lg:grid-cols-3' : ''}`}
			>
				{#each memberships as membership, index (membership.address)}
					<article
						class={`group relative flex min-h-[22rem] flex-col overflow-hidden rounded-[1.75rem] border bg-white p-6 shadow-[0_18px_55px_rgba(21,50,40,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(21,50,40,0.14)] sm:p-7 ${index === 1 && memberships.length > 2 ? 'border-[#0a6b58]/40' : 'border-[#10251f]/10'}`}
					>
						{#if index === 1 && memberships.length > 2}<span
								class="absolute right-5 top-5 rounded-full bg-[#ffdc7b] px-3 py-1 text-[10px] font-black uppercase tracking-widest"
								>Popular</span
							>{/if}
						<div
							class="-mx-6 -mt-6 mb-6 h-40 overflow-hidden sm:-mx-7 sm:-mt-7"
							style:background={membership.image ? undefined : membershipGradient(membership.name)}
						>
							{#if membership.image}<img
									src={membership.image}
									alt={`${membership.name} membership`}
									class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
								/>{:else}<div
									class="flex h-full items-end bg-gradient-to-t from-black/20 to-transparent p-6"
								>
									<span
										class="rounded-full border border-white/50 bg-white/25 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm backdrop-blur"
										>{membership.name}</span
									>
								</div>{/if}
						</div>
						<span class="grid h-12 w-12 place-items-center rounded-2xl bg-[#e0eee9] text-[#08705c]"
							><BadgeCheck size={23} /></span
						>
						<h2 class="mt-6 text-2xl font-black tracking-tight">{membership.name}</h2>
						<p class="mt-3 min-h-12 text-sm font-semibold leading-6 text-[#60726c]">
							{membership.description}
						</p>
						<div class="mt-6 flex items-end gap-2 border-t border-[#10251f]/8 pt-6">
							<span class="text-4xl font-black tracking-[-0.04em]">{formatPrice(membership)}</span>
							<span class="pb-1 text-sm font-bold text-[#71817c]"
								>/ {billingLabel(membership.billing)}</span
							>
						</div>
						<ul class="mt-6 space-y-3 text-sm font-bold text-[#354d45]">
							<li class="flex items-center gap-3">
								<Check size={17} class="text-[#08705c]" /> Community membership badge
							</li>
							<li class="flex items-center gap-3">
								<Check size={17} class="text-[#08705c]" /> Automatic access after payment
							</li>
						</ul>
						<button
							type="button"
							class="mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b493d] px-5 text-sm font-black text-white transition hover:bg-[#08705c] disabled:cursor-wait disabled:opacity-70"
							disabled={Boolean(checkoutAddress)}
							on:click={() => startCheckout(membership)}
						>
							{#if checkoutAddress === membership.address}<LoaderCircle
									size={18}
									class="animate-spin"
								/> Opening checkout…{:else if !$key?.pub}<LockKeyhole size={17} /> Sign in to join{:else}Choose
								membership <ArrowRight size={17} />{/if}
						</button>
					</article>
				{/each}
			</div>
		{/if}

		<footer
			class={`flex flex-col items-center justify-center gap-3 text-center text-xs font-bold text-[#697a74] sm:flex-row ${embedded ? 'mt-8' : 'mt-14'}`}
		>
			<span class="inline-flex items-center gap-2"
				><ShieldCheck size={16} /> Secure payment by Stripe</span
			>
			<span class="hidden sm:inline">·</span>
			<span>Your membership badge is delivered by the community.</span>
		</footer>
	</div>
</main>

<style>
	:global(html:has(main.embedded)),
	:global(body:has(main.embedded)) {
		background: #f5f1e8;
	}
</style>
