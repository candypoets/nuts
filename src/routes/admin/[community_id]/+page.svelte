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
		ChevronRight,
		ExternalLink,
		FileText,
		RefreshCw,
		ShieldCheck,
		UserPlus,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { selectedAdminRelayUrl } from 'src/controller';
	import {
		parseRoleAwardsFromKind8,
		parseRoleDefinition,
		type RoleAward,
		type RoleDefinition
	} from 'src/lib/nip58Roles';
	import { now } from 'src/lib/period';
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
			segment: 'roles'
		}
	];

	let relayUrl = '';
	let inviteUrl = '';
	let qrDataUrl = '';
	let qrRequest = 0;
	let checkedOverview = false;
	let error = '';
	let loadedRelayUrl = '';
	let roleDefinitions: RoleDefinition[] = [];
	let roleAwards: RoleAward[] = [];
	let unsubscribeRoleDefinitions: (() => void) | undefined;
	let unsubscribeRoleAwards: (() => void) | undefined;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		loadSelectedRelay();
		subscribeOverview();
	}
	$: activeAwards = roleAwards.filter((award) => !award.expiresAt || award.expiresAt > now());
	$: memberPubkeys = Array.from(new Set(activeAwards.map((award) => award.recipient))).sort();
	$: roleCount = roleDefinitions.length;
	$: expiringSoonCount = activeAwards.filter(
		(award) => award.expiresAt && award.expiresAt < now() + 30 * 24 * 60 * 60
	).length;
	$: isNewCommunity = checkedOverview && memberPubkeys.length === 0;
	$: communityName = relayUrl ? communityNameFromRelay(relayUrl) : 'Community';
	$: summaryCards = buildSummaryCards(memberPubkeys.length, expiringSoonCount, roleCount);
	$: generateQr(inviteUrl);

	function loadSelectedRelay() {
		relayUrl = $selectedAdminRelayUrl ? normalizeURL($selectedAdminRelayUrl) : '';
		inviteUrl = relayUrl ? `${relayInfoUrl(relayUrl).replace(/\/$/, '')}/redeem` : '';
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
				kinds: [30009],
				limit: 100,
				relays: [relayUrl],
				cacheFirst: false,
				noCache: true
			}
		];
		const roleAwardRequests: RequestObject[] = [
			{
				kinds: [8],
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
				upsertRoleDefinition(parsedEvent);
			},
			{ bytesPerEvent: 10 * 1024 }
		);

		unsubscribeRoleAwards = useSubscription(
			'admin_member_role_awards_' + relayUrl,
			roleAwardRequests,
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent || parsedEvent.kind() !== 8) return;
				checkedOverview = true;
				for (const award of parseRoleAwardsFromKind8(parsedEvent)) {
					upsertRoleAward(award);
				}
			},
			{
				bytesPerEvent: 10 * 1024,
				pipeline: [
					new PipeT(
						PipeConfig.NpubLimiterPipeConfig,
						new NpubLimiterPipeConfigT(8, 1, 5000)
					),
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

	function buildSummaryCards(
		memberCount: number,
		expiringCount: number,
		rolesTotal: number
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
				value: '0',
				detail: 'No events yet',
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

	function goAdmin(segment: string) {
		return goto(resolve(adminHref(segment) as '/admin'));
	}

	function openCommunity() {
		if (!relayUrl) return;
		window.open(relayInfoUrl(relayUrl), '_blank', 'noreferrer');
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
			class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5"
		>
			<div class="grid min-h-[236px] gap-6 p-7 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
				<div>
					<span
						class={`inline-flex text-base font-semibold ${
							isNewCommunity ? 'text-[#003d31]' : 'text-slate-700'
						}`}
					>
						{isNewCommunity ? 'Community created' : 'Community overview'}
					</span>
					<h1 class="mt-5 text-5xl font-medium leading-none text-[#080b12] md:text-[50px]">
						{communityName}
					</h1>
					<p class="mt-5 max-w-3xl text-lg font-medium leading-7 text-slate-600">
						{isNewCommunity
							? 'Your community is ready. Invite your first members and set up the basics.'
							: 'Track members, roles, events, and community activity from one place.'}
					</p>
				</div>

				<div class="flex flex-wrap gap-3 lg:justify-end">
					<button
						type="button"
						class="inline-flex h-12 items-center gap-3 rounded-lg bg-[#003d31] px-6 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-[#004d3e] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
						on:click={() => goAdmin('invites')}
					>
						<UserPlus size={19} />
						Invite
					</button>
					<button
						type="button"
						class="inline-flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-6 font-black text-[#080b12] shadow-sm shadow-slate-950/5 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
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
							on:click={() => goAdmin(step.segment)}
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
