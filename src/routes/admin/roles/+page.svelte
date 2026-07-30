<script lang="ts">
	export let embedded = false;
	import { resolve } from 'src/lib/paths';
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
		Save,
		ShoppingBag,
		ShieldCheck,
		SlidersHorizontal,
		UsersRound
	} from 'lucide-svelte';
	import { normalizeURL } from 'nostr-tools/utils';
	import type { EventTemplate } from 'nostr-tools';
	import { key, selectedAdminRelayUrl } from 'src/controller';
	import { parsedEventTags } from 'src/lib/adminRelays';
	import { BADGE_DEFINITION_TYPE_TOPICS } from 'src/lib/catalog';
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

	type PermissionKey =
		| 'posts'
		| 'media'
		| 'events'
		| 'store'
		| 'invites'
		| 'moderation'
		| 'settings';

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
			key: 'store',
			label: 'Manage store',
			description: 'Publish products, passes and paid memberships.',
			icon: ShoppingBag
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
	let loadedRelayUrl = '';
	let loadingRoles = true;
	let publishStatus = '';
	let editedPermissions: Record<string, Record<PermissionKey, boolean>> = {};
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
		store: false,
		invites: false,
		moderation: false,
		settings: false
	};

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		loadCommunityRelay();
		subscribeRoles();
		fetchRelayAdmin();
	}
	$: roles = rolesFromDefinitions(roleDefinitions, editedPermissions);
	$: roleLimitReached = roles.length >= 4;
	$: dirtyRoles = roles.filter((role) => roleIsDirty(role));
	$: canSaveRoleChanges = Boolean(relayUrl && $key?.pub && dirtyRoles.length);
	$: canCreateRole =
		newRoleName.trim().length > 1 &&
		!roleLimitReached &&
		!roles.some((role) => role.name.toLowerCase() === newRoleName.trim().toLowerCase());

	function loadCommunityRelay() {
		relayUrl = $selectedAdminRelayUrl ? normalizeURL($selectedAdminRelayUrl) : '';
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

	function rolesFromDefinitions(
		definitions: RoleDefinition[],
		edits: Record<string, Record<PermissionKey, boolean>>
	): Role[] {
		const adminDefinition = definitions.find(
			(definition) => definition.name.toLowerCase() === 'admin'
		);
		const mappedRoles = definitions
			.filter((definition) => definition.name.toLowerCase() !== 'member')
			.map((definition) => ({
				name: definition.name,
				count: activeAwardCount(definition.address),
				description: definition.description,
				address: definition.address,
				d: definition.d,
				permissions: permissionsForDefinition(definition, edits)
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

	function permissionsForDefinition(
		definition: RoleDefinition,
		edits: Record<string, Record<PermissionKey, boolean>>
	): Record<PermissionKey, boolean> {
		const key = roleEditKey(definition);
		const edited = edits[key];
		if (edited) return edited;
		if (definition.permissions?.length) return permissionsFromList(definition.permissions);
		return permissionsForRole(definition.name);
	}

	function permissionsForRole(roleName: string): Record<PermissionKey, boolean> {
		const normalized = roleName.toLowerCase();
		if (normalized === 'admin') {
			return {
				posts: true,
				media: true,
				events: true,
				store: true,
				invites: true,
				moderation: true,
				settings: true
			};
		}
		return {
			posts: true,
			media: true,
			events: normalized === 'coach',
			store: false,
			invites: false,
			moderation: false,
			settings: false
		};
	}

	function permissionsFromList(permissions: string[]): Record<PermissionKey, boolean> {
		const allowed = new Set(permissions);
		return Object.fromEntries(
			actions.map((action) => [action.key, allowed.has(action.key)])
		) as Record<PermissionKey, boolean>;
	}

	function permissionsToList(permissions: Record<PermissionKey, boolean>) {
		return actions.filter((action) => permissions[action.key]).map((action) => action.key);
	}

	function samePermissions(
		left: Record<PermissionKey, boolean>,
		right: Record<PermissionKey, boolean>
	) {
		return actions.every((action) => left[action.key] === right[action.key]);
	}

	function roleEditKey(role: Pick<Role, 'address' | 'name'>) {
		return role.address || `local:${role.name.toLowerCase()}`;
	}

	function savedPermissionsForRole(role: Role): Record<PermissionKey, boolean> {
		const definition = role.address
			? roleDefinitions.find((item) => item.address === role.address)
			: undefined;
		if (definition?.permissions?.length) return permissionsFromList(definition.permissions);
		return permissionsForRole(role.name);
	}

	function roleIsDirty(role: Role) {
		return !samePermissions(role.permissions, savedPermissionsForRole(role));
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

	function applyRoleDefinitionDeletion(parsedEvent: ParsedEvent) {
		const author = parsedEvent.pubkey();
		if (!author) return;
		const deletedAddresses = new Set(
			parsedEventTags(parsedEvent)
				.filter((tag) => tag[0] === 'a' && tag[1]?.startsWith('30009:'))
				.map((tag) => tag[1])
				.filter(
					(address): address is string => Boolean(address) && address.split(':')[1] === author
				)
		);
		if (!deletedAddresses.size) return;
		roleDefinitions = roleDefinitions.filter(
			(definition) => definition.pubkey !== author || !deletedAddresses.has(definition.address)
		);
	}

	function subscribeRoles() {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		roleDefinitions = [];
		roleAwards = [];
		editedPermissions = {};
		loadingRoles = Boolean(relayUrl);
		if (!relayUrl) {
			loadingRoles = false;
			return;
		}

		const roleDefinitionRequests: RequestObject[] = [
			{
				kinds: [30009],
				tags: { '#t': [BADGE_DEFINITION_TYPE_TOPICS.role] },
				limit: 100,
				relays: [relayUrl],
				// The dashboard only ever talks to the community relay: a cacheFirst
				// feed can serve a stale cached page and never stream live relay
				// events, which hid freshly created role definitions.
				cacheFirst: false,
				noCache: true
			},
			{
				kinds: [5],
				limit: 100,
				relays: [relayUrl],
				cacheFirst: false,
				noCache: true
			}
		];
		const roleAwardRequests: RequestObject[] = [
			{
				kinds: [8],
				limit: 500,
				relays: [relayUrl]
			}
		];

		unsubscribeRoleDefinitions = useSubscription(
			roleDefinitionSubscriptionId(relayUrl),
			roleDefinitionRequests,
			(message: WorkerMessage) => {
				const parsedEvent = isParsedEvent(message);
				if (!parsedEvent) return;
				if (parsedEvent.kind() === 5) {
					applyRoleDefinitionDeletion(parsedEvent);
					return;
				}
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

	function roleDefinitionSubscriptionId(url: string) {
		return 'admin_role_definitions_classified_v1_' + url;
	}

	function togglePermission(roleName: string, key: PermissionKey) {
		const role = roles.find((item) => item.name === roleName);
		if (!role) return;
		const editKey = roleEditKey(role);
		editedPermissions = {
			...editedPermissions,
			[editKey]: {
				...role.permissions,
				[key]: !role.permissions[key]
			}
		};
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
				description: roleDescription,
				permissions: permissionsToList(newRolePermissions)
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
				defaultRelays: [relayUrl],
				subId: roleDefinitionSubscriptionId(relayUrl)
			}
		);

		newRoleName = '';
		newRoleDescription = '';
		newRolePermissions = {
			posts: true,
			media: true,
			events: false,
			store: false,
			invites: false,
			moderation: false,
			settings: false
		};
		closeNewRoleModal();
	}

	function saveRoleChanges() {
		const pubkey = $key?.pub;
		if (!relayUrl || !pubkey || !dirtyRoles.length) return;

		publishUnsubscribe?.();
		publishStatus = 'Saving role changes...';

		for (const role of dirtyRoles) {
			const d = role.d || roleDFromName(role.name);
			if (!d) continue;
			const description = role.description || 'Custom community role.';
			const event: EventTemplate = {
				kind: 30009,
				content: description,
				created_at: now(),
				tags: buildRoleDefinitionTags({
					d,
					name: role.name,
					description,
					permissions: permissionsToList(role.permissions)
				})
			};

			publishUnsubscribe = usePublish(
				'admin_role_definition_' + relayUrl + '_' + d + '_' + now(),
				event,
				() => {
					publishStatus = 'Role changes saved';
				},
				{
					trackStatus: true,
					defaultRelays: [relayUrl],
					subId: roleDefinitionSubscriptionId(relayUrl)
				}
			);
		}

		editedPermissions = {};
	}

	onDestroy(() => {
		unsubscribeRoleDefinitions?.();
		unsubscribeRoleAwards?.();
		publishUnsubscribe?.();
	});
</script>

<svelte:head><title>People - Nuts</title></svelte:head>

<main class={embedded ? '' : 'px-4 py-8 sm:px-6 lg:px-8'}>
	<div class="mx-auto max-w-[1500px]">
		{#if !embedded}<a
				href={resolve('/admin')}
				class="inline-flex items-center gap-2 rounded-lg text-sm font-bold text-stone-600 transition hover:text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-800/30"
			>
				<ArrowLeft size={17} />
				Dashboard
			</a>{/if}

		{#if !embedded}<div class="mt-7 flex flex-wrap items-end justify-between gap-5">
				<div>
					<h1
						class={`${embedded ? 'text-2xl' : 'text-4xl'} font-black leading-tight text-[#151514]`}
					>
						Roles
					</h1>
					<p
						class={`${embedded ? 'mt-1 text-base' : 'mt-2 text-lg leading-8'} font-medium text-stone-600`}
					>
						Choose what each role can publish and manage in the community.
					</p>
				</div>
				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						class="inline-flex h-11 items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 disabled:shadow-none"
						disabled={!canSaveRoleChanges}
						on:click={saveRoleChanges}
					>
						<Save size={19} />
						Save changes
					</button>
					<button
						type="button"
						class="inline-flex h-11 items-center gap-3 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none"
						disabled={roleLimitReached}
						on:click={openNewRoleModal}
					>
						<Plus size={20} />
						New role
					</button>
				</div>
			</div>

			<p class="mt-4 text-sm font-bold text-stone-500">
				{#if loadingRoles}
					Loading community roles...
				{:else}
					{roles.length} of 4 roles used. Guests are handled automatically outside role permissions.
				{/if}
			</p>{/if}
		{#if publishStatus}
			<p
				class="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
			>
				{publishStatus}
			</p>
		{/if}

		<section
			class="mt-7 overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm shadow-stone-950/5"
		>
			<div
				class="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 p-5 lg:p-7"
			>
				<div>
					<h2 class="text-2xl font-black">{embedded ? 'Roles' : 'Access rights'}</h2>
					<p class="mt-1 text-base font-medium text-stone-600">
						{#if loadingRoles}Loading roles...{:else if embedded}{roles.length} roles with configurable
							access.{:else}These permissions define what a role can publish or change inside this
							community.{/if}
					</p>
				</div>
				{#if embedded}<div class="flex flex-wrap items-center gap-3">
						<button
							type="button"
							class="inline-flex h-11 items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 font-black text-emerald-950 shadow-sm transition hover:bg-stone-50 disabled:text-stone-400"
							disabled={!canSaveRoleChanges}
							on:click={saveRoleChanges}><Save size={19} /> Save changes</button
						>
						<button
							type="button"
							class="inline-flex h-11 items-center gap-3 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm transition hover:bg-emerald-900 disabled:bg-stone-300 disabled:text-stone-500"
							disabled={roleLimitReached}
							on:click={openNewRoleModal}><Plus size={20} /> New role</button
						>
					</div>{/if}
			</div>

			<div class="overflow-x-auto">
				<table
					class={`w-full ${embedded ? 'min-w-[760px]' : 'min-w-[1040px]'} border-collapse text-left`}
				>
					<thead class="bg-stone-50">
						<tr>
							<th
								class={`${embedded ? 'w-[260px] px-5 py-4' : 'w-[360px] px-7 py-5'} text-sm font-black text-stone-600`}
								>Action</th
							>
							{#each roles as role (role.name)}
								<th
									class={`${embedded ? 'px-3 py-4' : 'px-5 py-5'} text-center text-sm font-black text-stone-600`}
								>
									{role.name}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-stone-200">
						{#each actions as action (action.key)}
							<tr class="transition hover:bg-stone-50/70">
								<td class={embedded ? 'px-5 py-3.5' : 'px-7 py-5'}>
									<div class="flex items-start gap-4">
										<span
											class={`${embedded ? 'h-9 w-9' : 'h-11 w-11'} grid shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-900`}
										>
											<svelte:component
												this={action.icon}
												size={embedded ? 18 : 22}
												strokeWidth={1.8}
											/>
										</span>
										<span>
											<span class={`${embedded ? 'text-sm' : 'text-base'} block font-black`}
												>{action.label}</span
											>
											{#if !embedded}<span class="mt-1 block text-base font-medium text-stone-600"
													>{action.description}</span
												>{/if}
										</span>
									</div>
								</td>
								{#each roles as role (role.name)}
									<td class={embedded ? 'px-3 py-3.5 text-center' : 'px-5 py-5 text-center'}>
										<label
											class="inline-flex cursor-pointer items-center justify-center rounded-full focus-within:ring-2 focus-within:ring-emerald-800/30"
										>
											<input
												class="sr-only"
												type="checkbox"
												checked={role.permissions[action.key]}
												on:change={() => togglePermission(role.name, action.key)}
												aria-label={`${role.name}: ${action.label}`}
											/>
											<span
												class={`relative ${embedded ? 'h-6 w-11' : 'h-8 w-14'} rounded-full transition ${
													role.permissions[action.key] ? 'bg-emerald-700' : 'bg-stone-200'
												}`}
											>
												<span
													class={`absolute left-1 top-1 ${embedded ? 'h-4 w-4' : 'h-6 w-6'} rounded-full bg-white shadow-sm transition ${
														role.permissions[action.key]
															? embedded
																? 'translate-x-5'
																: 'translate-x-6'
															: ''
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
	</div>
</main>

{#if showNewRoleModal}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-5 py-8 backdrop-blur-sm"
	>
		<div
			class="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-stone-200 bg-[#fbfaf7] p-6 shadow-2xl shadow-stone-950/20"
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
					class="grid h-10 w-10 place-items-center rounded-xl transition hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
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
						class="rounded-xl border border-stone-200 bg-white px-4 py-3 text-lg font-bold outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20"
						bind:value={newRoleName}
						maxlength="32"
						placeholder="Member"
					/>
				</label>

				<label class="grid gap-2">
					<span class="text-sm font-black text-stone-600">Description</span>
					<textarea
						class="min-h-24 rounded-xl border border-stone-200 bg-white px-4 py-3 text-base font-semibold leading-6 outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20"
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
							class="flex cursor-pointer items-start gap-4 rounded-xl border border-stone-200 bg-white p-4 transition hover:bg-stone-50"
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

			<div class="mt-7 flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
				<button
					type="button"
					class="h-11 rounded-xl border border-stone-200 bg-white px-5 font-black transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
					on:click={closeNewRoleModal}
				>
					Cancel
				</button>
				<button
					type="button"
					class="h-11 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none"
					disabled={!canCreateRole}
					on:click={createRole}
				>
					Create role
				</button>
			</div>
		</div>
	</div>
{/if}
