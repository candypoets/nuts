<script lang="ts">
	import { goto } from '$app/navigation';
	import type { RequestObject, WorkerMessage } from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isParsedEvent } from '@candypoets/nipworker/utils';
	import { BadgeCheck, ChevronRight, Plus, Settings2 } from 'lucide-svelte';
	import type { EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import {
		COMMUNITY_PROFILE_D,
		COMMUNITY_PROFILE_KIND,
		parseCommunityProfile,
		type CommunityProfile
	} from 'src/lib/communityProfile';
	import {
		archetypeFor,
		type CommunityType,
		type SuggestedRole,
		type ToolkitAction
	} from 'src/lib/communityTypes';
	import { buildRoleDefinitionTags, roleDFromName, type RoleDefinition } from 'src/lib/nip58Roles';
	import { resolve } from 'src/lib/paths';
	import { now } from 'src/lib/period';
	import { go } from 'src/routes/modals/modal';
	import { onDestroy } from 'svelte';

	export let relayUrl: string = '';
	export let roleDefinitions: RoleDefinition[] = [];

	let loadedRelayUrl = '';
	let profile: CommunityProfile | undefined;
	let pendingRoleDs: string[] = [];
	let unsubscribeProfile: (() => void) | undefined;
	let rolePublishUnsubscribers: Array<() => void> = [];

	$: if (relayUrl !== loadedRelayUrl) {
		loadedRelayUrl = relayUrl;
		subscribeProfile();
	}
	$: communityType = (profile?.type || 'other') as CommunityType;
	$: archetype = archetypeFor(communityType);
	$: customRoleCount = roleDefinitions.filter(
		(role) => role.name.toLowerCase() !== 'member'
	).length;
	$: roleLimitReached = customRoleCount >= 4;
	$: missingSuggestedRoles = roleLimitReached
		? []
		: archetype.suggestedRoles.filter(
				(suggested) =>
					!roleDefinitions.some(
						(role) =>
							role.d === roleDFromName(suggested.name) ||
							role.name.toLowerCase() === suggested.name.toLowerCase()
					)
			);

	function subscribeProfile() {
		unsubscribeProfile?.();
		profile = undefined;
		const normalized = relayUrl ? normalizeURL(relayUrl) : '';
		if (!normalized) return;

		const requests: RequestObject[] = [
			{
				kinds: [COMMUNITY_PROFILE_KIND],
				tags: { '#d': [COMMUNITY_PROFILE_D] },
				limit: 10,
				relays: [normalized]
			}
		];
		unsubscribeProfile = useSubscription(
			'admin_dashboard_profile_' + normalized,
			requests,
			(message: WorkerMessage) => {
				const event = isParsedEvent(message);
				if (!event) return;
				const parsed = parseCommunityProfile(event);
				if (!parsed) return;
				if (profile && parsed.createdAt <= profile.createdAt) return;
				profile = parsed;
			},
			{ bytesPerEvent: 10 * 1024 }
		);
	}

	function adminHref(segment: string) {
		return segment ? `/admin/${segment}` : '/admin';
	}

	function handleAction(action: ToolkitAction) {
		if (action.action === 'post') {
			go('post');
			return;
		}
		const href = resolve(adminHref(action.segment) as '/admin');
		const params = new URLSearchParams();
		if (action.create) params.set('create', '1');
		if (action.section) params.set('section', action.section);
		if (action.storeType) params.set('type', action.storeType);
		const query = params.toString();
		void goto(query ? `${href}?${query}` : href);
	}

	function openCommunitySettings() {
		void goto(`${resolve('/admin/settings')}?section=community`);
	}

	function addSuggestedRole(role: SuggestedRole) {
		const d = roleDFromName(role.name);
		const normalized = relayUrl ? normalizeURL(relayUrl) : '';
		if (!normalized || !d || pendingRoleDs.includes(d)) return;

		const event: EventTemplate = {
			kind: 30009,
			tags: buildRoleDefinitionTags({
				d,
				name: role.name,
				description: role.description,
				permissions: role.permissions
			}),
			content: '',
			created_at: now()
		};
		pendingRoleDs = [...pendingRoleDs, d];
		const unsubscribe = usePublish(
			'admin_role_suggestion_' + normalized + '_' + d,
			event,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (!status) return;
				pendingRoleDs = pendingRoleDs.filter((item) => item !== d);
			},
			{ trackStatus: true, defaultRelays: [normalized] }
		);
		rolePublishUnsubscribers = [...rolePublishUnsubscribers, unsubscribe];
		window.setTimeout(() => {
			pendingRoleDs = pendingRoleDs.filter((item) => item !== d);
		}, 4000);
	}

	onDestroy(() => {
		unsubscribeProfile?.();
		rolePublishUnsubscribers.forEach((unsubscribe) => unsubscribe());
	});
</script>

<section
	class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5"
>
	<header class="flex flex-wrap items-end justify-between gap-4 px-6 pb-5 pt-7 sm:px-8">
		<div>
			<p class="text-sm font-bold text-[#df725c]">{archetype.label}</p>
			<h2 class="mt-1 text-2xl font-medium tracking-tight text-[#080b12]">
				Your {archetype.shortLabel.toLowerCase()} toolkit
			</h2>
			<p class="mt-2 max-w-2xl text-base font-medium text-slate-600">{archetype.toolkitIntro}</p>
		</div>
		<button
			type="button"
			class="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
			on:click={openCommunitySettings}
		>
			<Settings2 size={16} />
			{profile ? 'Change type' : 'Set community type'}
		</button>
	</header>

	<div class="grid gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
		{#each archetype.actions as action (action.label)}
			<button
				type="button"
				class="group grid min-h-[160px] bg-white p-6 text-left transition hover:bg-[#f7faf9] focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-800/30"
				on:click={() => handleAction(action)}
			>
				<div class="flex items-start justify-between gap-5">
					<span class="grid h-11 w-11 place-items-center rounded-lg bg-[#eef5f3] text-[#15372c]">
						<svelte:component this={action.icon} size={22} />
					</span>
					<ChevronRight
						size={20}
						class="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#15372c]"
					/>
				</div>
				<div class="mt-6 self-end">
					<h3 class="text-base font-black text-[#080b12]">{action.label}</h3>
					<p class="mt-2 text-sm leading-6 text-slate-600">{action.detail}</p>
				</div>
			</button>
		{/each}
	</div>

	{#if missingSuggestedRoles.length}
		<div class="border-t border-slate-100 px-6 py-6 sm:px-8">
			<h3 class="text-base font-black text-[#080b12]">
				Suggested roles for a {archetype.shortLabel.toLowerCase()}
			</h3>
			<p class="mt-1 text-sm font-medium text-slate-600">
				Roles are badges on the community relay — award them to members from the People page.
			</p>
			<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{#each missingSuggestedRoles as role (role.name)}
					<div
						class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3"
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-black text-[#080b12]">{role.name}</p>
							<p class="truncate text-xs font-semibold text-slate-500">
								{role.permissions.length ? role.permissions.join(' · ') : 'Recognition badge'}
							</p>
						</div>
						<button
							type="button"
							class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#15372c] px-3 text-xs font-black text-white transition hover:bg-[#204c3e] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:opacity-50"
							disabled={pendingRoleDs.includes(roleDFromName(role.name))}
							on:click={() => addSuggestedRole(role)}
						>
							<Plus size={14} />
							{pendingRoleDs.includes(roleDFromName(role.name)) ? 'Adding' : 'Add'}
						</button>
					</div>
				{/each}
			</div>
		</div>
	{:else if archetype.suggestedRoles.length && !roleLimitReached}
		<div class="flex items-center gap-3 border-t border-slate-100 px-6 py-5 sm:px-8">
			<BadgeCheck size={18} class="shrink-0 text-emerald-800" />
			<p class="text-sm font-semibold text-slate-600">
				All suggested roles for a {archetype.shortLabel.toLowerCase()} exist. Award them to members from
				the People page.
			</p>
		</div>
	{/if}
</section>
