<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { type ParsedEvent, type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asNip51, isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		BarChart3,
		CalendarDays,
		Check,
		ChevronDown,
		ExternalLink,
		LayoutDashboard,
		LogOut,
		Plus,
		Settings,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key } from 'src/controller';
	import {
		fetchRelayInfo,
		relaySetAddressesFromRelayFeedEvent,
		relaySetAddressesFromRelayFeed,
		relayUrlsFromRelaySet,
		type RelayInfo
	} from 'src/lib/adminRelays';
	import { DEFAULT_RELAYS, INDEXER_RELAYS } from 'src/lib/env';
	import { onDestroy, onMount, setContext } from 'svelte';
	import { writable } from 'svelte/store';

	const navItems = [
		{ label: 'Dashboard', segment: '', icon: LayoutDashboard },
		{ label: 'Members', segment: 'members', icon: UsersRound },
		{ label: 'Roles', segment: 'roles', icon: BarChart3 },
		{ label: 'Events', segment: 'events', icon: CalendarDays },
		{ label: 'Settings', segment: 'settings', icon: Settings }
	] as const;

	type AdminNavSegment = (typeof navItems)[number]['segment'];
	type AdminNavHref =
		| '/admin'
		| '/admin/members'
		| '/admin/roles'
		| '/admin/events'
		| '/admin/settings'
		| `/admin/${string}`
		| `/admin/${string}/members`
		| `/admin/${string}/roles`
		| `/admin/${string}/events`
		| `/admin/${string}/settings`;

	const adminRelaysStore = writable<RelayInfo[]>([]);
	const adminRelaysLoadingStore = writable(false);

	setContext('adminRelayDiscovery', {
		adminRelays: adminRelaysStore,
		adminRelaysLoading: adminRelaysLoadingStore
	});

	let selectedRelayUrl = '';
	let selectedRelayName = '';
	let selectedRelayDescription = '';
	let selectedCommunityId = '';
	let adminRelaySets: ParsedEvent[] = [];
	let adminRelays: RelayInfo[] = [];
	let adminRelaysLoading = false;
	let expectedRelaySetAddresses = new Set<string>();
	let unsubscribeRelayFeed: (() => void) | undefined;
	let unsubscribeRelaySets: (() => void) | undefined;
	let communityMenuOpen = false;
	let communityMenuRoot: HTMLDivElement | undefined;

	$: activeAdminSegment = adminSegmentFromPath($page.url.pathname);
	$: communityId = $page.params.community_id;
	$: if (communityId !== selectedCommunityId) {
		selectedCommunityId = communityId || '';
		loadSelectedRelay();
		fetchSelectedRelayInfo();
	}
	$: displayName = selectedRelayName || selectedRelayUrl || 'Nuts Admin';
	$: displayDescription = selectedRelayDescription || 'Community admin';
	$: accountName = $key?.npub ? $key.npub.slice(0, 12) : 'Account';
	$: accountHandle = $key?.pub ? `${$key.pub.slice(0, 8)}...${$key.pub.slice(-4)}` : '';
	$: profileHref = $key?.npub ? `/home/${$key.npub}` : '/home';
	$: initials =
		displayName
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'N';
	$: adminRelaysStore.set(adminRelays);
	$: adminRelaysLoadingStore.set(adminRelaysLoading);

	function communityPathFromCurrentUrl() {
		const segments = $page.url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
		const candidate = segments[1] || '';
		if (
			candidate &&
			candidate !== 'members' &&
			candidate !== 'roles' &&
			candidate !== 'events' &&
			candidate !== 'settings'
		) {
			return `/admin/${candidate}`;
		}
		return '';
	}

	function currentCommunityPath() {
		const pathCommunity = communityPathFromCurrentUrl();
		if (pathCommunity) return pathCommunity;
		const rawCommunityId = communityId || selectedRelayUrl;
		return rawCommunityId
			? `/admin/${encodeURIComponent(decodeURIComponent(rawCommunityId))}`
			: '/admin';
	}

	function navHref(segment: AdminNavSegment): AdminNavHref {
		const base = currentCommunityPath();
		if (!segment) return base as AdminNavHref;
		return (base === '/admin' ? `/admin/${segment}` : `${base}/${segment}`) as AdminNavHref;
	}

	function adminSegmentFromPath(pathname: string): AdminNavSegment {
		const segments = pathname.replace(/\/$/, '').split('/').filter(Boolean);
		const candidate = segments[2] || segments[1] || '';
		if (
			candidate === 'members' ||
			candidate === 'roles' ||
			candidate === 'events' ||
			candidate === 'settings'
		) {
			return candidate;
		}
		return '';
	}

	function loadSelectedRelay() {
		const rawRelayUrl = communityId ? decodeURIComponent(communityId) : '';
		selectedRelayUrl = rawRelayUrl ? normalizeURL(rawRelayUrl) : '';
		selectedRelayName = '';
		selectedRelayDescription = '';
	}

	function relayInfoUrl(url: string) {
		if (url.startsWith('wss://')) return `https://${url.slice(6)}`;
		if (url.startsWith('ws://')) return `http://${url.slice(5)}`;
		return url;
	}

	async function fetchSelectedRelayInfo() {
		if (!selectedRelayUrl) return;
		try {
			const response = await fetch(relayInfoUrl(selectedRelayUrl), {
				headers: { accept: 'application/nostr+json' }
			});
			if (!response.ok) return;
			const info = await response.json();
			selectedRelayName = typeof info.name === 'string' ? info.name : '';
			selectedRelayDescription = typeof info.description === 'string' ? info.description : '';
		} catch {
			// The route still works without community display metadata.
		}
	}

	function loadAdminRelayInfos() {
		const pubkey = $key?.pub;
		if (!pubkey) return;

		const urls = Array.from(
			new Set(
				adminRelaySets.flatMap((event) => {
					return relayUrlsFromRelaySet(event);
				})
			)
		);
		if (!urls.length) {
			adminRelaysLoading = false;
			return;
		}

		adminRelaysLoading = true;
		Promise.all(urls.map((url) => fetchRelayInfo(url, pubkey))).then((infos) => {
			adminRelays = infos.filter((info) => info.isAdmin);
			adminRelaysLoading = false;
		});
	}

	function subscribeAdminRelaySets(addresses: string[]) {
		const pubkey = $key?.pub;
		if (!pubkey) return;
		unsubscribeRelaySets?.();
		adminRelaySets = [];
		adminRelays = [];
		expectedRelaySetAddresses = new Set(
			addresses.filter((address) => address === `30002:${pubkey}:nuts-relays-admin`)
		);

		const relays = Array.from(
			new Set([...INDEXER_RELAYS, ...DEFAULT_RELAYS, 'wss://relay.nuts.cash'])
		);
		const requests: RequestObject[] = Array.from(expectedRelaySetAddresses).map((address) => {
			const [, author, d] = address.split(':');
			return {
				kinds: [30002],
				authors: [author || pubkey],
				tags: { '#d': [d] },
				limit: 1,
				relays,
				cacheFirst: false,
				noCache: true
			};
		});

		if (!requests.length) {
			adminRelaysLoading = false;
			return;
		}

		unsubscribeRelaySets = useSubscription(
			'admin_relay_sets_' + pubkey,
			requests,
			handleAdminRelaySet,
			{ bytesPerEvent: 10 * 1024 }
		);
		window.setTimeout(() => {
			if (!adminRelaySets.length) adminRelaysLoading = false;
		}, 1800);
	}

	function handleRelayFeed(message: WorkerMessage) {
		const parsedEvent = isParsedEvent(message);
		if (!parsedEvent || parsedEvent.kind() !== 10012) return;
		const list = asNip51(parsedEvent);
		const addresses = relaySetAddressesFromRelayFeedEvent(parsedEvent);
		subscribeAdminRelaySets(addresses.length ? addresses : relaySetAddressesFromRelayFeed(list));
	}

	function handleAdminRelaySet(message: WorkerMessage) {
		const parsedEvent = isParsedEvent(message);
		if (!parsedEvent || parsedEvent.kind() !== 30002) return;
		const address = `30002:${parsedEvent.pubkey()}:${asNip51(parsedEvent)?.d()}`;
		if (!expectedRelaySetAddresses.has(address)) return;
		const existingIndex = adminRelaySets.findIndex(
			(event) => `30002:${event.pubkey()}:${asNip51(event)?.d()}` === address
		);
		if (existingIndex !== -1) {
			if (parsedEvent.createdAt() <= adminRelaySets[existingIndex].createdAt()) return;
			adminRelaySets = adminRelaySets.map((event, index) =>
				index === existingIndex ? parsedEvent : event
			);
		} else {
			adminRelaySets = [...adminRelaySets, parsedEvent];
		}
		loadAdminRelayInfos();
	}

	function subscribeRelayFeed() {
		const pubkey = $key?.pub;
		if (!pubkey) return;
		unsubscribeRelayFeed?.();
		adminRelaysLoading = true;

		const relays = Array.from(
			new Set([...INDEXER_RELAYS, ...DEFAULT_RELAYS, 'wss://relay.nuts.cash'])
		);
		const requests: RequestObject[] = [
			{
				kinds: [10012],
				authors: [pubkey],
				limit: 1,
				relays,
				cacheFirst: false,
				noCache: true
			}
		];

		unsubscribeRelayFeed = useSubscription(
			'admin_relay_feed_' + pubkey,
			requests,
			handleRelayFeed,
			{ bytesPerEvent: 10 * 1024 }
		);
		window.setTimeout(() => {
			if (!adminRelaySets.length) adminRelaysLoading = false;
		}, 1800);
	}

	function switchCommunity(url: string) {
		communityMenuOpen = false;
		goto(resolve(`/admin/${encodeURIComponent(url)}`));
	}

	function openCommunitySwitcher() {
		communityMenuOpen = !communityMenuOpen;
	}

	function communityInitials(name: string) {
		return (
			name
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2)
				.map((part) => part[0]?.toUpperCase())
				.join('') || 'N'
		);
	}

	function createCommunity() {
		communityMenuOpen = false;
		goto(resolve('/create'));
	}

	function viewProfile() {
		communityMenuOpen = false;
		goto(resolve(profileHref as '/home' | `/home/${string}`));
	}

	function handleDocumentClick(event: MouseEvent) {
		if (!communityMenuOpen) return;
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (communityMenuRoot?.contains(target)) return;
		communityMenuOpen = false;
	}

	onMount(() => {
		subscribeRelayFeed();
		document.addEventListener('click', handleDocumentClick);
	});

	onDestroy(() => {
		unsubscribeRelayFeed?.();
		unsubscribeRelaySets?.();
		document.removeEventListener('click', handleDocumentClick);
	});
</script>

<div class="min-h-screen bg-[#f7f5ef] text-[#191815]">
	<header class="sticky top-0 z-30 border-b border-stone-200/80 bg-[#f7f5ef]/90 backdrop-blur-xl">
		<div
			class="mx-auto grid max-w-[1500px] grid-cols-1 items-center gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(120px,1fr)] lg:px-8"
		>
			<button
				type="button"
				class="group flex min-w-0 items-center gap-3 rounded-xl p-1 text-left transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
				aria-label="Switch community"
				on:click={openCommunitySwitcher}
			>
				<span
					class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-emerald-950 text-lg font-black text-white shadow-sm shadow-emerald-950/20"
				>
					{initials}
				</span>
				<span
					class="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-black text-stone-500"
				>
					{adminRelays.length}
				</span>
				<span class="min-w-0">
					<span class="block truncate text-lg font-black text-[#171614]">{displayName}</span>
					<span class="mt-1 flex items-center gap-2 text-sm font-semibold text-stone-500">
						<span class="h-2 w-2 rounded-full bg-emerald-600"></span>
						{selectedRelayDescription || 'private community'}
					</span>
				</span>
			</button>

			<nav
				class="flex max-w-full justify-start gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white/75 p-1 shadow-sm shadow-stone-950/5 lg:justify-center"
				aria-label="Admin navigation"
			>
				{#each navItems as item (item.segment)}
					<a
						href={resolve(navHref(item.segment))}
						class={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-black no-underline transition focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] ${
							activeAdminSegment === item.segment
								? 'bg-emerald-950 text-white shadow-sm shadow-emerald-950/20'
								: 'text-stone-600 hover:bg-stone-100 hover:text-[#171614]'
						}`}
						aria-current={activeAdminSegment === item.segment ? 'page' : undefined}
					>
						<svelte:component this={item.icon} size={18} strokeWidth={1.9} />
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="relative flex min-w-0 justify-end" bind:this={communityMenuRoot}>
				{#if adminRelaysLoading}
					<span class="text-sm font-bold text-stone-500">Loading...</span>
				{:else}
					<button
						type="button"
						class="inline-flex h-12 items-center gap-3 rounded-xl border border-stone-200 bg-white/80 px-3 text-left shadow-sm shadow-stone-950/5 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
						aria-label="Community menu"
						aria-expanded={communityMenuOpen}
						on:click={openCommunitySwitcher}
					>
						<span class="relative">
							<span
								class="grid h-9 w-9 place-items-center rounded-lg bg-stone-900 text-xs font-black text-white"
							>
								{($key?.pub || 'np').slice(0, 2).toUpperCase()}
							</span>
							<span
								class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500"
							></span>
						</span>
						<span class="hidden max-w-32 truncate text-sm font-black text-[#171614] sm:block"
							>{accountName}</span
						>
						<ChevronDown size={18} class="text-stone-900" />
					</button>
				{/if}

				{#if communityMenuOpen}
					<div
						class="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(92vw,440px)] rounded-2xl border border-stone-200 bg-white p-5 text-[#171614] shadow-2xl shadow-stone-950/15"
					>
						<div class="flex items-start gap-5">
							<span class="relative shrink-0">
								<span
									class="grid h-20 w-20 place-items-center rounded-full bg-stone-900 text-lg font-black text-white"
								>
									{($key?.pub || 'np').slice(0, 2).toUpperCase()}
								</span>
								<span
									class="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500"
								></span>
							</span>
							<div class="min-w-0 pt-1">
								<p class="truncate text-xl font-black">{accountName}</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-500">{accountHandle}</p>
								<button
									type="button"
									class="mt-4 inline-flex items-center gap-2 rounded-lg text-base font-black text-emerald-900 no-underline focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
									on:click={viewProfile}
								>
									View profile
									<ExternalLink size={18} />
								</button>
							</div>
						</div>

						<div class="my-6 h-px bg-stone-200"></div>

						<p class="px-1 text-sm font-black text-stone-500">Current community</p>
						<div class="mt-3 rounded-xl bg-stone-50 p-3">
							<div class="flex items-center gap-4">
								<span
									class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-emerald-900 text-base font-black text-white"
								>
									{initials}
								</span>
								<span class="min-w-0 flex-1 truncate text-lg font-black">{displayName}</span>
								<Check size={22} class="shrink-0 text-emerald-800" />
							</div>
						</div>

						{#if adminRelays.length > 1}
							<p class="mt-6 px-1 text-sm font-black text-stone-500">Switch community</p>
							<div class="mt-3 space-y-2">
								{#each adminRelays.filter((relay) => relay.url !== selectedRelayUrl) as relay (relay.url)}
									<button
										type="button"
										class="flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-left transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.99]"
										on:click={() => switchCommunity(relay.url)}
									>
										<span
											class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-emerald-900 text-base font-black text-white"
										>
											{communityInitials(relay.name || relay.url)}
										</span>
										<span class="min-w-0 truncate text-lg font-black"
											>{relay.name || relay.url}</span
										>
									</button>
								{/each}
							</div>
						{/if}

						<button
							type="button"
							class="mt-4 flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-left text-emerald-900 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.99]"
							on:click={createCommunity}
						>
							<Plus size={24} />
							<span class="text-lg font-black">Create community</span>
						</button>

						<div class="my-6 h-px bg-stone-200"></div>

						<button
							type="button"
							class="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-lg font-black text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600/25 active:scale-[0.99]"
						>
							<LogOut size={24} strokeWidth={1.8} />
							Sign out
						</button>
					</div>
				{/if}
			</div>
		</div>
	</header>

	<slot />
</div>
