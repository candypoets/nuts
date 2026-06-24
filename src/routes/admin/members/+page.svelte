<script lang="ts">
	import { resolve } from '$app/paths';
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
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isKind8, isParsedEvent } from '@candypoets/nipworker/utils';
	import { ArrowLeft, CalendarClock, MoreHorizontal, Search, UserPlus } from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import { nip19, type EventTemplate } from 'nostr-tools';
	import { key } from 'src/controller';
	import {
		buildRoleAwardTags,
		parseRoleAward,
		parseRoleAwardsFromKind8,
		parseRoleDefinition,
		type RoleAward,
		type RoleDefinition
	} from 'src/lib/nip58Roles';
	import { now } from 'src/lib/period';
	import { onDestroy } from 'svelte';

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
	let loadedCommunityId = '';
	let roleDefinitions: RoleDefinition[] = [];
	let roleAwards: RoleAward[] = [];
	let loadingMembers = true;
	let showAssignModal = false;
	let newMemberPubkey = '';
	let selectedRoleAddress = '';
	let expiresAtDate = '';
	let search = '';
	let publishStatus = '';
	let unsubscribeRoleDefinitions: (() => void) | undefined;
	let unsubscribeRoleAwards: (() => void) | undefined;
	let publishUnsubscribe: (() => void) | undefined;

	$: communityId = $page.params.community_id;
	$: if (communityId !== loadedCommunityId) {
		loadedCommunityId = communityId || '';
		loadCommunityRelay();
		subscribeMembers();
		fetchRelayAdmin();
	}
	$: if (!selectedRoleAddress && roleDefinitions[0]) {
		selectedRoleAddress = roleDefinitions[0].address;
	}
	$: memberRows = buildMemberRows(roleDefinitions, roleAwards);
	$: filteredMemberRows = memberRows.filter((member) =>
		member.pubkey.toLowerCase().includes(search.trim().toLowerCase())
	);
	$: canAssignRole =
		relayUrl && Boolean(normalizePubkey(newMemberPubkey)) && selectedRoleAddress && $key?.pub;

	function loadCommunityRelay() {
		const rawRelayUrl = communityId ? decodeURIComponent(communityId) : '';
		relayUrl = rawRelayUrl ? normalizeURL(rawRelayUrl) : '';
		relayAdminPubkeys = [];
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
				loadingMembers = false;
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
				loadingMembers = false;
				for (const award of parseRoleAwardsFromKind8(parsedEvent, kind8)) {
					upsertRoleAwardValue(award);
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
			loadingMembers = false;
		}, 500);
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
			const activeRoles = row.roles.filter((role) => !role.expiresAt || role.expiresAt > timestamp);
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

	function memberInitials(pubkey: string) {
		return pubkey.slice(0, 2).toUpperCase();
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

	function openAssignModal() {
		showAssignModal = true;
	}

	function closeAssignModal() {
		showAssignModal = false;
	}

	function assignRole() {
		if (!canAssignRole) return;
		const adminPubkey = $key?.pub;
		const recipient = normalizePubkey(newMemberPubkey);
		if (!adminPubkey || !recipient) return;
		const expiresAt = expiresAtDate
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
		expiresAtDate = '';
		closeAssignModal();
	}

	onDestroy(() => {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		publishUnsubscribe?.();
	});
</script>

<svelte:head>
	<title>Members - Nuts</title>
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
				<h1 class="text-4xl font-black leading-tight text-[#151514]">Members</h1>
				<p class="mt-2 text-lg font-medium leading-8 text-stone-600">
					Manage member roles and renewal dates.
				</p>
			</div>
			<button
				type="button"
				class="inline-flex h-11 items-center gap-3 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none"
				disabled={!roleDefinitions.length}
				on:click={openAssignModal}
			>
				<UserPlus size={20} />
				Award role
			</button>
		</div>

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
					<h2 class="text-2xl font-black">Role holders</h2>
					<p class="mt-1 text-base font-medium text-stone-600">
						{#if loadingMembers}
							Loading role assignments...
						{:else}
							{filteredMemberRows.length} members with role assignments.
						{/if}
					</p>
				</div>
				<label
					class="grid h-11 min-w-72 grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 shadow-sm shadow-stone-950/5 focus-within:ring-2 focus-within:ring-emerald-800/30"
				>
					<Search size={18} class="text-stone-500" />
					<input
						class="min-w-0 bg-transparent text-base font-medium outline-none"
						placeholder="Search member"
						bind:value={search}
					/>
				</label>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full min-w-[940px] border-collapse text-left">
					<thead class="bg-stone-50 text-sm font-black text-stone-600">
						<tr>
							<th class="px-7 py-5">Member</th>
							<th class="px-5 py-5">Role(s)</th>
							<th class="px-5 py-5">Status</th>
							<th class="px-5 py-5">Expires</th>
							<th class="w-16 px-5 py-5"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-stone-200">
						{#if !filteredMemberRows.length && !loadingMembers}
							<tr>
								<td colspan="5" class="px-7 py-12">
									<p class="text-base font-black text-stone-700">No role assignments found</p>
									<p class="mt-1 text-sm font-medium text-stone-500">
										Award a role to make members appear in this table.
									</p>
								</td>
							</tr>
						{/if}
						{#each filteredMemberRows as member (member.pubkey)}
							<tr class="transition hover:bg-stone-50/70">
								<td class="px-7 py-5">
									<div class="flex items-center gap-4">
										<div
											class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-950 text-sm font-bold text-white"
										>
											{memberInitials(member.pubkey)}
										</div>
										<div>
											<p class="text-base font-black">{memberLabel(member.pubkey)}</p>
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
									</div>
								</td>
								<td class="px-5 py-5">
									<span class="inline-flex items-center gap-3 text-base font-medium text-stone-700">
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
	</div>
</main>

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
				Choose a role for this member and optionally set a renewal date.
			</p>

			<div class="mt-6 grid gap-5">
				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-600">Member key</span>
					<input
						class="rounded-xl border border-stone-200 bg-white px-4 py-3 text-base font-bold outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20"
						bind:value={newMemberPubkey}
						placeholder="Paste member key"
					/>
				</label>

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

				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-600">Renewal date</span>
					<div
						class="grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 focus-within:ring-2 focus-within:ring-emerald-800/20"
					>
						<CalendarClock size={18} class="text-stone-500" />
						<input
							class="min-w-0 bg-transparent py-3 text-base font-bold outline-none"
							type="date"
							bind:value={expiresAtDate}
						/>
					</div>
				</label>
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
