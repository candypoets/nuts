<script lang="ts">
	import type { Kind0Parsed, WorkerMessage } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isKind0 } from '@candypoets/nipworker/utils';
	import { CalendarClock, Check, Copy, ShieldCheck, X } from 'lucide-svelte';
	import { nip19 } from 'nostr-tools';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import About from 'src/components/About.svelte';
	import { parseContent, type ContentBlock } from 'src/lib';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { userQuery, userSubId } from 'src/routes/queries/user';

	export let pubkey: string;
	export let relays: string[] = [];
	export let roles: Array<{ label: string; expiresAt?: number }> = [];
	export let status = '';
	export let expires = '';

	const dispatch = createEventDispatcher<{ close: void }>();

	let profile: Kind0Parsed | undefined;
	let parsedAbout: ContentBlock[] = [];
	let loading = true;
	let copied = false;
	let unsubscribe: (() => void) | undefined;
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	let loadingTimer: ReturnType<typeof setTimeout> | undefined;

	$: displayName =
		profile?.displayName?.()?.trim() || profile?.name?.()?.trim() || `${pubkey.slice(0, 12)}…`;
	$: npub = nip19.npubEncode(pubkey);

	onMount(() => {
		loadingTimer = setTimeout(() => (loading = false), 2000);
		unsubscribe = useSubscription(
			userSubId(pubkey, relays),
			userQuery(pubkey, relays),
			(message: WorkerMessage) => {
				const kind0 = isKind0(message);
				if (kind0?.pubkey() !== pubkey) return;
				profile = kind0;
				parseContent(kind0.about() || '').then((content) => (parsedAbout = content));
				loading = false;
				if (loadingTimer) clearTimeout(loadingTimer);
			},
			{}
		);
	});

	onDestroy(() => {
		unsubscribe?.();
		if (copyTimer) clearTimeout(copyTimer);
		if (loadingTimer) clearTimeout(loadingTimer);
	});

	function close() {
		dispatch('close');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
	}

	async function copyNpub() {
		await navigator.clipboard.writeText(npub);
		copied = true;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 1800);
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 z-50 grid place-items-center bg-stone-950/50 px-5 py-8 backdrop-blur-sm">
	<button
		type="button"
		class="absolute inset-0 h-full w-full cursor-default"
		aria-label="Close profile"
		on:click={close}
	></button>
	<div
		class="relative max-h-full w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="member-profile-title"
	>
		<div class="h-28 bg-gradient-to-br from-emerald-950 via-emerald-800 to-amber-200"></div>
		<button
			type="button"
			class="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/70"
			aria-label="Close profile"
			on:click={close}
		>
			<X size={20} />
		</button>

		<div class="px-7 pb-8">
			<div class="-mt-12 flex items-end justify-between gap-4">
				<div
					class="h-24 w-24 overflow-hidden rounded-3xl border-4 border-white bg-stone-100 shadow-md"
				>
					{#if profile?.picture?.()}
						<img
							src={proxyAvatarUrl(profile.picture() || '')}
							alt={displayName}
							class="h-full w-full object-cover"
						/>
					{:else}
						<img src="/miss-profile.png" alt="" class="h-full w-full object-cover" />
					{/if}
				</div>
				<span
					class="mb-1 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-800"
				>
					<span class="h-2 w-2 rounded-full bg-emerald-600"></span>{status}
				</span>
			</div>

			<div class="mt-5">
				{#if loading && !profile}
					<p class="text-sm font-bold text-stone-400">Loading profile…</p>
				{/if}
				<h2 id="member-profile-title" class="text-3xl font-black tracking-tight text-stone-900">
					{displayName}
				</h2>
				{#if profile?.nip05?.()}
					<p class="mt-1 text-sm font-bold text-emerald-800">{profile.nip05()}</p>
				{/if}
				{#if profile?.about?.()}
					<About content={parsedAbout} class=" mt-4 text-base leading-7 text-stone-600" />
				{:else if !loading}
					<p class="mt-4 text-base italic text-stone-400">This member has not added a bio yet.</p>
				{/if}
			</div>

			<div class="mt-7 grid gap-3 sm:grid-cols-2">
				<div class="rounded-2xl bg-stone-50 p-4">
					<div class="flex items-center gap-2 text-sm font-black text-stone-500">
						<ShieldCheck size={18} /> Community roles
					</div>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each roles as role (role.label)}
							<span class="rounded-md bg-emerald-100 px-2.5 py-1 text-sm font-bold text-emerald-800"
								>{role.label}</span
							>
						{:else}
							<span class="text-sm font-semibold text-stone-400">No role assigned</span>
						{/each}
					</div>
				</div>
				<div class="rounded-2xl bg-stone-50 p-4">
					<div class="flex items-center gap-2 text-sm font-black text-stone-500">
						<CalendarClock size={18} /> Membership expiry
					</div>
					<p class="mt-3 text-base font-black text-stone-800">{expires}</p>
				</div>
			</div>

			<div class="mt-5 rounded-2xl border border-stone-200 p-4">
				<p class="text-sm font-black text-stone-700">Account address</p>
				<div class="mt-2 flex items-center gap-3">
					<p class="min-w-0 flex-1 truncate font-mono text-sm text-stone-600">{npub}</p>
					<button
						type="button"
						class="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-black text-emerald-900 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-800/25"
						on:click={copyNpub}
					>
						{#if copied}<Check size={17} /> Copied{:else}<Copy size={17} /> Copy address{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
