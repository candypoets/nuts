<script lang="ts">
	export let initialView: 'members' | 'roles' = 'members';
	import { resolve } from 'src/lib/paths';
	import {
		NpubLimiterPipeConfigT,
		ParsePipeConfigT,
		PipeConfig,
		PipeT,
		SaveToDbPipeConfigT,
		SerializeEventsPipeConfigT,
		type Kind0Parsed,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isKind0, isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		ArrowLeft,
		BadgeCheck,
		CalendarClock,
		Eye,
		MoreHorizontal,
		Search,
		ShieldBan,
		UserCog,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { nip19, type EventTemplate } from 'nostr-tools';
	import { key, selectedAdminRelayUrl } from 'src/controller';
	import { parsedEventTags } from 'src/lib/adminRelays';
	import {
		buildRoleAwardTags,
		parseRoleAward,
		parseRoleAwardsFromKind8,
		parseRoleDefinition,
		type RoleAward,
		type RoleDefinition
	} from 'src/lib/nip58Roles';
	import { now } from 'src/lib/period';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { onDestroy } from 'svelte';
	import RolesPage from '../roles/+page.svelte';
	import MemberProfileModal from './MemberProfileModal.svelte';

	type Tone = 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'gray';

	type MemberRow = {
		pubkey: string;
		roles: Array<{ label: string; tone: Tone; expiresAt?: number }>;
		status: string;
		statusTone: Tone;
		expires: string;
	};

	const toneClasses: Record<Tone, string> = {
		green: 'bg-emerald-100 text-emerald-800',
		orange: 'bg-amber-100 text-amber-800',
		red: 'bg-rose-100 text-rose-700',
		blue: 'bg-sky-100 text-sky-800',
		purple: 'bg-violet-100 text-violet-800',
		gray: 'bg-stone-100 text-stone-700'
	};

	const dotClasses: Record<Tone, string> = {
		green: 'bg-emerald-600',
		orange: 'bg-amber-500',
		red: 'bg-rose-600',
		blue: 'bg-sky-600',
		purple: 'bg-violet-600',
		gray: 'bg-stone-500'
	};

	let relayUrl = '';
	let relayAdminPubkeys: string[] = [];
	let loadedRelayUrl = '';
	let roleDefinitions: RoleDefinition[] = [];
	let roleAwards: RoleAward[] = [];
	let memberProfiles: Kind0Parsed[] = [];
	let memberProfileKey = '';
	let loadingMembers = true;
	let peopleView: 'members' | 'roles' = initialView;
	let showAssignModal = false;
	let selectedMember: MemberRow | undefined;
	let actionMember: MemberRow | undefined;
	let actionMenuTop = 0;
	let actionMenuRight = 0;
	let memberToBan: MemberRow | undefined;
	let banningMember = false;
	let banReason = '';
	let newMemberPubkey = '';
	let selectedRoleAddress = '';
	let requiresRenewal = false;
	let expiresAtDate = '';
	let search = '';
	let publishStatus = '';
	let unsubscribeRoleDefinitions: (() => void) | undefined;
	let unsubscribeRoleAwards: (() => void) | undefined;
	let unsubscribeMemberProfiles: (() => void) | undefined;
	let publishUnsubscribe: (() => void) | undefined;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		loadCommunityRelay();
		subscribeMembers();
		fetchRelayAdmin();
	}
	$: if (!selectedRoleAddress && roleDefinitions[0]) {
		selectedRoleAddress = roleDefinitions[0].address;
	}
	$: memberRows = buildMemberRows(roleDefinitions, roleAwards);
	$: syncMemberProfiles(memberRows.map((member) => member.pubkey));
	$: filteredMemberRows = memberRows.filter((member) =>
		member.pubkey.toLowerCase().includes(search.trim().toLowerCase())
	);
	$: hasValidRenewalDate =
		!requiresRenewal || Boolean(expiresAtDate && new Date(expiresAtDate).getTime() > Date.now());
	$: canAssignRole =
		relayUrl &&
		Boolean(normalizePubkey(newMemberPubkey)) &&
		selectedRoleAddress &&
		$key?.pub &&
		hasValidRenewalDate;

	function loadCommunityRelay() {
		relayUrl = $selectedAdminRelayUrl ? normalizeURL($selectedAdminRelayUrl) : '';
		relayAdminPubkeys = [];
	}

	function openMemberProfile(member: MemberRow) {
		selectedMember = member;
	}

	function handleMemberRowKeydown(event: KeyboardEvent, member: MemberRow) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		openMemberProfile(member);
	}

	function relayInfoUrl(url: string) {
		if (url.startsWith('wss://')) return `https://${url.slice(6)}`;
		if (url.startsWith('ws://')) return `http://${url.slice(5)}`;
		return url;
	}

	function stringsFrom(value: unknown): string[] {
		if (typeof value === 'string') return [value];
		if (Array.isArray(value))
			return value.filter((item): item is string => typeof item === 'string');
		return [];
	}

	function defaultAdminPubkeys() {
		return Array.from(new Set([...relayAdminPubkeys, $key?.pub].filter(Boolean) as string[]));
	}

	async function fetchRelayAdmin() {
		if (!relayUrl) return;
		try {
			const response = await fetch(relayInfoUrl(relayUrl), {
				headers: { accept: 'application/nostr+json' }
			});
			if (!response.ok) return;
			const info = await response.json();
			relayAdminPubkeys = Array.from(
				new Set([
					...stringsFrom(info.pubkey),
					...stringsFrom(info.admin_pubkeys),
					...stringsFrom(info.admins),
					...stringsFrom(info.admin_pubkey)
				])
			);
		} catch {
			relayAdminPubkeys = [];
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

	function upsertRoleAward(parsedEvent: ParsedEvent) {
		const award = parseRoleAward(parsedEvent);
		if (!award) return;
		upsertRoleAwardValue(award);
	}

	function upsertRoleAwardValue(award: RoleAward) {
		const existingIndex = roleAwards.findIndex((item) => item.recipient === award.recipient);
		if (existingIndex !== -1) {
			if (award.createdAt <= roleAwards[existingIndex].createdAt) return;
			roleAwards = roleAwards.map((item, index) => (index === existingIndex ? award : item));
		} else {
			roleAwards = [...roleAwards, award];
		}
	}

	function handleRoleDeletion(parsedEvent: ParsedEvent) {
		const deleter = parsedEvent.pubkey();
		if (!deleter) return;
		const tags = parsedEventTags(parsedEvent);
		const deletedAddresses = new Set(
			tags
				.filter((tag) => tag[0] === 'a' && tag[1]?.startsWith('30009:'))
				.map((tag) => tag[1])
				.filter((address) => address.split(':')[1] === deleter)
		);
		const deletedAwardIds = new Set(
			tags
				.filter((tag) => tag[0] === 'e')
				.map((tag) => tag[1])
				.filter((id): id is string => Boolean(id))
		);
		if (deletedAddresses.size) {
			roleDefinitions = roleDefinitions.filter((role) => !deletedAddresses.has(role.address));
		}
		if (deletedAwardIds.size) {
			roleAwards = roleAwards.filter(
				(award) => award.pubkey !== deleter || !deletedAwardIds.has(award.id)
			);
		}
	}

	function subscribeMembers() {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		roleDefinitions = [];
		roleAwards = [];
		loadingMembers = Boolean(relayUrl);
		if (!relayUrl) {
			loadingMembers = false;
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
				loadingMembers = false;
				if (parsedEvent.kind() === 5) {
					handleRoleDeletion(parsedEvent);
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
				loadingMembers = false;
				if (parsedEvent.kind() === 5) {
					handleRoleDeletion(parsedEvent);
					return;
				}
				if (parsedEvent.kind() !== 8) return;
				for (const award of parseRoleAwardsFromKind8(parsedEvent)) {
					upsertRoleAwardValue(award);
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
			loadingMembers = false;
		}, 500);
	}

	function syncMemberProfiles(pubkeys: string[]) {
		const nextKey = [...pubkeys].sort().join(',');
		if (nextKey === memberProfileKey) return;
		memberProfileKey = nextKey;
		unsubscribeMemberProfiles?.();
		memberProfiles = [];
		if (!pubkeys.length || !relayUrl) return;

		unsubscribeMemberProfiles = useSubscription(
			'admin_member_profiles_' + relayUrl + '_' + nextKey,
			[
				{
					kinds: [0],
					authors: pubkeys,
					limit: pubkeys.length,
					relays: [relayUrl],
					cacheFirst: true
				}
			],
			(message: WorkerMessage) => {
				const profile = isKind0(message);
				if (!profile?.pubkey()) return;
				memberProfiles = [
					...memberProfiles.filter((candidate) => candidate.pubkey() !== profile.pubkey()),
					profile
				];
			},
			{ bytesPerEvent: 5 * 1024 }
		);
	}

	function buildMemberRows(definitions: RoleDefinition[], awards: RoleAward[]): MemberRow[] {
		const definitionsByAddress = new Map(
			definitions.map((definition) => [definition.address, definition])
		);
		const rows = new Map<string, MemberRow>();
		const timestamp = now();
		for (const adminPubkey of defaultAdminPubkeys()) {
			rows.set(adminPubkey, {
				pubkey: adminPubkey,
				roles: [{ label: 'Admin', tone: 'purple' }],
				status: 'Active',
				statusTone: 'green',
				expires: 'No expiration'
			});
		}

		for (const award of awards) {
			const role = definitionsByAddress.get(award.roleAddress);
			const roleName = role?.name || roleNameFromAddress(award.roleAddress);
			const row =
				rows.get(award.recipient) ||
				({
					pubkey: award.recipient,
					roles: [],
					status: 'Active',
					statusTone: 'green',
					expires: 'No expiration'
				} satisfies MemberRow);

			row.roles.push({
				label: roleName,
				tone: roleTone(roleName),
				expiresAt: award.expiresAt
			});
			row.roles = dedupeRoles(row.roles);
			rows.set(award.recipient, row);
		}

		for (const row of rows.values()) {
			const membershipRole = row.roles.find((role) => role.label.toLowerCase() === 'member');
			const membershipStatusRoles = membershipRole ? [membershipRole] : row.roles;
			const activeRoles = membershipStatusRoles.filter(
				(role) => !role.expiresAt || role.expiresAt > timestamp
			);
			const soonestExpiration = activeRoles
				.map((role) => role.expiresAt)
				.filter((expiresAt): expiresAt is number => Boolean(expiresAt))
				.sort((a, b) => a - b)[0];

			if (!activeRoles.length) {
				row.status = 'Expired';
				row.statusTone = 'red';
				row.expires = 'Expired';
			} else if (soonestExpiration && soonestExpiration < timestamp + 30 * 24 * 60 * 60) {
				row.status = 'Expiring soon';
				row.statusTone = 'orange';
				row.expires = formatTimestamp(soonestExpiration);
			} else {
				row.status = 'Active';
				row.statusTone = 'green';
				row.expires = soonestExpiration ? formatTimestamp(soonestExpiration) : 'No expiration';
			}
		}

		return Array.from(rows.values()).sort((a, b) => a.pubkey.localeCompare(b.pubkey));
	}

	function roleNameFromAddress(address: string) {
		const d = address.split(':').slice(2).join(':') || 'Member';
		return d
			.split(/[-_\s]+/)
			.filter(Boolean)
			.map((part) => part[0]?.toUpperCase() + part.slice(1))
			.join(' ');
	}

	function dedupeRoles(roles: MemberRow['roles']) {
		const seen = new Set<string>();
		return roles.filter((role) => {
			const key = `${role.label}:${role.expiresAt || 'none'}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	function roleTone(roleName: string): Tone {
		const normalized = roleName.toLowerCase();
		if (normalized === 'admin') return 'purple';
		if (normalized === 'coach') return 'green';
		if (normalized === 'volunteer') return 'blue';
		return 'gray';
	}

	function formatTimestamp(timestamp: number) {
		return new Date(timestamp * 1000).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function memberLabel(pubkey: string) {
		return `Member ${pubkey.slice(0, 6).toUpperCase()}`;
	}

	function normalizePubkey(value: string) {
		const trimmed = value.trim();
		if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
		try {
			const decoded = nip19.decode(trimmed);
			if (decoded.type === 'npub' && typeof decoded.data === 'string') return decoded.data;
		} catch {
			return '';
		}
		return '';
	}

	function openActionMenu(event: MouseEvent, member: MemberRow) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		actionMenuTop = rect.bottom + 170 > window.innerHeight ? Math.max(12, rect.top - 166) : rect.bottom + 6;
		actionMenuRight = Math.max(12, window.innerWidth - rect.right);
		actionMember = actionMember?.pubkey === member.pubkey ? undefined : member;
	}

	function openAssignModal(member: MemberRow) {
		actionMember = undefined;
		newMemberPubkey = member.pubkey;
		showAssignModal = true;
	}

	function closeAssignModal() {
		showAssignModal = false;
		newMemberPubkey = '';
		requiresRenewal = false;
		expiresAtDate = '';
	}

	function confirmBan(member: MemberRow) {
		actionMember = undefined;
		banReason = '';
		memberToBan = member;
	}

	function viewActionMember() {
		if (!actionMember) return;
		openMemberProfile(actionMember);
		actionMember = undefined;
	}

	function assignActionMember() {
		if (actionMember) openAssignModal(actionMember);
	}

	function banActionMember() {
		if (actionMember && !actionMember.roles.some((role) => role.label === 'Admin')) {
			confirmBan(actionMember);
		}
	}

	async function banMember() {
		if (!memberToBan || !$key?.pub || !relayUrl || banningMember) return;
		banningMember = true;
		publishStatus = '';
		const endpoint = relayInfoUrl(relayUrl);
		const body = JSON.stringify({
			method: 'banpubkey',
			params: [memberToBan.pubkey, banReason.trim()]
		});
		try {
			const authorization = await makeInviteAuthorization(relayUrl, body, $key.pub);
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					authorization,
					'content-type': 'application/nostr+json+rpc'
				},
				body
			});
			const result = await response.json().catch(() => undefined);
			if (!response.ok || result?.error || result?.result !== true) {
				throw new Error(result?.error || 'This relay did not accept the ban request.');
			}
			publishStatus = 'Member banned from the community relay';
			memberToBan = undefined;
		} catch (error) {
			publishStatus = error instanceof Error ? error.message : 'Could not ban this member.';
		} finally {
			banningMember = false;
		}
	}

	function assignRole() {
		if (!canAssignRole) return;
		const adminPubkey = $key?.pub;
		const recipient = normalizePubkey(newMemberPubkey);
		if (!adminPubkey || !recipient) return;
		const expiresAt =
			requiresRenewal && expiresAtDate
				? Math.floor(new Date(expiresAtDate).getTime() / 1000)
				: undefined;
		const event: EventTemplate = {
			kind: 8,
			content: '',
			created_at: now(),
			tags: buildRoleAwardTags({
				roleAddress: selectedRoleAddress,
				recipient,
				expiresAt
			})
		};

		publishUnsubscribe?.();
		publishStatus = 'Saving role assignment...';
		publishUnsubscribe = usePublish(
			'admin_role_award_' + relayUrl + '_' + recipient + '_' + selectedRoleAddress,
			event,
			() => {
				publishStatus = 'Role assignment saved';
			},
			{
				trackStatus: true,
				defaultRelays: [relayUrl]
			}
		);

		roleAwards = [
			...roleAwards,
			{
				id: `${selectedRoleAddress}:${recipient}:${now()}`,
				pubkey: adminPubkey,
				roleAddress: selectedRoleAddress,
				recipient,
				expiresAt,
				createdAt: now()
			}
		];
		newMemberPubkey = '';
		requiresRenewal = false;
		expiresAtDate = '';
		closeAssignModal();
	}

	onDestroy(() => {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		unsubscribeMemberProfiles?.();
		publishUnsubscribe?.();
	});
</script>

<svelte:head>
	<title>People - Nuts</title>
</svelte:head>

<main class="px-4 py-8 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-[1500px]">
		<a
			href={resolve('/admin')}
			class="inline-flex items-center gap-2 rounded-lg text-sm font-bold text-stone-600 transition hover:text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
		>
			<ArrowLeft size={17} />
			Dashboard
		</a>

		<div class="mt-7 flex flex-wrap items-end justify-between gap-5">
			<div>
				<h1 class="text-4xl font-black leading-tight text-[#151514]">People</h1>
				<p class="mt-2 text-lg font-medium leading-8 text-stone-600">
					Manage your members, roles, and access from one place.
				</p>
			</div>
		</div>

		<nav
			class="mt-7 flex w-fit items-center gap-1 rounded-xl bg-stone-100 p-1"
			aria-label="People views"
		>
			<button
				type="button"
				class={`rounded-lg px-5 py-2.5 text-sm font-black transition ${peopleView === 'members' ? 'bg-white text-emerald-950 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
				aria-current={peopleView === 'members' ? 'page' : undefined}
				on:click={() => (peopleView = 'members')}
				><UsersRound size={17} class="mr-2 inline" /> Members</button
			>
			<button
				type="button"
				class={`rounded-lg px-5 py-2.5 text-sm font-black transition ${peopleView === 'roles' ? 'bg-white text-emerald-950 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
				aria-current={peopleView === 'roles' ? 'page' : undefined}
				on:click={() => (peopleView = 'roles')}
				><BadgeCheck size={17} class="mr-2 inline" /> Roles
				<span class="ml-1 text-stone-400">{roleDefinitions.length}</span></button
			>
		</nav>

		{#if peopleView === 'members'}
			{#if publishStatus}
				<p
					class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
				>
					{publishStatus}
				</p>
			{/if}

			<section
				class="mt-7 overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm shadow-stone-950/5"
			>
				<div class="flex flex-wrap items-center justify-between gap-4 p-5 lg:p-7">
					<div>
						<h2 class="text-2xl font-black">Members</h2>
						<p class="mt-1 text-base font-medium text-stone-600">
							{#if loadingMembers}
								Loading members...
							{:else}
								{filteredMemberRows.length} community members.
							{/if}
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-3">
						<label
							class="grid h-11 min-w-72 grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 shadow-sm shadow-stone-950/5 focus-within:ring-2 focus-within:ring-emerald-800/30"
							><Search size={18} class="text-stone-500" /><input
								class="min-w-0 bg-transparent text-base font-medium outline-none"
								placeholder="Search member"
								bind:value={search}
							/></label
						>
					</div>
				</div>

				<div class="overflow-x-auto">
					<table class="w-full min-w-[940px] border-collapse text-left">
						<thead class="bg-stone-50 text-sm font-black text-stone-600">
							<tr>
								<th class="px-7 py-5">Member</th>
								<th class="px-5 py-5">Assigned roles</th>
								<th class="px-5 py-5">Status</th>
								<th class="px-5 py-5">Expires</th>
								<th class="w-16 px-5 py-5"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-stone-200">
							{#if !filteredMemberRows.length && !loadingMembers}
								<tr>
									<td colspan="5" class="px-7 py-12">
										<p class="text-base font-black text-stone-700">No members found</p>
										<p class="mt-1 text-sm font-medium text-stone-500">
											Invite someone to add them to this community.
										</p>
									</td>
								</tr>
							{/if}
							{#each filteredMemberRows as member (member.pubkey)}
								<tr
									class="cursor-pointer transition hover:bg-stone-50/70 focus-within:bg-stone-50/70"
									role="button"
									tabindex="0"
									aria-label={`View ${memberLabel(member.pubkey)}'s profile`}
									on:click={() => openMemberProfile(member)}
									on:keydown={(event) => handleMemberRowKeydown(event, member)}
								>
									<td class="px-7 py-5">
										<div class="flex items-center gap-4">
											<Avatar pubkey={member.pubkey} size="xl" />
											<div class="min-w-0">
												<p class="truncate text-base font-black">
													<User
														pubkey={member.pubkey}
														relays={relayUrl ? [relayUrl] : []}
														link={false}
													/>
												</p>
											</div>
										</div>
									</td>
									<td class="px-5 py-5">
										<div class="flex flex-wrap gap-2">
											{#each member.roles as role (`${member.pubkey}-${role.label}-${role.expiresAt || 'none'}`)}
												<span
													class={`rounded-md px-2.5 py-1 text-sm font-bold ${toneClasses[role.tone]}`}
												>
													{role.label}
												</span>
											{/each}
											{#if !member.roles.length}<span
													class="text-sm font-semibold text-stone-400">No role assigned</span
												>{/if}
										</div>
									</td>
									<td class="px-5 py-5">
										<span
											class="inline-flex items-center gap-3 text-base font-medium text-stone-700"
										>
											<span class={`h-2.5 w-2.5 rounded-full ${dotClasses[member.statusTone]}`}
											></span>
											{member.status}
										</span>
									</td>
									<td class="px-5 py-5 text-base text-stone-600">{member.expires}</td>
									<td class="px-5 py-5">
										<button
											type="button"
											aria-label={`More actions for ${memberLabel(member.pubkey)}`}
											class="grid h-9 w-9 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
											aria-expanded={actionMember?.pubkey === member.pubkey}
											on:click|stopPropagation={(event) => openActionMenu(event, member)}
											on:keydown|stopPropagation
										>
											<MoreHorizontal size={22} />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{:else}
			<RolesPage embedded={true} />
		{/if}
	</div>
</main>

<svelte:window
	on:click={() => (actionMember = undefined)}
	on:keydown={(event) => {
		if (event.key === 'Escape') actionMember = undefined;
	}}
/>

{#if actionMember}
	<div
		class="fixed z-40 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl shadow-stone-950/15"
		style:top={`${actionMenuTop}px`}
		style:right={`${actionMenuRight}px`}
		role="menu"
		tabindex="-1"
		on:click|stopPropagation
		on:keydown|stopPropagation
	>
		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-stone-700 transition hover:bg-stone-50"
			role="menuitem"
			on:click={viewActionMember}
		><Eye size={17} /> View member</button
		>
		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-stone-700 transition hover:bg-stone-50 disabled:text-stone-400"
			role="menuitem"
			disabled={!roleDefinitions.length}
			on:click={assignActionMember}
		><UserCog size={17} /> Assign role</button
		>
		<div class="my-1 border-t border-stone-100"></div>
		<button
			type="button"
			role="menuitem"
			disabled={actionMember.roles.some((role) => role.label === 'Admin')}
			title={actionMember.roles.some((role) => role.label === 'Admin')
				? 'Relay administrators cannot be banned here'
				: undefined}
			on:click={banActionMember}
			class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:bg-transparent"
		><ShieldBan size={17} /> Ban member</button
		>
	</div>
{/if}

{#if memberToBan}
	<div class="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-5 py-8 backdrop-blur-sm">
		<div
			class="w-full max-w-lg rounded-2xl border border-stone-200 bg-[#fbfaf7] p-6 shadow-2xl shadow-stone-950/20"
			aria-modal="true"
			role="dialog"
			aria-labelledby="ban-member-title"
		>
			<div class="flex items-start gap-4">
				<div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700">
					<ShieldBan size={22} />
				</div>
				<div>
					<h2 id="ban-member-title" class="text-2xl font-black">Ban member?</h2>
					<p class="mt-2 text-base leading-6 text-stone-600">
						They will be blocked from the community relay. This uses the relay's NIP-86
						moderation API.
					</p>
				</div>
			</div>

			<div class="mt-5 flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3">
				<Avatar pubkey={memberToBan.pubkey} size="lg" />
				<span class="min-w-0 truncate font-black">
					<User pubkey={memberToBan.pubkey} relays={relayUrl ? [relayUrl] : []} link={false} />
				</span>
			</div>

			<label class="mt-5 grid gap-2">
				<span class="text-sm font-black text-stone-600">Reason <span class="font-medium">(optional)</span></span>
				<input
					class="rounded-xl border border-stone-200 bg-white px-4 py-3 text-base font-semibold outline-none focus:border-rose-700 focus:ring-2 focus:ring-rose-700/20"
					bind:value={banReason}
					placeholder="Why is this member being banned?"
				/>
			</label>

			<div class="mt-7 flex justify-end gap-3 border-t border-stone-200 pt-5">
				<button
					type="button"
					class="h-11 rounded-xl border border-stone-200 bg-white px-5 font-black transition hover:bg-stone-50"
					disabled={banningMember}
					on:click={() => (memberToBan = undefined)}
				>Cancel</button
				>
				<button
					type="button"
					class="h-11 rounded-xl bg-rose-700 px-5 font-black text-white transition hover:bg-rose-800 disabled:cursor-wait disabled:opacity-60"
					disabled={banningMember}
					on:click={banMember}
				>{banningMember ? 'Banning…' : 'Ban member'}</button
				>
			</div>
		</div>
	</div>
{/if}

{#if selectedMember}
	<MemberProfileModal
		pubkey={selectedMember.pubkey}
		relays={relayUrl ? [relayUrl] : []}
		roles={selectedMember.roles}
		status={selectedMember.status}
		expires={selectedMember.expires}
		on:close={() => (selectedMember = undefined)}
	/>
{/if}

{#if showAssignModal}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-5 py-8 backdrop-blur-sm"
	>
		<div
			class="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-stone-200 bg-[#fbfaf7] p-6 shadow-2xl shadow-stone-950/20"
			aria-modal="true"
			role="dialog"
			aria-labelledby="assign-role-title"
		>
			<h2 id="assign-role-title" class="text-2xl font-black">Assign role</h2>
			<p class="mt-2 text-base text-stone-600">
				Choose a role for this member. Roles can be permanent or require renewal.
			</p>

			<div class="mt-6 grid gap-5">
				<div class="grid gap-2">
					<span class="text-sm font-black text-stone-600">Member</span>
					{#if newMemberPubkey}
						<div
							class="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3"
						>
							<Avatar pubkey={newMemberPubkey} size="lg" />
							<span class="min-w-0 flex-1 truncate text-base font-black text-stone-900">
								<User pubkey={newMemberPubkey} relays={relayUrl ? [relayUrl] : []} link={false} />
							</span>
						</div>
					{/if}
				</div>

				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-600">Role</span>
					<select
						class="rounded-xl border border-stone-200 bg-white px-4 py-3 text-base font-bold outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20"
						bind:value={selectedRoleAddress}
					>
						{#each roleDefinitions as role (role.address)}
							<option value={role.address}>{role.name}</option>
						{/each}
					</select>
				</label>

				<div class="rounded-xl border border-stone-200 bg-white p-4">
					<label class="flex cursor-pointer items-center justify-between gap-5">
						<span>
							<span class="block text-sm font-black text-stone-700">Require renewal</span>
							<span class="mt-1 block text-sm font-medium text-stone-500">
								{requiresRenewal
									? 'The role expires on the selected date.'
									: 'The role is awarded indefinitely.'}
							</span>
						</span>
						<input
							class="h-5 w-5 shrink-0 accent-emerald-800"
							type="checkbox"
							bind:checked={requiresRenewal}
						/>
					</label>

					{#if requiresRenewal}
						<label class="mt-4 grid gap-2 border-t border-stone-200 pt-4">
							<span class="text-sm font-black text-stone-600">Renewal date</span>
							<div
								class="grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 focus-within:border-emerald-800 focus-within:ring-2 focus-within:ring-emerald-800/20"
							>
								<CalendarClock size={18} class="text-stone-500" />
								<input
									class="min-w-0 bg-transparent py-3 text-base font-bold outline-none"
									type="date"
									bind:value={expiresAtDate}
								/>
							</div>
							{#if expiresAtDate && !hasValidRenewalDate}
								<span class="text-sm font-bold text-rose-700">Choose a future date.</span>
							{/if}
						</label>
					{/if}
				</div>
			</div>

			<div class="mt-7 flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
				<button
					type="button"
					class="h-11 rounded-xl border border-stone-200 bg-white px-5 font-black transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
					on:click={closeAssignModal}
				>
					Cancel
				</button>
				<button
					type="button"
					class="h-11 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none"
					disabled={!canAssignRole}
					on:click={assignRole}
				>
					Assign role
				</button>
			</div>
		</div>
	</div>
{/if}
