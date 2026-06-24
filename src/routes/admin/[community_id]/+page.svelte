<script lang="ts">
	import { page } from '$app/stores';
	import {
		NpubLimiterKey,
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
	import { isKind8, isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		CalendarDays,
		Copy,
		Download,
		ExternalLink,
		FileText,
		RefreshCw,
		ShieldCheck,
		UserPlus,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
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
		{ label: 'Invite members', detail: 'Bring people into your community.', icon: UserPlus },
		{
			label: 'Create an event',
			detail: 'Organize your first event or meetup.',
			icon: CalendarDays
		},
		{ label: 'Make a post', detail: 'Share an update with your members.', icon: FileText },
		{ label: 'Assign roles', detail: 'Give permissions and empower your team.', icon: ShieldCheck }
	];

	let relayUrl = '';
	let inviteUrl = '';
	let qrDataUrl = '';
	let qrRequest = 0;
	let checkedOverview = false;
	let error = '';
	let loadedCommunityId = '';
	let roleDefinitions: RoleDefinition[] = [];
	let roleAwards: RoleAward[] = [];
	let unsubscribeRoleDefinitions: (() => void) | undefined;
	let unsubscribeRoleAwards: (() => void) | undefined;

	$: communityId = $page.params.community_id;
	$: if (communityId && communityId !== loadedCommunityId) {
		loadedCommunityId = communityId;
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
	$: initials =
		communityName
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'N';
	$: summaryCards = buildSummaryCards(memberPubkeys.length, expiringSoonCount, roleCount);
	$: recentMembers = memberPubkeys.slice(0, 5);
	$: generateQr(inviteUrl);

	function loadSelectedRelay() {
		const rawRelayUrl = communityId ? decodeURIComponent(communityId) : '';
		relayUrl = rawRelayUrl ? normalizeURL(rawRelayUrl) : '';
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
				const kind8 = isKind8(message);
				if (!parsedEvent || !kind8) return;
				checkedOverview = true;
				for (const award of parseRoleAwardsFromKind8(parsedEvent, kind8)) {
					upsertRoleAward(award);
				}
			},
			{
				bytesPerEvent: 10 * 1024,
				pipeline: [
					new PipeT(
						PipeConfig.NpubLimiterPipeConfig,
						new NpubLimiterPipeConfigT(8, 1, 5000, NpubLimiterKey.PTag)
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

	function memberLabel(pubkey: string) {
		return `Member ${pubkey.slice(0, 6).toUpperCase()}`;
	}

	async function copy(text: string) {
		await navigator.clipboard?.writeText(text);
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

	async function downloadInvitePoster() {
		if (!inviteUrl) return;
		const canvas = document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 1600;
		const context2d = canvas.getContext('2d');
		if (!context2d) return;

		context2d.fillStyle = '#173827';
		context2d.fillRect(0, 0, canvas.width, canvas.height);
		context2d.fillStyle = '#ffffff';
		context2d.fillRect(96, 96, 1008, 1408);
		context2d.fillStyle = '#286541';
		context2d.font = '700 34px sans-serif';
		context2d.fillText('Join the community', 160, 190);
		context2d.fillStyle = '#171614';
		context2d.font = '900 84px sans-serif';
		context2d.fillText(communityName, 160, 330, 880);
		context2d.fillStyle = '#5f594d';
		context2d.font = '600 34px sans-serif';
		context2d.fillText(inviteUrl, 160, 460, 880);

		const link = document.createElement('a');
		link.href = canvas.toDataURL('image/png');
		link.download = `${communityId || 'community'}-invite.png`;
		link.click();
	}

	onDestroy(() => {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
	});
</script>

<main class="px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto grid max-w-[1500px] gap-6">
		{#if error}
			<p class="rounded-xl border border-rose-200 bg-rose-50 p-4 font-bold text-rose-800">
				{error}
			</p>
		{/if}

		<section
			class="overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm shadow-stone-950/5"
		>
			<div class="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center lg:p-8">
				<div>
					<span
						class={`inline-flex rounded-md px-2.5 py-1 text-sm font-black ${
							isNewCommunity ? 'bg-emerald-50 text-emerald-900' : 'bg-stone-100 text-stone-700'
						}`}
					>
						{isNewCommunity ? 'Community created' : 'Community overview'}
					</span>
					<h1 class="mt-5 text-4xl font-black leading-tight text-[#171614] md:text-5xl">
						{communityName}
					</h1>
					<p class="mt-3 max-w-3xl text-lg font-medium leading-8 text-stone-600">
						{isNewCommunity
							? 'Your community is ready. Invite your first members and set up the basics.'
							: 'Track members, roles, events, and community activity from one place.'}
					</p>
					<p class="mt-3 truncate text-sm font-bold text-stone-500">{relayUrl}</p>
				</div>

				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						class="inline-flex h-11 items-center gap-3 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
						on:click={() => copy(inviteUrl)}
					>
						<UserPlus size={19} />
						Invite
					</button>
					<button
						type="button"
						class="inline-flex h-11 items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
						on:click={openCommunity}
					>
						Open
						<ExternalLink size={16} />
					</button>
				</div>
			</div>
		</section>

		<section
			class="grid overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm shadow-stone-950/5 md:grid-cols-4"
		>
			{#each summaryCards as card, index (card.label)}
				<div class={`p-6 ${index < summaryCards.length - 1 ? 'border-stone-200 md:border-r' : ''}`}>
					<div class={`grid h-11 w-11 place-items-center rounded-xl ${card.tone}`}>
						<svelte:component this={card.icon} size={23} />
					</div>
					<p class="mt-5 font-mono text-4xl font-black text-[#171614]">{card.value}</p>
					<p class="mt-2 text-base font-black text-[#171614]">{card.label}</p>
					<p class="mt-2 text-base font-medium text-stone-600">
						{!checkedOverview && card.label === 'Members' ? 'Checking...' : card.detail}
					</p>
				</div>
			{/each}
		</section>

		<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
			<div class="grid gap-6">
				<section
					class="rounded-2xl border border-stone-200 bg-white/85 p-6 shadow-sm shadow-stone-950/5 lg:p-8"
				>
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div>
							<h2 class="text-2xl font-black text-[#171614]">Next actions</h2>
							<p class="mt-2 text-base font-medium leading-7 text-stone-600">
								{isNewCommunity
									? 'Complete these steps to launch your community.'
									: 'Common actions for managing this community.'}
							</p>
						</div>
						<button
							type="button"
							class="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-800 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
							on:click={subscribeOverview}
						>
							<RefreshCw size={16} />
							Refresh
						</button>
					</div>

					<div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{#each nextSteps as step, index (step.label)}
							<div
								class="rounded-xl border border-stone-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-stone-950/5"
							>
								<div
									class={`grid h-11 w-11 place-items-center rounded-xl ${
										index === 0
											? 'bg-emerald-50 text-emerald-900'
											: index === 1
												? 'bg-blue-50 text-blue-700'
												: index === 2
													? 'bg-violet-50 text-violet-700'
													: 'bg-amber-50 text-amber-700'
									}`}
								>
									<svelte:component this={step.icon} size={24} />
								</div>
								<h3 class="mt-5 text-base font-black text-[#171614]">{step.label}</h3>
								<p class="mt-2 text-sm leading-6 text-stone-600">{step.detail}</p>
							</div>
						{/each}
					</div>
				</section>

				<section
					class="overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm shadow-stone-950/5"
				>
					<div class="flex items-center justify-between gap-4 p-5 lg:p-7">
						<div>
							<h2 class="text-2xl font-black">Recent members</h2>
							<p class="mt-1 text-base text-stone-600">
								{memberPubkeys.length} members with role assignments.
							</p>
						</div>
					</div>
					<div class="divide-y divide-stone-200">
						{#if !recentMembers.length}
							<div class="px-7 py-10">
								<p class="text-base font-black text-stone-700">No members yet</p>
								<p class="mt-1 text-sm font-medium text-stone-500">
									Invite members to start filling this list.
								</p>
							</div>
						{/if}
						{#each recentMembers as pubkey (pubkey)}
							<div class="grid grid-cols-[auto_1fr] items-center gap-4 px-7 py-5">
								<div
									class="grid h-11 w-11 place-items-center rounded-xl bg-emerald-950 text-sm font-bold text-white"
								>
									{pubkey.slice(0, 2).toUpperCase()}
								</div>
								<div class="min-w-0">
									<p class="truncate text-lg font-bold text-[#171614]">{memberLabel(pubkey)}</p>
									<p class="mt-1 text-base text-stone-500">Member</p>
								</div>
							</div>
						{/each}
					</div>
				</section>
			</div>

			<aside class="grid content-start gap-6">
				<section
					class="rounded-2xl border border-stone-200 bg-white/85 p-6 shadow-sm shadow-stone-950/5"
				>
					<h2 class="text-2xl font-black text-[#171614]">Invite link</h2>
					<p class="mt-2 text-base font-medium text-stone-600">Share this with new members.</p>

					<div
						class="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-stone-200 bg-white"
					>
						<span class="min-w-0 truncate px-4 py-4 text-sm font-black">{inviteUrl}</span>
						<button
							type="button"
							class="border-l border-stone-200 px-4 font-black text-emerald-950 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
							aria-label="Copy invite link"
							on:click={() => copy(inviteUrl)}
						>
							<Copy size={18} />
						</button>
					</div>

					<div class="mt-6 grid gap-5 sm:grid-cols-[128px_1fr] sm:items-center">
						<div
							class="grid h-32 w-32 place-items-center rounded-xl border border-stone-200 bg-white p-3"
						>
							{#if qrDataUrl}
								<img class="h-full w-full object-contain" src={qrDataUrl} alt="Invite QR code" />
							{:else}
								<span class="text-xs font-bold text-stone-500">Generating QR</span>
							{/if}
						</div>
						<div>
							<p class="text-lg font-black text-[#171614]">Scan to join</p>
							<p class="mt-2 text-base leading-6 text-stone-600">
								New members can scan this QR code.
							</p>
						</div>
					</div>

					<button
						type="button"
						class="mt-6 inline-flex h-11 items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
						on:click={downloadInvitePoster}
					>
						<Download size={18} />
						Download poster
					</button>
				</section>

				<section
					class="rounded-2xl border border-stone-200 bg-white/85 p-6 shadow-sm shadow-stone-950/5"
				>
					<h2 class="text-lg font-black text-[#171614]">Community preview</h2>
					<div class="mt-5 rounded-2xl bg-[#111f19] p-6 text-white shadow-inner">
						<div class="flex items-center gap-5">
							<div
								class="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-emerald-800 text-2xl font-black"
							>
								{initials}
							</div>
							<div class="min-w-0">
								<p class="truncate text-2xl font-black">{communityName}</p>
								<p class="mt-1 text-base text-white/70">private community</p>
								<div class="mt-4 flex flex-wrap gap-5 text-sm text-white/80">
									<span class="inline-flex items-center gap-2">
										<UsersRound size={15} />
										{memberPubkeys.length} Members
									</span>
									<span class="inline-flex items-center gap-2">
										<CalendarDays size={15} />
										0 Events
									</span>
								</div>
							</div>
						</div>
					</div>
				</section>
			</aside>
		</div>
	</div>
</main>
