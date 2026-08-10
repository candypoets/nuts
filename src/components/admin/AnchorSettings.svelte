<script lang="ts">
	import type { WorkerMessage } from '@candypoets/nipworker';
	import { usePublish } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus } from '@candypoets/nipworker/utils';
	import { CircleAlert, KeyRound, Save, ShieldCheck } from 'lucide-svelte';
	import type { EventTemplate } from 'nostr-tools';
	import { normalizeURL } from 'nostr-tools/utils';
	import { key, selectedAdminRelayUrl } from 'src/controller';
	import { fetchCommunityAnchor } from 'src/lib/adminAccess';
	import { ANCHOR_KIND, buildCommunityAnchorTags, type CommunityAnchor } from 'src/lib/nip97';
	import { now } from 'src/lib/period';
	import { onDestroy } from 'svelte';

	let relayUrl = '';
	let loadedRelayUrl = '';
	let loading = true;
	let rootPubkey = '';
	let anchor: CommunityAnchor | undefined;
	let adminsText = '';
	let badgeIssuer = '';
	let publishing = false;
	let statusMessage = '';
	let errorMessage = '';
	let unsubscribePublish: (() => void) | undefined;

	$: if ($selectedAdminRelayUrl !== loadedRelayUrl) {
		loadedRelayUrl = $selectedAdminRelayUrl;
		relayUrl = loadedRelayUrl ? normalizeURL(loadedRelayUrl) : '';
		void loadAnchor();
	}
	$: isRootKey = Boolean(rootPubkey && $key?.pub && $key.pub === rootPubkey);
	$: adminPubkeys = adminsText
		.split(/[\s,]+/)
		.map((value) => value.trim().toLowerCase())
		.filter((value) => /^[0-9a-f]{64}$/.test(value));
	$: canPublish = Boolean(relayUrl && isRootKey && adminPubkeys.length && !publishing);

	function relayInfoUrl(url: string) {
		if (url.startsWith('wss://')) return `https://${url.slice(6)}`;
		if (url.startsWith('ws://')) return `http://${url.slice(5)}`;
		return url;
	}

	/** The community root key is the NIP-11 `pubkey` of the community relay (NIP-97). */
	async function fetchRootPubkey(url: string) {
		try {
			const response = await fetch(relayInfoUrl(url), {
				headers: { accept: 'application/nostr+json' }
			});
			if (!response.ok) return '';
			const info = await response.json();
			const pubkey = info.pubkey;
			return typeof pubkey === 'string' && /^[0-9a-f]{64}$/i.test(pubkey)
				? pubkey.toLowerCase()
				: '';
		} catch {
			return '';
		}
	}

	async function loadAnchor() {
		unsubscribePublish?.();
		anchor = undefined;
		rootPubkey = '';
		adminsText = '';
		badgeIssuer = '';
		statusMessage = '';
		errorMessage = '';
		publishing = false;
		loading = Boolean(relayUrl);
		if (!relayUrl) {
			loading = false;
			return;
		}
		const target = relayUrl;
		const [root, current] = await Promise.all([
			fetchRootPubkey(target),
			fetchCommunityAnchor(target)
		]);
		if (target !== relayUrl) return;
		rootPubkey = root;
		anchor = current;
		adminsText = (current?.admins.length ? current.admins : root ? [root] : []).join('\n');
		badgeIssuer = current?.badgeIssuer || '';
		loading = false;
	}

	function shortPubkey(pubkey: string) {
		return `${pubkey.slice(0, 12)}…${pubkey.slice(-6)}`;
	}

	function publishAnchor() {
		if (!canPublish) return;
		let tags: string[][];
		try {
			tags = buildCommunityAnchorTags({
				admins: adminPubkeys,
				badgeIssuer: badgeIssuer.trim() || undefined,
				name: anchor?.name,
				description: anchor?.description,
				image: anchor?.image
			});
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'The anchor is invalid.';
			return;
		}
		const event: EventTemplate = {
			kind: ANCHOR_KIND,
			content: '',
			created_at: now(),
			tags
		};
		publishing = true;
		errorMessage = '';
		statusMessage = '';
		const timeout = window.setTimeout(() => {
			if (!publishing) return;
			publishing = false;
			errorMessage = 'The community relay did not confirm the anchor. Please try again.';
		}, 10000);
		unsubscribePublish?.();
		unsubscribePublish = usePublish(
			'admin_anchor_' + relayUrl + '_' + event.created_at,
			event,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				const value = status?.status()?.toString();
				if (value !== 'true' && value !== 'OK' && value !== 'false') return;
				window.clearTimeout(timeout);
				publishing = false;
				if (value === 'false') {
					errorMessage = status?.message()?.toString() || 'The relay rejected this anchor.';
					return;
				}
				statusMessage = 'Anchor published to the community relay.';
				void loadAnchor();
			},
			{ trackStatus: true, defaultRelays: [relayUrl] }
		);
	}

	onDestroy(() => {
		unsubscribePublish?.();
	});
</script>

<section class="mt-10 border-t border-stone-200 pt-8">
	<div class="flex flex-col gap-2">
		<p class="text-sm font-black uppercase tracking-[0.15em] text-emerald-800">NIP-97 trust root</p>
		<h2 class="text-2xl font-black tracking-tight text-stone-950">Community anchor</h2>
		<p class="max-w-2xl text-sm font-semibold leading-6 text-stone-500">
			The anchor declares who may act on behalf of this community. It is a kind {ANCHOR_KIND} event
			on the community relay, signed by the relay's root key.
		</p>
	</div>

	{#if loading}
		<div class="mt-6 h-32 animate-pulse rounded-2xl bg-stone-100"></div>
	{:else if !relayUrl}
		<p class="mt-6 text-sm font-bold text-stone-500">Select a community to manage its anchor.</p>
	{:else}
		<div class="mt-6 grid gap-5">
			<div class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-950/5">
				<div class="flex items-center gap-3">
					<span
						class="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800"
						><KeyRound size={19} /></span
					>
					<div class="min-w-0">
						<p class="text-xs font-black uppercase tracking-wide text-stone-400">Root key</p>
						<p class="truncate font-mono text-sm font-bold text-stone-700">
							{rootPubkey ? shortPubkey(rootPubkey) : 'Unavailable (NIP-11 lookup failed)'}
						</p>
					</div>
				</div>
				{#if anchor}
					<dl class="mt-5 grid gap-3 border-t border-stone-100 pt-4 text-sm">
						<div class="flex items-center justify-between gap-4">
							<dt class="font-bold text-stone-500">Current admins</dt>
							<dd class="font-black text-stone-800">
								{anchor.admins.length} admin{anchor.admins.length === 1 ? '' : 's'}
							</dd>
						</div>
						<div class="flex items-center justify-between gap-4">
							<dt class="font-bold text-stone-500">Badge issuer</dt>
							<dd class="font-mono font-bold text-stone-800">
								{anchor.badgeIssuer ? shortPubkey(anchor.badgeIssuer) : 'None'}
							</dd>
						</div>
						<div class="flex items-center justify-between gap-4">
							<dt class="font-bold text-stone-500">Last updated</dt>
							<dd class="font-black text-stone-800">
								{new Date(anchor.createdAt * 1000).toLocaleString()}
							</dd>
						</div>
					</dl>
				{:else}
					<p class="mt-4 border-t border-stone-100 pt-4 text-sm font-semibold text-stone-500">
						No anchor published yet. Publishing one makes the admin list and badge issuer explicit
						on the relay.
					</p>
				{/if}
			</div>

			{#if !isRootKey}
				<div
					class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"
				>
					<CircleAlert size={18} class="mt-0.5 shrink-0" />
					<span>
						The active account is not this community's root key, so it cannot publish the anchor.
						Sign in with the root key to rotate admins or the badge issuer.
					</span>
				</div>
			{/if}

			<label class="grid gap-2">
				<span class="text-sm font-black text-stone-700">
					Admin pubkeys <span class="font-semibold text-stone-400">· one per line</span>
				</span>
				<textarea
					class="min-h-28 rounded-xl border border-stone-200 bg-white px-4 py-3 font-mono text-sm font-semibold leading-6 outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15 disabled:bg-stone-50 disabled:text-stone-400"
					placeholder="64-character hex pubkey per line"
					bind:value={adminsText}
					disabled={!isRootKey || publishing}
				></textarea>
			</label>

			<label class="grid gap-2">
				<span class="text-sm font-black text-stone-700">
					Badge issuer <span class="font-semibold text-stone-400">· optional delegated key</span>
				</span>
				<input
					class="h-12 rounded-xl border border-stone-200 bg-white px-4 font-mono text-sm font-semibold outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15 disabled:bg-stone-50 disabled:text-stone-400"
					placeholder="Pubkey operated by the redemption service"
					bind:value={badgeIssuer}
					disabled={!isRootKey || publishing}
				/>
			</label>

			{#if errorMessage}
				<p
					class="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
				>
					<CircleAlert size={18} />{errorMessage}
				</p>
			{/if}
			{#if statusMessage}
				<p
					class="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
				>
					<ShieldCheck size={18} />{statusMessage}
				</p>
			{/if}

			<div>
				<button
					type="button"
					class="inline-flex h-11 items-center gap-2 rounded-lg bg-[#073c32] px-5 text-sm font-black text-white transition hover:bg-[#0a4b3e] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
					disabled={!canPublish}
					on:click={publishAnchor}
				>
					<Save size={17} />
					{publishing ? 'Publishing…' : anchor ? 'Publish new anchor version' : 'Publish anchor'}
				</button>
			</div>
		</div>
	{/if}
</section>
