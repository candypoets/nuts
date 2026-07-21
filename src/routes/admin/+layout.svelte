<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from 'src/lib/paths';
	import { page } from '$app/stores';
	import { type ParsedEvent, type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asNip51, isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		CalendarDays,
		Check,
		ChevronDown,
		ExternalLink,
		LayoutDashboard,
		LogOut,
		Plus,
		Settings,
		Ticket,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key, selectAdminRelayUrl, selectedAdminRelayUrl } from 'src/controller';
	import {
		fetchRelayInfo,
		relaySetAddressesFromRelayFeedEvent,
		relaySetAddressesFromRelayFeed,
		relayUrlsFromRelaySet,
		type RelayInfo
	} from 'src/lib/adminRelays';
	import { DEFAULT_RELAYS, INDEXER_RELAYS } from 'src/lib/env';
	import { fetchCommunityAccess, type AdminPermission, type CommunityAccess } from 'src/lib/adminAccess';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import PaymentSetupNotice from 'src/components/admin/PaymentSetupNotice.svelte';
	import Pager from 'src/components/Pager.svelte';
	import { onDestroy, onMount, setContext } from 'svelte';
	import { writable } from 'svelte/store';

	const navItems = [
		{ label: 'Dashboard', segment: '', icon: LayoutDashboard, permissions: [] },
		{ label: 'People', segment: 'members', icon: UsersRound, permissions: ['moderation', 'settings'] },
		{ label: 'Events', segment: 'events', icon: CalendarDays, permissions: ['events'] },
		{ label: 'Invites', segment: 'invites', icon: Ticket, permissions: ['invites'] }
	] as const;

	type AdminNavSegment = (typeof navItems)[number]['segment'] | 'settings';
	type AdminNavHref =
		| '/admin'
		| '/admin/members'
		| '/admin/events'
		| '/admin/settings'
		| '/admin/invites';

	const adminRelaysStore = writable<RelayInfo[]>([]);
	const adminRelaysLoadingStore = writable(false);

	setContext('adminRelayDiscovery', {
		adminRelays: adminRelaysStore,
		adminRelaysLoading: adminRelaysLoadingStore
	});

	let selectedRelayUrl = '';
	let selectedRelayName = '';
	let selectedRelayDescription = '';
	let adminRelaySets: ParsedEvent[] = [];
	let adminRelays: RelayInfo[] = [];
	let adminRelaysLoading = false;
	let expectedRelaySetAddresses = new Set<string>();
	let relaySetAddressKey = '';
	let unsubscribeRelayFeed: (() => void) | undefined;
	let unsubscribeRelaySets: (() => void) | undefined;
	let communityMenuOpen = false;
	let communityMenuRoot: HTMLDivElement | undefined;
	let redirectedCommunityId = '';
	let communityAccess: CommunityAccess = { isOwner: false, permissions: new Set(), roles: [] };
	let accessLoading = false;

	$: activeAdminSegment = adminSegmentFromPath($page.url.pathname);
	$: communityId = $page.params.community_id;
	$: redirectCommunityUrl(communityId, activeAdminSegment);
	$: if ($selectedAdminRelayUrl !== selectedRelayUrl) {
		selectedRelayUrl = $selectedAdminRelayUrl;
		selectedRelayName = '';
		selectedRelayDescription = '';
		communityAccess = { isOwner: false, permissions: new Set(), roles: [] };
		accessLoading = Boolean(selectedRelayUrl);
		fetchSelectedRelayInfo();
	}
	$: displayName = selectedRelayName || selectedRelayUrl;
	$: displayDescription = selectedRelayDescription || 'Community admin';
	$: visibleNavItems = navItems.filter((item) =>
		!item.permissions.length || item.permissions.some((permission) => communityAccess.permissions.has(permission as AdminPermission))
	);
	$: if (selectedRelayUrl && !accessLoading && !canOpenSegment(activeAdminSegment)) {
		goto(resolve('/admin'));
	}
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

	function navHref(segment: AdminNavSegment): AdminNavHref {
		return (segment ? `/admin/${segment}` : '/admin') as AdminNavHref;
	}

	function canOpenSegment(segment: AdminNavSegment) {
		if (!segment) return true;
		if (segment === 'events') return communityAccess.permissions.has('events');
		if (segment === 'invites') return communityAccess.permissions.has('invites');
		if (segment === 'settings') return communityAccess.permissions.has('settings');
		return communityAccess.permissions.has('moderation') || communityAccess.permissions.has('settings');
	}

	function adminSegmentFromPath(pathname: string): AdminNavSegment {
		const segments = pathname.replace(/\/$/, '').split('/').filter(Boolean);
		const candidate = segments[2] || segments[1] || '';
		if (candidate === 'roles') return 'members';
		if (candidate === 'settings') return 'settings';
		if (candidate === 'members' || candidate === 'events' || candidate === 'invites') {
			return candidate;
		}
		return '';
	}

	function redirectCommunityUrl(currentCommunityId: string | undefined, segment: AdminNavSegment) {
		if (!currentCommunityId) return;
		if (currentCommunityId === redirectedCommunityId) return;
		redirectedCommunityId = currentCommunityId;
		selectAdminRelayUrl(decodeURIComponent(currentCommunityId));
		goto(resolve(navHref(segment)));
	}

	function relayInfoUrl(url: string) {
		if (url.startsWith('wss://')) return `https://${url.slice(6)}`;
		if (url.startsWith('ws://')) return `http://${url.slice(5)}`;
		return url;
	}

	async function fetchSelectedRelayInfo() {
		if (!selectedRelayUrl) {
			accessLoading = false;
			return;
		}
		try {
			const response = await fetch(relayInfoUrl(selectedRelayUrl), {
				headers: { accept: 'application/nostr+json' }
			});
			if (!response.ok) {
				communityAccess = await fetchCommunityAccess(selectedRelayUrl, $key?.pub || '', false);
				accessLoading = false;
				return;
			}
			const info = await response.json();
			selectedRelayName = typeof info.name === 'string' ? info.name : '';
			selectedRelayDescription = typeof info.description === 'string' ? info.description : '';
			accessLoading = true;
			communityAccess = await fetchCommunityAccess(
				selectedRelayUrl,
				$key?.pub || '',
				(typeof info.pubkey === 'string' && info.pubkey === $key?.pub) ||
					JSON.stringify(info.admin_pubkeys || info.admins || info.admin_pubkey || '').includes(
						$key?.pub || '__missing__'
					)
			);
			accessLoading = false;
		} catch {
			// The route still works without community display metadata.
			communityAccess = await fetchCommunityAccess(selectedRelayUrl, $key?.pub || '', false).catch(
				() => ({ isOwner: false, permissions: new Set<AdminPermission>(), roles: [] })
			);
			accessLoading = false;
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
		Promise.all(urls.map((url) => fetchRelayInfo(url, pubkey))).then(async (infos) => {
			const accessible = await Promise.all(infos.map(async (info) => ({
				info,
				access: await fetchCommunityAccess(info.url, pubkey, info.isAdmin)
			})));
			adminRelays = accessible
				.filter(({ access }) => access.isOwner || access.permissions.size > 0)
				.map(({ info }) => info);
			adminRelaysLoading = false;
		});
	}

	function subscribeAdminRelaySets(addresses: string[]) {
		const pubkey = $key?.pub;
		if (!pubkey) return;
		const nextRelaySetAddressKey = addresses
			.filter((address) =>
				address === `30002:${pubkey}:nuts-relays-admin` ||
				address === `30002:${pubkey}:nuts-relays-member`
			)
			.sort()
			.join('|');
		if (nextRelaySetAddressKey === relaySetAddressKey) return;
		relaySetAddressKey = nextRelaySetAddressKey;
		unsubscribeRelaySets?.();
		adminRelaySets = [];
		adminRelays = [];
		expectedRelaySetAddresses = new Set(
			nextRelaySetAddressKey ? nextRelaySetAddressKey.split('|') : []
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
		relaySetAddressKey = '';
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
		selectAdminRelayUrl(url);
		goto(resolve(navHref(activeAdminSegment)));
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

	function openSettings() {
		communityMenuOpen = false;
		goto(resolve('/admin/settings'));
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

<div class="min-h-screen bg-[#fbfbfa] text-[#080b12]" style="background: #fbfbfa;">
	{#if selectedRelayUrl}
		<header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
			<div
				class="mx-auto grid max-w-[1560px] grid-cols-1 items-center gap-4 px-5 py-7 sm:px-6 lg:grid-cols-[minmax(300px,1fr)_auto_minmax(260px,1fr)]"
			>
				<div class="flex min-w-0 items-center gap-3 p-1">
					<span
						class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#003d31] text-lg font-black text-white shadow-sm shadow-emerald-950/20"
					>
						{initials}
					</span>
					<span
						class="grid h-9 min-w-11 place-items-center rounded-lg bg-slate-100 px-3 text-sm font-black text-slate-700"
					>
						{adminRelays.length}
					</span>
					<span class="min-w-0">
						<span class="block truncate text-xl font-black text-[#080b12]">{displayName}</span>
						<span class="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
							<span class="h-2 w-2 rounded-full bg-[#24b99a]"></span>
							{selectedRelayDescription || 'private community'}
						</span>
					</span>
				</div>

				<nav
					class="flex max-w-full justify-start gap-3 overflow-x-auto lg:justify-center"
					aria-label="Admin navigation"
				>
					{#each visibleNavItems as item (item.segment)}
						<a
							href={resolve(navHref(item.segment))}
							class={`inline-flex h-[52px] shrink-0 items-center gap-3 rounded-lg px-5 text-base font-black no-underline transition focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] ${
								activeAdminSegment === item.segment
									? 'bg-[#eef5f3] text-[#003d31]'
									: 'text-slate-600 hover:bg-slate-100 hover:text-[#080b12]'
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
						<span class="text-sm font-bold text-slate-500">Loading...</span>
					{:else}
						<button
							type="button"
							class="inline-flex h-12 items-center gap-4 rounded-lg px-2 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
							aria-label="Community menu"
							aria-expanded={communityMenuOpen}
							on:click={openCommunitySwitcher}
						>
							<span class="relative">
								{#if $key?.pub}
									<Avatar pubkey={$key.pub} size="lg" />
								{:else}
									<img src="/miss-profile.png" alt="" class="h-10 w-10 rounded-full object-cover" />
								{/if}
								<span
									class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#24b99a]"
								></span>
							</span>
							{#if $key?.pub}
								<span class="hidden max-w-32 truncate text-base font-black text-[#080b12] sm:block">
									<User
										pubkey={$key.pub}
										relays={selectedRelayUrl ? [selectedRelayUrl] : []}
										link={false}
									/>
								</span>
							{:else}
								<span class="hidden max-w-32 truncate text-base font-black text-[#080b12] sm:block">
									Account
								</span>
							{/if}
							<ChevronDown size={18} class="text-slate-700" />
						</button>
					{/if}

					{#if communityMenuOpen}
						<div
							class="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(92vw,440px)] rounded-2xl border border-stone-200 bg-white p-5 text-[#171614] shadow-2xl shadow-stone-950/15"
						>
							<div class="flex items-start gap-5">
								<span class="relative shrink-0">
									{#if $key?.pub}
										<Avatar pubkey={$key.pub} size="xl" customClass="!h-20 !w-20" />
									{:else}
										<img
											src="/miss-profile.png"
											alt=""
											class="h-20 w-20 rounded-full object-cover"
										/>
									{/if}
									<span
										class="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500"
									></span>
								</span>
								<div class="min-w-0 pt-1">
									<p class="truncate text-xl font-black">
										{#if $key?.pub}
											<User
												pubkey={$key.pub}
												relays={selectedRelayUrl ? [selectedRelayUrl] : []}
												link={false}
											/>
										{:else}
											Account
										{/if}
									</p>
									<p class="mt-1 truncate text-base font-semibold text-stone-500">
										{accountHandle}
									</p>
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

							{#if communityAccess.permissions.has('settings')}<button
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
								class="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-lg font-black text-stone-800 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.99]"
								on:click={openSettings}
							>
								<Settings size={23} strokeWidth={1.8} />
								Community settings
							</button>{/if}

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
	{/if}

	<Pager rootPath="/admin">
		<slot />
	</Pager>
	{#if selectedRelayUrl && communityAccess.permissions.has('settings')}
		<PaymentSetupNotice community={selectedRelayUrl} />
	{/if}
</div>
