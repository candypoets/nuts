<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from 'src/lib/paths';
	import {
		NpubLimiterPipeConfigT,
		ParsePipeConfigT,
		PipeConfig,
		PipeT,
		SaveToDbPipeConfigT,
		SerializeEventsPipeConfigT,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		CalendarDays,
		CalendarPlus,
		ChevronRight,
		ExternalLink,
		FileText,
		MapPin,
		RefreshCw,
		ShieldCheck,
		UserPlus,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { selectedAdminRelayUrl } from 'src/controller';
	import { parsedEventTags } from 'src/lib/adminRelays';
	import {
		CALENDAR_EVENT_KINDS,
		parseCalendarEvent,
		type CalendarEventCard
	} from 'src/lib/calendarEvent';
	import {
		parseRoleAwardsFromKind8,
		parseRoleDefinition,
		type RoleAward,
		type RoleDefinition
	} from 'src/lib/nip58Roles';
	import { now } from 'src/lib/period';
	import { go } from 'src/routes/modals/modal';
	import { onDestroy } from 'svelte';
	import { QRCode } from 'svelte-qrcode-image/util';

	type SummaryCard = {
		label: string;
		value: string;
		detail: string;
		icon: typeof UsersRound;
		tone: string;
	};

	const nextSteps = [
		{
			label: 'Invite members',
			detail: 'Bring people into your community.',
			icon: UserPlus,
			segment: 'invites'
		},
		{
			label: 'Create an event',
			detail: 'Organize your first event or meetup.',
			icon: CalendarDays,
			segment: 'events'
		},
		{
			label: 'Make a post',
			detail: 'Share an update with your members.',
			icon: FileText,
			segment: ''
		},
		{
			label: 'Assign roles',
			detail: 'Give permissions and empower your team.',
			icon: ShieldCheck,
			segment: 'members'
		}
	];

	let relayUrl = '';
	let communityMetadataUrl = '';
	let communityMetadataName = '';
	let communityBanner = '';
	let inviteUrl = '';
	let qrDataUrl = '';
	let qrRequest = 0;
	let checkedOverview = false;
	let error = '';
	let loadedRelayUrl = '';
	let roleDefinitions: RoleDefinition[] = [];
	let roleAwards: RoleAward[] = [];
	let upcomingEvents: CalendarEventCard[] = [];
	let eventsLoading = false;
	let unsubscribeRoleDefinitions: (() => void) | undefined;
	let unsubscribeRoleAwards: (() => void) | undefined;
	let unsubscribeEvents: (() => void) | undefined;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		loadSelectedRelay();
		subscribeOverview();
		subscribeEvents();
	}
	$: activeAwards = roleAwards.filter((award) => !award.expiresAt || award.expiresAt > now());
	$: memberPubkeys = Array.from(new Set(activeAwards.map((award) => award.recipient))).sort();
	$: roleCount = roleDefinitions.length;
	$: expiringSoonCount = activeAwards.filter(
		(award) => award.expiresAt && award.expiresAt < now() + 30 * 24 * 60 * 60
	).length;
	$: isNewCommunity = checkedOverview && memberPubkeys.length === 0;
	$: communityName =
		communityMetadataName || (relayUrl ? communityNameFromRelay(relayUrl) : 'Community');
	$: summaryCards = buildSummaryCards(
		memberPubkeys.length,
		expiringSoonCount,
		roleCount,
		upcomingEvents.length
	);
	$: generateQr(inviteUrl);

	function loadSelectedRelay() {
		relayUrl = $selectedAdminRelayUrl ? normalizeURL($selectedAdminRelayUrl) : '';
		inviteUrl = relayUrl ? `${relayInfoUrl(relayUrl).replace(/\/$/, '')}/redeem` : '';
		communityMetadataName = '';
		communityBanner = '';
		loadCommunityMetadata(relayUrl);
	}

	async function loadCommunityMetadata(url: string) {
		communityMetadataUrl = url;
		if (!url) return;

		try {
			const response = await fetch(relayInfoUrl(url), {
				headers: { accept: 'application/nostr+json' }
			});
			if (!response.ok) return;

			const info = await response.json();
			if (communityMetadataUrl !== url) return;
			communityMetadataName = typeof info.name === 'string' ? info.name : '';
			communityBanner =
				['banner', 'image', 'picture']
					.map((field) => info[field])
					.find((value) => typeof value === 'string' && /^https?:\/\//.test(value)) || '';
		} catch {
			// The branded gradient remains visible when NIP-11 metadata is unavailable.
		}
	}

	function relayInfoUrl(url: string) {
		if (url.startsWith('wss://')) return `https://${url.slice(6)}`;
		if (url.startsWith('ws://')) return `http://${url.slice(5)}`;
		return url;
	}

	function communityNameFromRelay(url: string) {
		try {
			const hostname = new URL(relayInfoUrl(url)).hostname;
			const firstLabel = hostname.split('.')[0] || hostname;
			return firstLabel
				.split(/[-_]+/)
				.filter(Boolean)
				.map((part) => part[0]?.toUpperCase() + part.slice(1))
				.join(' ');
		} catch {
			return url;
		}
	}

	function upsertRoleDefinition(parsedEvent: ParsedEvent) {
		const definition = parseRoleDefinition(parsedEvent);
		if (!definition) return;
		const existingIndex = roleDefinitions.findIndex((role) => role.address === definition.address);
		if (existingIndex !== -1) {
			if (definition.createdAt <= roleDefinitions[existingIndex].createdAt) return;
			roleDefinitions = roleDefinitions.map((role, index) =>
				index === existingIndex ? definition : role
			);
		} else {
			roleDefinitions = [...roleDefinitions, definition].sort((a, b) =>
				a.name.localeCompare(b.name)
			);
		}
	}

	function upsertRoleAward(award: RoleAward) {
		const existingIndex = roleAwards.findIndex((item) => item.recipient === award.recipient);
		if (existingIndex !== -1) {
			if (award.createdAt <= roleAwards[existingIndex].createdAt) return;
			roleAwards = roleAwards.map((item, index) => (index === existingIndex ? award : item));
		} else {
			roleAwards = [...roleAwards, award];
		}
	}

	function deletionTargets(parsedEvent: ParsedEvent) {
		const tags = parsedEventTags(parsedEvent);
		return {
			author: parsedEvent.pubkey() || '',
			addresses: tags.filter((tag) => tag[0] === 'a' && tag[1]).map((tag) => tag[1]),
			ids: tags.filter((tag) => tag[0] === 'e' && tag[1]).map((tag) => tag[1])
		};
	}

	function applyDeletion(parsedEvent: ParsedEvent) {
		const { author, addresses, ids } = deletionTargets(parsedEvent);
		if (!author || (!addresses.length && !ids.length)) return;
		roleDefinitions = roleDefinitions.filter(
			(role) => role.pubkey !== author || !addresses.includes(role.address)
		);
		roleAwards = roleAwards.filter((award) => award.pubkey !== author || !ids.includes(award.id));
	}

	function subscribeOverview() {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		roleDefinitions = [];
		roleAwards = [];
		checkedOverview = false;
		error = '';

		if (!relayUrl) {
			error = 'Missing community relay.';
			checkedOverview = true;
			return;
		}

		const roleDefinitionRequests: RequestObject[] = [
			{
				kinds: [30009, 5],
				limit: 100,
				relays: [relayUrl],
				cacheFirst: false,
				noCache: true
			}
		];
		const roleAwardRequests: RequestObject[] = [
			{
				kinds: [8, 5],
				limit: 1000,
				relays: [relayUrl],
				cacheFirst: false,
				noCache: true
			}
		];

		unsubscribeRoleDefinitions = useSubscription(
			'admin_member_role_definitions_' + relayUrl,
			roleDefinitionRequests,
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				checkedOverview = true;
				if (parsedEvent.kind() === 5) {
					applyDeletion(parsedEvent);
					return;
				}
				upsertRoleDefinition(parsedEvent);
			},
			{ bytesPerEvent: 10 * 1024 }
		);

		unsubscribeRoleAwards = useSubscription(
			'admin_member_role_awards_' + relayUrl,
			roleAwardRequests,
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				checkedOverview = true;
				if (parsedEvent.kind() === 5) {
					applyDeletion(parsedEvent);
					return;
				}
				if (parsedEvent.kind() !== 8) return;
				for (const award of parseRoleAwardsFromKind8(parsedEvent)) {
					upsertRoleAward(award);
				}
			},
			{
				bytesPerEvent: 10 * 1024,
				pipeline: [
					new PipeT(PipeConfig.NpubLimiterPipeConfig, new NpubLimiterPipeConfigT(8, 1, 5000)),
					new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
					new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
					new PipeT(
						PipeConfig.SerializeEventsPipeConfig,
						new SerializeEventsPipeConfigT(new TextEncoder().encode('admin_member_role_awards'))
					)
				]
			}
		);

		window.setTimeout(() => {
			checkedOverview = true;
		}, 500);
	}

	function subscribeEvents() {
		unsubscribeEvents?.();
		upcomingEvents = [];
		eventsLoading = Boolean(relayUrl);

		if (!relayUrl) {
			eventsLoading = false;
			return;
		}

		const eventsByAddress = new Map<string, CalendarEventCard>();
		unsubscribeEvents = useSubscription(
			'admin_upcoming_events_' + relayUrl,
			[
				{
					kinds: [...CALENDAR_EVENT_KINDS, 5],
					limit: 40,
					relays: [relayUrl],
					cacheFirst: false,
					noCache: true
				}
			],
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				if (parsedEvent.kind() === 5) {
					const { author, addresses, ids } = deletionTargets(parsedEvent);
					if (!author) return;
					let removed = false;
					for (const [address, card] of eventsByAddress) {
						if (address.split(':')[1] !== author) continue;
						if (addresses.includes(address) || ids.includes(card.id)) {
							eventsByAddress.delete(address);
							removed = true;
						}
					}
					if (removed) {
						upcomingEvents = Array.from(eventsByAddress.values()).sort(
							(left, right) => left.start - right.start
						);
					}
					return;
				}
				const calendarEvent = parseCalendarEvent(parsedEvent, [relayUrl]);
				if (!calendarEvent) return;

				eventsByAddress.set(calendarEvent.address, calendarEvent);
				upcomingEvents = Array.from(eventsByAddress.values()).sort(
					(left, right) => left.start - right.start
				);
				eventsLoading = false;
			},
			{ bytesPerEvent: 12 * 1024, closeOnEose: true }
		);

		window.setTimeout(() => {
			eventsLoading = false;
		}, 1800);
	}

	function buildSummaryCards(
		memberCount: number,
		expiringCount: number,
		rolesTotal: number,
		eventsTotal: number
	): SummaryCard[] {
		return [
			{
				label: 'Members',
				value: String(memberCount),
				detail: memberCount ? `${expiringCount} expiring soon` : 'No members yet',
				icon: UsersRound,
				tone: 'bg-emerald-50 text-emerald-900'
			},
			{
				label: 'Roles',
				value: String(rolesTotal),
				detail: rolesTotal ? 'Configured for this community' : 'Create the first role',
				icon: ShieldCheck,
				tone: 'bg-violet-50 text-violet-700'
			},
			{
				label: 'Events',
				value: String(eventsTotal),
				detail: eventsTotal ? 'Coming up' : 'No upcoming events',
				icon: CalendarDays,
				tone: 'bg-blue-50 text-blue-700'
			},
			{
				label: 'Expiring',
				value: String(expiringCount),
				detail: expiringCount ? 'Review member renewals' : 'No renewals due soon',
				icon: RefreshCw,
				tone: 'bg-amber-50 text-amber-700'
			}
		];
	}

	function adminHref(segment: string) {
		return segment ? `/admin/${segment}` : '/admin';
	}

	function goAdmin(segment: string, action?: 'create') {
		const href = resolve(adminHref(segment) as '/admin');
		return goto(action === 'create' ? `${href}?create=1` : href);
	}

	function openCommunity() {
		if (!relayUrl) return;
		window.open(relayInfoUrl(relayUrl), '_blank', 'noreferrer');
	}

	function openEvent(event: CalendarEventCard) {
		const relayParam = (event.relays.length ? event.relays : [relayUrl])
			.map(encodeURIComponent)
			.join(',');
		go(`event:${relayParam}:${encodeURIComponent(event.address)}`);
	}

	function formatEventDate(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(timestamp * 1000));
	}

	async function generateQr(text: string) {
		if (!text) {
			qrDataUrl = '';
			return;
		}
		const requestId = ++qrRequest;
		const nextQrDataUrl = await QRCode.toDataURL(text, {
			errorCorrectionLevel: 'M',
			margin: 1,
			width: 420,
			color: {
				dark: '#111827',
				light: '#ffffff'
			}
		});
		if (requestId !== qrRequest) return;
		qrDataUrl = nextQrDataUrl;
	}

	onDestroy(() => {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		unsubscribeEvents?.();
	});
</script>

<main class="px-5 py-9 sm:px-6">
	<div class="mx-auto grid max-w-[1560px] gap-5">
		{#if error}
			<p class="rounded-lg border border-rose-200 bg-rose-50 p-4 font-bold text-rose-800">
				{error}
			</p>
		{/if}

		<section
			class="relative isolate overflow-hidden rounded-xl border border-[#15372c]/20 bg-[#15372c] shadow-sm shadow-slate-950/10"
		>
			<div
				class="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_82%_18%,rgba(231,182,56,0.72),transparent_28%),radial-gradient(circle_at_12%_110%,rgba(223,114,92,0.76),transparent_38%),linear-gradient(120deg,#15372c_16%,#245746_62%,#15372c)]"
				aria-hidden="true"
			></div>
			{#if communityBanner}
				<img
					src={communityBanner}
					alt=""
					class="absolute inset-0 -z-10 h-full w-full object-cover"
					aria-hidden="true"
				/>
			{/if}
			<div
				class="absolute inset-0 -z-10 bg-gradient-to-r from-[#102b23]/95 via-[#15372c]/78 to-[#15372c]/35"
				aria-hidden="true"
			></div>

			<div class="grid min-h-[236px] gap-6 p-7 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
				<div>
					<span class="inline-flex text-base font-semibold text-[#f2ebdd]/85">
						{isNewCommunity ? 'Community created' : 'Community overview'}
					</span>
					<h1 class="mt-5 text-5xl font-medium leading-none text-white md:text-[50px]">
						{communityName}
					</h1>
					<p class="mt-5 max-w-3xl text-lg font-medium leading-7 text-[#f2ebdd]/90">
						{isNewCommunity
							? 'Your community is ready. Invite your first members and set up the basics.'
							: 'Track members, roles, events, and community activity from one place.'}
					</p>
				</div>

				<div class="flex flex-wrap gap-3 lg:justify-end">
					<button
						type="button"
						class="inline-flex h-12 items-center gap-3 rounded-lg bg-[#df725c] px-6 font-black text-white shadow-sm shadow-black/20 transition hover:bg-[#e47e69] focus:outline-none focus:ring-2 focus:ring-white/60 active:scale-[0.98]"
						on:click={() => goAdmin('invites')}
					>
						<UserPlus size={19} />
						Invite
					</button>
					<button
						type="button"
						class="inline-flex h-12 items-center gap-3 rounded-lg border border-white/35 bg-white/90 px-6 font-black text-[#15372c] shadow-sm shadow-black/10 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/60 active:scale-[0.98]"
						on:click={openCommunity}
					>
						Open
						<ExternalLink size={16} />
					</button>
				</div>
			</div>
		</section>

		<section
			class="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5 md:grid-cols-4"
		>
			{#each summaryCards as card, index (card.label)}
				<div class={`p-8 ${index < summaryCards.length - 1 ? 'border-slate-200 md:border-r' : ''}`}>
					<div class="flex items-center gap-5">
						<div class={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${card.tone}`}>
							<svelte:component this={card.icon} size={23} />
						</div>
						<p class="text-[42px] font-medium leading-none text-[#080b12]">{card.value}</p>
					</div>
					<p class="mt-5 text-base font-black text-[#080b12]">{card.label}</p>
					<p class="mt-1 text-base font-medium text-slate-600">
						{!checkedOverview && card.label === 'Members' ? 'Checking...' : card.detail}
					</p>
				</div>
			{/each}
		</section>

		<section
			class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5"
		>
			<header class="flex flex-wrap items-end justify-between gap-4 px-6 pb-5 pt-7 sm:px-8">
				<div>
					<p class="text-sm font-bold text-[#df725c]">Community calendar</p>
					<h2 class="mt-1 text-2xl font-medium tracking-tight text-[#080b12]">Coming up</h2>
					<p class="mt-2 text-base font-medium text-slate-600">
						Open an event to review its details and RSVPs.
					</p>
				</div>
				<button
					type="button"
					class="inline-flex h-11 items-center gap-2 rounded-lg bg-[#15372c] px-4 font-black text-white transition hover:bg-[#204c3e] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
					on:click={() => goAdmin('events', 'create')}
				>
					<CalendarPlus size={18} />
					Create event
				</button>
			</header>

			{#if eventsLoading && !upcomingEvents.length}
				<div class="grid gap-3 border-t border-slate-100 p-6 sm:grid-cols-2 lg:grid-cols-3 sm:p-8">
					{#each Array(3) as _, index (index)}
						<div class="h-40 animate-pulse rounded-lg bg-slate-100"></div>
					{/each}
				</div>
			{:else if upcomingEvents.length}
				<div
					class="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-3"
				>
					{#each upcomingEvents.slice(0, 6) as event (event.address)}
						<button
							type="button"
							class="group grid min-h-[190px] bg-white p-6 text-left transition hover:bg-[#f7faf9] focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-800/30 sm:p-7"
							on:click={() => openEvent(event)}
						>
							<div class="flex items-start justify-between gap-5">
								<span class="rounded-md bg-[#eef5f3] px-3 py-2 text-sm font-black text-[#15372c]">
									{formatEventDate(event.start)}
								</span>
								<ChevronRight
									size={20}
									class="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#15372c]"
								/>
							</div>
							<div class="mt-7 self-end">
								<h3 class="text-xl font-black leading-tight text-[#080b12]">{event.title}</h3>
								{#if event.location}
									<p class="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-500">
										<MapPin size={16} />
										<span class="truncate">{event.location}</span>
									</p>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<div class="border-t border-slate-100 px-6 py-10 sm:px-8">
					<div class="flex max-w-xl items-start gap-4">
						<span
							class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#eef5f3] text-[#15372c]"
						>
							<CalendarDays size={23} />
						</span>
						<div>
							<h3 class="text-lg font-black text-[#080b12]">No upcoming events</h3>
							<p class="mt-1 leading-6 text-slate-600">
								Create an event and it will appear here for the community team to follow.
							</p>
						</div>
					</div>
				</div>
			{/if}
		</section>

		<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
			<section class="rounded-xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-950/5">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h2 class="text-2xl font-medium text-[#080b12]">Next actions</h2>
						<p class="mt-2 text-base font-medium leading-7 text-slate-600">
							{isNewCommunity
								? 'Complete these steps to launch your community.'
								: 'Common actions for managing this community.'}
						</p>
					</div>
					<button
						type="button"
						class="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-base font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
						on:click={subscribeOverview}
					>
						<RefreshCw size={17} />
						Refresh
					</button>
				</div>

				<div class="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
					{#each nextSteps as step, index (step.label)}
						<button
							type="button"
							class="grid min-h-[176px] rounded-lg border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-950/5 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
							on:click={() => goAdmin(step.segment, step.segment === 'events' ? 'create' : undefined)}
						>
							<div
								class={`grid h-11 w-11 place-items-center rounded-lg ${
									index === 0
										? 'bg-emerald-50 text-emerald-900'
										: index === 1
											? 'bg-blue-50 text-blue-700'
											: index === 2
												? 'bg-violet-50 text-violet-700'
												: 'bg-orange-50 text-orange-700'
								}`}
							>
								<svelte:component this={step.icon} size={24} />
							</div>
							<div class="mt-7 grid grid-cols-[1fr_auto] items-center gap-3">
								<div>
									<h3 class="text-base font-black text-[#080b12]">{step.label}</h3>
									<p class="mt-2 text-base leading-6 text-slate-600">{step.detail}</p>
								</div>
								<ChevronRight size={20} class="text-slate-500" />
							</div>
						</button>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-950/5">
				<h2 class="text-2xl font-medium text-[#080b12]">Invites</h2>
				<p class="mt-2 text-base font-medium text-slate-600">Create a QR invite for new members.</p>

				<div class="mt-8 grid gap-6 sm:grid-cols-[116px_1fr] sm:items-center">
					<div
						class="grid h-[116px] w-[116px] place-items-center rounded-lg border border-slate-200 bg-white p-3"
					>
						{#if qrDataUrl}
							<img class="h-full w-full object-contain" src={qrDataUrl} alt="Invite QR code" />
						{:else}
							<span class="text-center text-xs font-bold text-slate-500">Generating QR</span>
						{/if}
					</div>
					<div>
						<p class="text-lg font-black text-[#080b12]">Scan to join</p>
						<p class="mt-3 text-lg leading-7 text-slate-600">New members can scan this QR code.</p>
					</div>
				</div>

				<button
					type="button"
					class="mt-6 inline-flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 font-black text-[#080b12] shadow-sm shadow-slate-950/5 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
					on:click={() => goAdmin('invites')}
				>
					<UserPlus size={18} />
					Create invite
				</button>
			</section>
		</div>
	</div>
</main>
