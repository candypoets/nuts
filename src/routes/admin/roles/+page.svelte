<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { type ParsedEvent, type RequestObject, type WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isParsedEvent } from '@candypoets/nipworker/utils';
	import {
		ArrowLeft,
		CalendarDays,
		Camera,
		X,
		FileText,
		MessageSquare,
		Plus,
		ShieldCheck,
		SlidersHorizontal,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import type { EventTemplate } from 'nostr-tools';
	import { key } from 'src/controller';
	import {
		buildRoleDefinitionTags,
		parseRoleAward,
		parseRoleDefinition,
		roleDFromName,
		type RoleAward,
		type RoleDefinition
	} from 'src/lib/nip58Roles';
	import { now } from 'src/lib/period';
	import { onDestroy } from 'svelte';

	type PermissionKey = 'posts' | 'media' | 'events' | 'invites' | 'moderation' | 'settings';

	type Role = {
		name: string;
		count: number;
		description: string;
		address?: string;
		d?: string;
		permissions: Record<PermissionKey, boolean>;
	};

	const actions: Array<{
		key: PermissionKey;
		label: string;
		description: string;
		icon: typeof MessageSquare;
	}> = [
		{
			key: 'posts',
			label: 'Publish posts',
			description: 'Share updates in the community feed.',
			icon: MessageSquare
		},
		{
			key: 'media',
			label: 'Post pictures',
			description: 'Upload photos and other media.',
			icon: Camera
		},
		{
			key: 'events',
			label: 'Create events',
			description: 'Publish meetups and community events.',
			icon: CalendarDays
		},
		{
			key: 'invites',
			label: 'Invite members',
			description: 'Create invite links and approve joins.',
			icon: UsersRound
		},
		{
			key: 'moderation',
			label: 'Moderate',
			description: 'Remove posts and manage member behavior.',
			icon: ShieldCheck
		},
		{
			key: 'settings',
			label: 'Community settings',
			description: 'Change roles, permissions and community settings.',
			icon: SlidersHorizontal
		}
	];

	let roleDefinitions: RoleDefinition[] = [];
	let roleAwards: RoleAward[] = [];
	let roles: Role[] = [];
	let relayUrl = '';
	let relayAdminPubkeys: string[] = [];
	let loadedCommunityId = '';
	let loadingRoles = true;
	let publishStatus = '';
	let unsubscribeRoleDefinitions: (() => void) | undefined;
	let unsubscribeRoleAwards: (() => void) | undefined;
	let publishUnsubscribe: (() => void) | undefined;

	let showNewRoleModal = false;
	let newRoleName = '';
	let newRoleDescription = '';
	let newRolePermissions: Record<PermissionKey, boolean> = {
		posts: true,
		media: true,
		events: false,
		invites: false,
		moderation: false,
		settings: false
	};

	$: communityId = $page.params.community_id;
	$: if (communityId !== loadedCommunityId) {
		loadedCommunityId = communityId || '';
		loadCommunityRelay();
		subscribeRoles();
		fetchRelayAdmin();
	}
	$: roles = rolesFromDefinitions(roleDefinitions);
	$: roleLimitReached = roles.length >= 4;
	$: canCreateRole =
		newRoleName.trim().length > 1 &&
		!roleLimitReached &&
		!roles.some((role) => role.name.toLowerCase() === newRoleName.trim().toLowerCase());

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

	function rolesFromDefinitions(definitions: RoleDefinition[]): Role[] {
		const adminDefinition = definitions.find(
			(definition) => definition.name.toLowerCase() === 'admin'
		);
		const mappedRoles = definitions.map((definition) => ({
			name: definition.name,
			count: activeAwardCount(definition.address),
			description: definition.description,
			address: definition.address,
			d: definition.d,
			permissions: permissionsForRole(definition.name)
		}));

		if (adminDefinition) {
			return mappedRoles.map((role) =>
				role.name.toLowerCase() === 'admin'
					? {
							...role,
							count: Math.max(role.count, defaultAdminPubkeys().length)
						}
					: role
			);
		}

		return [
			{
				name: 'Admin',
				count: defaultAdminPubkeys().length,
				description: 'Full community management access.',
				permissions: permissionsForRole('admin')
			},
			...mappedRoles
		];
	}

	function permissionsForRole(roleName: string): Record<PermissionKey, boolean> {
		const normalized = roleName.toLowerCase();
		if (normalized === 'admin') {
			return {
				posts: true,
				media: true,
				events: true,
				invites: true,
				moderation: true,
				settings: true
			};
		}
		return {
			posts: true,
			media: true,
			events: normalized === 'coach',
			invites: false,
			moderation: false,
			settings: false
		};
	}

	function activeAwardCount(roleAddress: string) {
		const timestamp = now();
		return new Set(
			roleAwards
				.filter((award) => award.roleAddress === roleAddress)
				.filter((award) => !award.expiresAt || award.expiresAt > timestamp)
				.map((award) => award.recipient)
		).size;
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
		loadingRoles = false;
	}

	function upsertRoleAward(parsedEvent: ParsedEvent) {
		const award = parseRoleAward(parsedEvent);
		if (!award) return;
		const existingIndex = roleAwards.findIndex(
			(item) => item.roleAddress === award.roleAddress && item.recipient === award.recipient
		);
		if (existingIndex !== -1) {
			if (award.createdAt <= roleAwards[existingIndex].createdAt) return;
			roleAwards = roleAwards.map((item, index) => (index === existingIndex ? award : item));
		} else {
			roleAwards = [...roleAwards, award];
		}
	}

	function subscribeRoles() {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		roleDefinitions = [];
		roleAwards = [];
		loadingRoles = Boolean(relayUrl);
		if (!relayUrl) {
			loadingRoles = false;
			return;
		}

		const roleDefinitionRequests: RequestObject[] = [
			{
				kinds: [30009],
				limit: 100,
				relays: [relayUrl],
				cacheFirst: true
			}
		];
		const roleAwardRequests: RequestObject[] = [
			{
				kinds: [8],
				limit: 500,
				relays: [relayUrl],
				cacheFirst: true
			}
		];

		unsubscribeRoleDefinitions = useSubscription(
			'admin_role_definitions_' + relayUrl,
			roleDefinitionRequests,
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				upsertRoleDefinition(parsedEvent);
			},
			{ bytesPerEvent: 10 * 1024 }
		);

		unsubscribeRoleAwards = useSubscription(
			'admin_role_awards_' + relayUrl,
			roleAwardRequests,
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				upsertRoleAward(parsedEvent);
			},
			{ bytesPerEvent: 10 * 1024 }
		);

		window.setTimeout(() => {
			loadingRoles = false;
		}, 1800);
	}

	function togglePermission(roleName: string, key: PermissionKey) {
		roles = roles.map((role) =>
			role.name === roleName
				? {
						...role,
						permissions: {
							...role.permissions,
							[key]: !role.permissions[key]
						}
					}
				: role
		);
	}

	function toggleNewRolePermission(key: PermissionKey) {
		newRolePermissions = {
			...newRolePermissions,
			[key]: !newRolePermissions[key]
		};
	}

	function openNewRoleModal() {
		if (roleLimitReached) return;
		showNewRoleModal = true;
	}

	function closeNewRoleModal() {
		showNewRoleModal = false;
	}

	function createRole() {
		if (!canCreateRole) return;
		const roleName = newRoleName.trim();
		const roleDescription = newRoleDescription.trim() || 'Custom community role.';
		const d = roleDFromName(roleName);
		const pubkey = $key?.pub;
		if (!relayUrl || !pubkey || !d) return;

		const event: EventTemplate = {
			kind: 30009,
			content: roleDescription,
			created_at: now(),
			tags: buildRoleDefinitionTags({
				d,
				name: roleName,
				description: roleDescription
			})
		};

		publishUnsubscribe?.();
		publishStatus = 'Publishing role...';
		publishUnsubscribe = usePublish(
			'admin_role_definition_' + relayUrl + '_' + d,
			event,
			() => {
				publishStatus = 'Role published';
			},
			{
				trackStatus: true,
				defaultRelays: [relayUrl]
			}
		);

		roleDefinitions = [
			...roleDefinitions,
			{
				address: `30009:${pubkey}:${d}`,
				pubkey,
				d,
				name: roleName,
				description: roleDescription,
				createdAt: now()
			}
		].sort((a, b) => a.name.localeCompare(b.name));
		newRoleName = '';
		newRoleDescription = '';
		newRolePermissions = {
			posts: true,
			media: true,
			events: false,
			invites: false,
			moderation: false,
			settings: false
		};
		closeNewRoleModal();
	}

	onDestroy(() => {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		publishUnsubscribe?.();
	});
</script>

<svelte:head>
	<title>Roles - Nuts</title>
</svelte:head>

<main class="px-5 py-7 sm:px-8 lg:px-10">
	<div class="mx-auto max-w-[1600px]">
		<a
			href={resolve('/admin')}
			class="inline-flex items-center gap-2 text-sm font-bold text-stone-600"
		>
			<ArrowLeft size={17} />
			Dashboard
		</a>

		<div class="mt-7 flex flex-wrap items-end justify-between gap-5">
			<div>
				<h1 class="text-3xl font-bold tracking-normal text-[#151514]">Roles</h1>
				<p class="mt-2 text-lg text-stone-600">
					Choose what each role can publish and manage in the community.
				</p>
			</div>
			<button
				type="button"
				class="inline-flex h-12 items-center gap-3 rounded-xl bg-emerald-800 px-5 font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
				disabled={roleLimitReached}
				on:click={openNewRoleModal}
			>
				<Plus size={20} />
				New role
			</button>
		</div>

		<p class="mt-4 text-sm font-bold text-stone-500">
			{#if loadingRoles}
				Loading community roles...
			{:else}
				{roles.length} of 4 roles used. Guests are handled automatically outside role permissions.
			{/if}
		</p>
		{#if publishStatus}
			<p class="mt-2 text-sm font-bold text-emerald-700">{publishStatus}</p>
		{/if}

		<section class="mt-7 grid gap-5 lg:grid-cols-4">
			{#each roles as role (role.name)}
				<article class="rounded-2xl border border-black/10 bg-white/80 p-6 shadow-sm">
					<div class="flex items-start justify-between gap-4">
						<div>
							<h2 class="text-2xl font-bold">{role.name}</h2>
							<p class="mt-2 text-base leading-7 text-stone-600">{role.description}</p>
						</div>
						<span class="rounded-full bg-stone-100 px-3 py-1 text-sm font-black text-stone-700">
							{role.count}
						</span>
					</div>
				</article>
			{/each}
		</section>

		<section class="mt-7 overflow-hidden rounded-2xl border border-black/10 bg-white/80 shadow-sm">
			<div class="border-b border-black/10 p-5 lg:p-7">
				<h2 class="text-2xl font-bold">Access rights</h2>
				<p class="mt-2 text-base text-stone-600">
					These permissions define what a role can publish or change inside this community.
				</p>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full min-w-[1040px] border-collapse text-left">
					<thead class="bg-stone-50">
						<tr>
							<th class="w-[360px] px-7 py-5 text-base font-bold text-stone-700">Action</th>
							{#each roles as role (role.name)}
								<th class="px-5 py-5 text-center text-base font-bold text-stone-700">
									{role.name}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-black/10">
						{#each actions as action (action.key)}
							<tr>
								<td class="px-7 py-5">
									<div class="flex items-start gap-4">
										<span
											class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800"
										>
											<svelte:component this={action.icon} size={22} strokeWidth={1.8} />
										</span>
										<span>
											<span class="block text-lg font-bold">{action.label}</span>
											<span class="mt-1 block text-base text-stone-600">{action.description}</span>
										</span>
									</div>
								</td>
								{#each roles as role (role.name)}
									<td class="px-5 py-5 text-center">
										<label class="inline-flex cursor-pointer items-center justify-center">
											<input
												class="sr-only"
												type="checkbox"
												checked={role.permissions[action.key]}
												on:change={() => togglePermission(role.name, action.key)}
												aria-label={`${role.name}: ${action.label}`}
											/>
											<span
												class={`relative h-8 w-14 rounded-full transition ${
													role.permissions[action.key] ? 'bg-emerald-700' : 'bg-stone-200'
												}`}
											>
												<span
													class={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${
														role.permissions[action.key] ? 'translate-x-6' : ''
													}`}
												></span>
											</span>
										</label>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="mt-7 rounded-2xl border border-black/10 bg-white/80 p-6 shadow-sm">
			<h2 class="text-xl font-bold">Suggested defaults</h2>
			<div class="mt-5 grid gap-4 md:grid-cols-3">
				<div class="rounded-xl bg-stone-50 p-5">
					<h3 class="font-black">Coach</h3>
					<p class="mt-2 text-base leading-7 text-stone-600">
						Can publish posts, pictures and training events.
					</p>
				</div>
				<div class="rounded-xl bg-stone-50 p-5">
					<h3 class="font-black">Member</h3>
					<p class="mt-2 text-base leading-7 text-stone-600">
						Can post updates and pictures, but not create official events.
					</p>
				</div>
				<div class="rounded-xl bg-stone-50 p-5">
					<h3 class="font-black">Admin</h3>
					<p class="mt-2 text-base leading-7 text-stone-600">
						Can manage roles, invite members, moderate, and change settings.
					</p>
				</div>
			</div>
		</section>
	</div>
</main>

{#if showNewRoleModal}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/35 px-5 py-8">
		<div
			class="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-black/10 bg-[#fbfaf7] p-6 shadow-2xl"
			aria-modal="true"
			role="dialog"
			aria-labelledby="new-role-title"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<h2 id="new-role-title" class="text-2xl font-black">New role</h2>
					<p class="mt-2 text-base text-stone-600">Create up to 4 roles per community.</p>
				</div>
				<button
					type="button"
					class="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5"
					aria-label="Close"
					on:click={closeNewRoleModal}
				>
					<X size={22} />
				</button>
			</div>

			<div class="mt-6 grid gap-5">
				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-600">Role name</span>
					<input
						class="rounded-xl border border-black/10 bg-white px-4 py-3 text-lg font-bold outline-none focus:border-emerald-700"
						bind:value={newRoleName}
						maxlength="32"
						placeholder="Member"
					/>
				</label>

				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-600">Description</span>
					<textarea
						class="min-h-24 rounded-xl border border-black/10 bg-white px-4 py-3 text-base font-semibold leading-6 outline-none focus:border-emerald-700"
						bind:value={newRoleDescription}
						maxlength="140"
						placeholder="Can post notes and media."
					></textarea>
				</label>
			</div>

			<div class="mt-7">
				<h3 class="text-lg font-black">Access rights</h3>
				<div class="mt-4 grid gap-3 md:grid-cols-2">
					{#each actions as action (action.key)}
						<label
							class="flex cursor-pointer items-start gap-4 rounded-xl border border-black/10 bg-white p-4"
						>
							<input
								class="mt-1 h-5 w-5 accent-emerald-800"
								type="checkbox"
								checked={newRolePermissions[action.key]}
								on:change={() => toggleNewRolePermission(action.key)}
							/>
							<span>
								<span class="block font-black">{action.label}</span>
								<span class="mt-1 block text-sm leading-5 text-stone-600">{action.description}</span
								>
							</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="mt-7 flex flex-wrap justify-end gap-3 border-t border-black/10 pt-5">
				<button
					type="button"
					class="h-12 rounded-xl border border-black/10 bg-white px-5 font-black"
					on:click={closeNewRoleModal}
				>
					Cancel
				</button>
				<button
					type="button"
					class="h-12 rounded-xl bg-emerald-800 px-5 font-black text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
					disabled={!canCreateRole}
					on:click={createRole}
				>
					Create role
				</button>
			</div>
		</div>
	</div>
{/if}
