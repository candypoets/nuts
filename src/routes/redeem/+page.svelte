<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from 'src/lib/paths';
	import { page } from '$app/stores';
	import imageCompression from 'browser-image-compression';
	import {
		getManager,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { isConnectionStatus, isParsedEvent } from '@candypoets/nipworker/utils';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import {
		ArrowRight,
		BadgeCheck,
		CheckCircle2,
		ExternalLink,
		ImagePlus,
		KeyRound,
		LockKeyhole,
		Loader2,
		ShieldCheck,
		Ticket,
		UserPlus
	} from 'lucide-svelte';
	import { getPublicKey, nip19, type EventTemplate } from 'nostr-tools';
	import { key, kind10002 } from 'src/controller';
	import {
		buildRelayListTagsWithReadRelay,
		buildRelayRoleSetTags,
		mergeRelayFeedIndexTags,
		relaySetAddress
	} from 'src/lib/adminRelays';
	import { INDEXER_RELAYS } from 'src/lib/env';
	import { makeInviteAuthorization } from 'src/lib/invites';
	import { now } from 'src/lib/period';
	import { uploadFile } from 'src/lib/upload';
	import { decodePrivKey } from 'src/lib/wallet';

	type RedeemState = 'idle' | 'loading-community' | 'redeeming' | 'done' | 'error';

	const manager = getManager();
	const INVITE_INDEX_RELAYS = INDEXER_RELAYS;

	let state: RedeemState = 'idle';
	let error = '';
	let relayName = '';
	let relayImage = '';
	let lastRelay = '';
	let accountMode: 'signup' | 'login' = 'signup';
	let displayName = '';
	let picture = '';
	let pictureName = '';
	let pictureFile: File | undefined;
	let privateKey = '';
	let relayFeed: ParsedEvent | undefined;
	let memberRelaySet: ParsedEvent | undefined;
	let membershipCheckKey = '';
	let checkingMembership = false;
	let alreadyMember = false;

	$: token = $page.url.searchParams.get('token') || '';
	$: relayBaseUrl = normalizeRelayBaseUrl($page.url.searchParams.get('relay') || '');
	$: communityRelayUrl = relayUrlFromBaseUrl(relayBaseUrl);
	$: redeemEndpoint = relayBaseUrl ? `${relayBaseUrl}/redeem` : '';
	$: communityName =
		relayName || (relayBaseUrl ? communityNameFromRelay(relayBaseUrl) : 'this community');
	$: inviteTitle = `${communityName} invite`;
	$: communityInitials =
		communityName
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'N';
	$: hasAccount = Boolean($key?.pub && $key?.npub && $key.npub !== 'undefined');
	$: accountLabel = hasAccount ? $key.npub : '';
	$: canRedeem = Boolean(
		token &&
		redeemEndpoint &&
		$key?.pub &&
		$key?.hasSigner !== false &&
		!alreadyMember &&
		!checkingMembership &&
		state !== 'redeeming'
	);
	$: if (relayBaseUrl && relayBaseUrl !== lastRelay) {
		lastRelay = relayBaseUrl;
		void fetchRelayInfo();
	}
	$: if (
		$key?.pub &&
		communityRelayUrl &&
		`${$key.pub}:${communityRelayUrl}` !== membershipCheckKey
	) {
		membershipCheckKey = `${$key.pub}:${communityRelayUrl}`;
		void checkExistingMembership($key.pub);
	}

	function normalizeRelayBaseUrl(value: string) {
		if (!value) return '';
		const normalized = value.replace(/\/$/, '');
		if (normalized.startsWith('wss://')) return `https://${normalized.slice(6)}`;
		if (normalized.startsWith('ws://')) return `http://${normalized.slice(5)}`;
		return normalized;
	}

	function relayUrlFromBaseUrl(value: string) {
		if (!value) return '';
		if (value.startsWith('https://')) return `wss://${value.slice(8)}`;
		if (value.startsWith('http://')) return `ws://${value.slice(7)}`;
		return value;
	}

	function communityNameFromRelay(url: string) {
		try {
			const hostname = new URL(url).hostname;
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

	function relayImageFromInfo(info: Record<string, unknown>) {
		for (const field of ['picture', 'image', 'icon', 'logo']) {
			const value = info[field];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
		return '';
	}

	function readImageFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		pictureFile = file;
		const reader = new FileReader();
		reader.onload = () => {
			picture = typeof reader.result === 'string' ? reader.result : '';
			pictureName = file.name;
		};
		reader.readAsDataURL(file);
	}

	async function compressProfilePicture(file: File) {
		if (!file.type.startsWith('image/')) return file;
		return await imageCompression(file, {
			maxSizeMB: 0.35,
			maxWidthOrHeight: 512,
			useWebWorker: true,
			fileType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
			initialQuality: 0.82
		});
	}

	async function uploadProfilePicture() {
		if (!pictureFile) return '';
		const compressed = await compressProfilePicture(pictureFile);
		console.log('[redeem-profile] uploading picture', {
			name: pictureFile.name,
			originalBytes: pictureFile.size,
			uploadBytes: compressed.size,
			type: compressed.type
		});
		const result = await uploadFile(compressed, {
			serverType: 'blossom',
			preferUserServers: false,
			alt: displayName.trim() || compressed.name || pictureFile.name,
			includeMimeTag: true,
			includeDimensions: true
		});
		console.log('[redeem-profile] picture uploaded', {
			url: result.url,
			sha256: result.sha256
		});
		return result.url;
	}

	async function fetchRelayInfo() {
		relayName = '';
		relayImage = '';
		if (!relayBaseUrl) return;
		state = state === 'idle' ? 'loading-community' : state;
		try {
			const response = await fetch(relayBaseUrl, {
				headers: { accept: 'application/nostr+json' }
			});
			if (!response.ok) return;
			const info = await response.json();
			relayName = typeof info.name === 'string' && info.name.trim() ? info.name.trim() : '';
			relayImage = relayImageFromInfo(info);
		} catch {
			// The invite remains redeemable with the URL-derived community name.
		} finally {
			if (state === 'loading-community') state = 'idle';
		}
	}

	async function connectWithExtension() {
		const nostr = (window as Window & { nostr?: { getPublicKey: () => Promise<string> } }).nostr;
		if (!nostr) {
			error = 'No Nostr browser signer found. Create a local account instead.';
			state = 'error';
			return;
		}
		state = 'idle';
		error = '';
		try {
			const pubkey = await nostr.getPublicKey();
			manager.setSigner('nip07');
			$key = {
				pub: pubkey,
				npub: nip19.npubEncode(pubkey),
				hasSigner: true
			};
		} catch (err) {
			state = 'error';
			error = err instanceof Error ? err.message : 'Could not connect signer.';
		}
	}

	function createLocalAccount() {
		if (!displayName.trim()) {
			state = 'error';
			error = 'Add your name to create an account.';
			return;
		}
		const secret = schnorr.utils.randomSecretKey();
		const privkey = bytesToHex(secret);
		const pubkey = bytesToHex(schnorr.getPublicKey(secret));

		manager.setSigner('privkey', privkey);
		$key = {
			pub: pubkey,
			priv: privkey,
			npub: nip19.npubEncode(pubkey),
			nsec: nip19.nsecEncode(secret),
			hasSigner: true
		};
		error = '';
		state = 'idle';
		void redeemInviteWithPubkey(pubkey, true);
	}

	async function publishProfile(pubkey: string) {
		const pictureUrl = await uploadProfilePicture();
		const metadata: EventTemplate = {
			kind: 0,
			tags: [],
			content: JSON.stringify({
				name: displayName.trim(),
				display_name: displayName.trim(),
				picture: pictureUrl || undefined,
				about: `Member of ${communityName}`
			}),
			created_at: now()
		};

		const profileRelays = Array.from(
			new Set([...INVITE_INDEX_RELAYS, ...(communityRelayUrl ? [communityRelayUrl] : [])])
		);

		console.log('[redeem-profile] publish kind0', {
			pubkey,
			communityRelayUrl,
			profileRelays,
			hasPicture: !!pictureUrl
		});
		usePublish('invite_signup_' + pubkey, metadata, (message: WorkerMessage) => {
			const status = isConnectionStatus(message);
			const relayUrl = status?.relayUrl();
			if (!status || !relayUrl) return;
			console.log('[redeem-profile] kind0 relay status', {
				pubkey,
				relay: relayUrl,
				status: status.status()?.toString(),
				message: status.message?.()
			});
		}, {
			trackStatus: true,
			defaultRelays: profileRelays
		});
	}

	function loginWithPrivateKey() {
		if (!privateKey.trim()) return;
		try {
			const secret = decodePrivKey(privateKey.trim());
			const pubkey = getPublicKey(secret);
			const privkey = bytesToHex(secret);
			manager.setSigner('privkey', privkey);
			$key = {
				pub: pubkey,
				priv: privkey,
				npub: nip19.npubEncode(pubkey),
				nsec: nip19.nsecEncode(secret),
				hasSigner: true
			};
			error = '';
			state = 'idle';
		} catch (err) {
			state = 'error';
			error = err instanceof Error ? err.message : 'Could not use that private key.';
		}
	}

	function fetchExistingEvent(
		pubkey: string,
		requests: RequestObject[],
		matches: (event: ParsedEvent) => boolean
	) {
		return new Promise<ParsedEvent | undefined>((resolveExistingEvent) => {
			let latest: ParsedEvent | undefined;
			let settled = false;
			let unsubscribe: (() => void) | undefined;

			const finish = () => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				unsubscribe?.();
				resolveExistingEvent(latest);
			};

			const timeout = window.setTimeout(finish, 2500);
			unsubscribe = useSubscription(
				'invite_existing_' + pubkey + '_' + Math.random().toString(36).slice(2),
				requests,
				(message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					if (status?.status() === 'EOSE') {
						finish();
						return;
					}

					const parsedEvent = isParsedEvent(message);
					if (!parsedEvent || !matches(parsedEvent)) return;
					if (!latest || parsedEvent.createdAt() > latest.createdAt()) latest = parsedEvent;
				},
				{ bytesPerEvent: 10 * 1024 }
			);
		});
	}

	async function fetchRelayFeed(pubkey: string) {
		relayFeed = await fetchExistingEvent(
			pubkey,
			[
				{
					kinds: [10012],
					authors: [pubkey],
					limit: 10,
					relays: INVITE_INDEX_RELAYS,
					cacheFirst: false,
					noCache: true
				}
			],
			(event) => event.kind() === 10012
		);
	}

	async function fetchMemberRelaySet(pubkey: string) {
		const memberAddress = relaySetAddress(pubkey, 'member');
		memberRelaySet = await fetchExistingEvent(
			pubkey,
			[
				{
					kinds: [30002],
					authors: [pubkey],
					tags: { '#d': ['nuts-relays-member'] },
					limit: 10,
					relays: INVITE_INDEX_RELAYS,
					cacheFirst: false,
					noCache: true
				}
			],
			(event) =>
				event.kind() === 30002 && `30002:${event.pubkey()}:nuts-relays-member` === memberAddress
		);
	}

	async function checkExistingMembership(pubkey: string) {
		alreadyMember = false;
		checkingMembership = true;
		const award = await fetchExistingEvent(
			pubkey,
			[
				{
					kinds: [8],
					tags: { '#p': [pubkey] },
					limit: 10,
					relays: [communityRelayUrl],
					cacheFirst: true
				}
			],
			(event) => {
				if (event.kind() !== 8) return false;
				const tagsLength = event.tagsLength();
				for (let i = 0; i < tagsLength; i += 1) {
					const tag = event.tags(i);
					if (!tag || tag.itemsLength() < 2) continue;
					if (tag.items(0) === 'p' && tag.items(1) === pubkey) return true;
				}
				return false;
			}
		);
		alreadyMember = Boolean(award);
		checkingMembership = false;
	}

	function publishEvent(event: EventTemplate, id: string, relays = INVITE_INDEX_RELAYS) {
		return new Promise<void>((resolvePublish) => {
			let done = false;
			let unsubscribe: (() => void) | undefined;
			const finish = () => {
				if (done) return;
				done = true;
				window.clearTimeout(timeout);
				unsubscribe?.();
				resolvePublish();
			};
			const timeout = window.setTimeout(finish, 1800);
			console.log('[redeem-flow] publish membership event', {
				id,
				kind: event.kind,
				relays
			});
			unsubscribe = usePublish(
				id,
				event,
				(message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					const relayUrl = status?.relayUrl();
					if (status && relayUrl) {
						console.log('[redeem-flow] membership relay status', {
							id,
							kind: event.kind,
							relay: relayUrl,
							status: status.status()?.toString(),
							message: status.message?.()
						});
					}
					if (status?.status() === 'OK' || status?.status() === 'EOSE') finish();
				},
				{ trackStatus: true, defaultRelays: relays }
			);
		});
	}

	async function publishMembershipIndexes(pubkey: string) {
		if (!communityRelayUrl) return;
		await Promise.all([fetchRelayFeed(pubkey), fetchMemberRelaySet(pubkey)]);
		const publishRelays = Array.from(new Set([...INVITE_INDEX_RELAYS, communityRelayUrl]));
		console.log('[redeem-flow] prepare membership indexes', {
			pubkey,
			communityRelayUrl,
			indexRelays: INVITE_INDEX_RELAYS,
			publishRelays
		});

		const relayFeedEvent: EventTemplate = {
			kind: 10012,
			tags: mergeRelayFeedIndexTags(relayFeed, pubkey, ['admin', 'member', 'following']),
			content: '',
			created_at: now()
		};
		const memberRelaySetEvent: EventTemplate = {
			kind: 30002,
			tags: buildRelayRoleSetTags('member', memberRelaySet, communityRelayUrl),
			content: '',
			created_at: now()
		};
		const relayListEvent: EventTemplate = {
			kind: 10002,
			tags: buildRelayListTagsWithReadRelay(
				$kind10002?.pubkey() === pubkey ? $kind10002 : undefined,
				communityRelayUrl
			),
			content: '',
			created_at: now()
		};

		await publishEvent(relayFeedEvent, 'invite_relay_feed_' + pubkey, publishRelays);
		await publishEvent(memberRelaySetEvent, 'invite_member_relay_set_' + pubkey, publishRelays);
		await publishEvent(relayListEvent, 'invite_relay_list_' + pubkey, publishRelays);
	}

	async function redeemInvite() {
		if (!canRedeem || !$key?.pub) return;
		await redeemInviteWithPubkey($key.pub);
	}

	async function redeemInviteWithPubkey(pubkey: string, publishLocalProfile = false) {
		state = 'redeeming';
		error = '';
		console.log('[redeem-flow] redeem start', {
			pubkey,
			redeemEndpoint,
			communityRelayUrl,
			publishLocalProfile
		});

		const body = JSON.stringify({
			token,
			pubkey
		});

		try {
			console.log('[redeem-flow] signing redeem request', {
				pubkey,
				redeemEndpoint
			});
			const authorization = await makeInviteAuthorization(redeemEndpoint, body);
			console.log('[redeem-flow] redeem request signed', {
				pubkey,
				redeemEndpoint
			});
			const response = await fetch(redeemEndpoint, {
				method: 'POST',
				headers: {
					authorization,
					'content-type': 'application/json'
				},
				body
			});
			const data = await response.json().catch(() => undefined);
			console.log('[redeem-flow] redeem response', {
				pubkey,
				status: response.status,
				ok: response.ok,
				error: data?.error,
				message: data?.message
			});
			if (!response.ok) {
				throw new Error(data?.error || data?.message || 'Could not redeem invite.');
			}
			if (publishLocalProfile) await publishProfile(pubkey);
			await publishMembershipIndexes(pubkey);
			state = 'done';
			alreadyMember = true;
			console.log('[redeem-flow] redeem done', {
				pubkey,
				communityRelayUrl
			});
		} catch (err) {
			state = 'error';
			error = err instanceof Error ? err.message : 'Could not redeem invite.';
			console.warn('[redeem-flow] redeem failed', {
				pubkey,
				error
			});
		}
	}
</script>

<svelte:head>
	<title>Redeem invite - Nuts</title>
</svelte:head>

<main class="min-h-screen bg-[#f3efe7] px-4 py-8 text-[#081817] sm:px-6 lg:px-8">
	<section
		class="mx-auto grid max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-stone-950/15 lg:min-h-[700px] lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)]"
	>
		<div class="flex flex-col px-7 py-8 sm:px-10 lg:px-16 lg:py-14">
			<div class="flex items-center gap-4">
				{#if relayImage}
					<img
						class="h-16 w-16 rounded-2xl border border-stone-200 object-cover shadow-sm"
						src={relayImage}
						alt={`${communityName} community`}
					/>
				{:else}
					<div
						class="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-950 text-white shadow-sm"
					>
						<Ticket size={30} />
					</div>
				{/if}
				<div class="min-w-0">
					<p class="text-lg font-semibold leading-6 text-stone-500">Invite from</p>
					<div class="flex min-w-0 items-center gap-2">
						<p class="truncate text-xl font-black text-[#081817]">{communityName}</p>
						<BadgeCheck size={18} class="shrink-0 fill-emerald-700 text-white" />
					</div>
				</div>
			</div>

			<div class="mt-14 max-w-2xl">
				<h1 class="text-5xl font-black leading-[1.05] tracking-normal sm:text-6xl">
					You're invited to {communityName}.
				</h1>
				<p class="mt-6 max-w-xl text-xl font-semibold leading-8 text-stone-600">
					This invite lets you join the community and start connecting with other members on Nuts.
				</p>
			</div>

			{#if !token || !redeemEndpoint}
				<div
					class="mt-10 rounded-2xl border border-rose-200 bg-rose-50 p-5 font-bold text-rose-800"
				>
					This invite link is missing required information.
				</div>
			{:else if state === 'done'}
				<div class="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
					<div class="flex items-center gap-3 font-black text-emerald-950">
						<CheckCircle2 size={26} />
						Invite redeemed
					</div>
					<p class="mt-3 text-base font-semibold text-emerald-900">
						You can now open Nuts and use this community.
					</p>
					<button
						type="button"
						class="mt-6 inline-flex h-14 items-center gap-3 rounded-2xl bg-emerald-950 px-6 text-base font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-900"
						on:click={() => goto(resolve('/explore'))}
					>
						Open Nuts
						<ArrowRight size={20} />
					</button>
				</div>
			{:else if hasAccount && alreadyMember}
				<div class="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
					<div class="flex items-center gap-3 font-black text-emerald-950">
						<CheckCircle2 size={26} />
						You are already a member
					</div>
					<p class="mt-3 text-base font-semibold text-emerald-900">
						This account already has a membership badge for {communityName}.
					</p>
					<button
						type="button"
						class="mt-6 inline-flex h-14 items-center gap-3 rounded-2xl bg-emerald-950 px-6 text-base font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-900"
						on:click={() => goto(resolve('/explore'))}
					>
						Open Nuts
						<ArrowRight size={20} />
					</button>
				</div>
			{:else}
				<div class="mt-10 grid max-w-2xl gap-5">
					<div
						class="rounded-2xl border border-stone-200 bg-[#faf9f5] p-5 shadow-sm shadow-stone-950/5"
					>
						<div class="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4">
							<div class="grid h-11 w-11 place-items-center rounded-full bg-emerald-800 text-white">
								<CheckCircle2 size={24} />
							</div>
							<div class="min-w-0">
								<p class="font-black text-[#081817]">Invite ready</p>
								<p class="truncate font-mono text-sm font-semibold text-stone-600">
									Secure invite for {communityName}
								</p>
							</div>
							<span
								class="hidden items-center gap-2 text-sm font-black text-emerald-800 sm:inline-flex"
							>
								Details
								<ArrowRight size={17} />
							</span>
						</div>
					</div>

					{#if !hasAccount}
						{#if accountMode === 'signup'}
							<div
								class="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-950/5"
							>
								<label class="grid gap-2">
									<span class="text-sm font-black text-stone-700">Your name</span>
									<input
										class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
										bind:value={displayName}
										autocomplete="name"
										placeholder="Marie"
									/>
								</label>

								<label class="grid gap-2">
									<span class="text-sm font-black text-stone-700">Your picture</span>
									<input class="sr-only" type="file" accept="image/*" on:change={readImageFile} />
									<span
										class="grid min-h-24 cursor-pointer grid-cols-[64px_1fr] items-center gap-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 transition hover:border-emerald-900/50 hover:bg-white"
									>
										{#if picture}
											<img class="h-16 w-16 rounded-lg object-cover" src={picture} alt="" />
										{:else}
											<span
												class="grid h-16 w-16 place-items-center rounded-lg bg-stone-200 text-[#171614]"
											>
												<ImagePlus size={28} />
											</span>
										{/if}
										<span>
											<strong class="block font-black">Upload profile picture</strong>
											<small class="mt-1 block text-sm font-semibold text-stone-500">
												{pictureName || 'Optional'}
											</small>
										</span>
									</span>
								</label>
							</div>

							<button
								type="button"
								class="inline-flex h-16 items-center justify-between rounded-2xl bg-emerald-950 px-7 text-lg font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={!displayName.trim() || state === 'redeeming'}
								on:click={createLocalAccount}
							>
								<span class="inline-flex items-center gap-3">
									{#if state === 'redeeming'}
										<Loader2 size={22} class="animate-spin" />
										Claiming invite
									{:else}
										<ShieldCheck size={22} />
										Accept invite & continue
									{/if}
								</span>
								<ArrowRight size={24} />
							</button>

							<div class="flex items-center gap-3 text-sm font-semibold text-stone-600">
								<LockKeyhole size={17} class="text-stone-500" />
								This invite is secure and can only be used once.
							</div>

							<div class="mt-4 flex flex-wrap items-center gap-4 border-t border-stone-200 pt-6">
								<span class="font-semibold text-stone-600">Already have a Nuts account?</span>
								<button
									type="button"
									class="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 font-black text-emerald-900 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50"
									on:click={() => (accountMode = 'login')}
								>
									Connect account
									<ExternalLink size={17} />
								</button>
							</div>
						{:else}
							<div
								class="grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-950/5"
							>
								<button
									type="button"
									class="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 font-black text-white shadow-sm shadow-emerald-950/20 transition hover:bg-emerald-900"
									on:click={connectWithExtension}
								>
									<KeyRound size={18} />
									Use browser signer
								</button>

								<div class="grid gap-2">
									<label class="text-sm font-black text-stone-700" for="private-key"
										>Private key</label
									>
									<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
										<input
											id="private-key"
											class="h-12 rounded-xl border border-stone-200 bg-white px-4 text-base font-bold text-[#171614] outline-none focus:border-emerald-900 focus:ring-2 focus:ring-emerald-800/20"
											type="password"
											bind:value={privateKey}
											placeholder="nsec or hex private key"
										/>
										<button
											type="button"
											class="inline-flex h-12 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 font-black text-emerald-950 shadow-sm shadow-stone-950/5 transition hover:bg-stone-50"
											on:click={loginWithPrivateKey}
										>
											Sign in
										</button>
									</div>
								</div>
								<button
									type="button"
									class="w-fit font-black text-emerald-900"
									on:click={() => (accountMode = 'signup')}
								>
									Create a new account instead
								</button>
							</div>
						{/if}
					{:else}
						<div
							class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-950/5"
						>
							<p class="text-sm font-black uppercase text-stone-500">Claiming as</p>
							<p class="mt-2 break-all font-mono text-sm font-bold text-stone-700">
								{accountLabel}
							</p>
							{#if checkingMembership}
								<p class="mt-3 inline-flex items-center gap-2 text-sm font-bold text-stone-500">
									<Loader2 size={15} class="animate-spin" />
									Checking membership
								</p>
							{/if}
						</div>

						<button
							type="button"
							class="inline-flex h-16 items-center justify-between rounded-2xl bg-emerald-950 px-7 text-lg font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!canRedeem}
							on:click={redeemInvite}
						>
							<span class="inline-flex items-center gap-3">
								{#if state === 'redeeming'}
									<Loader2 size={22} class="animate-spin" />
									Claiming invite
								{:else}
									<ShieldCheck size={22} />
									Accept invite & continue
								{/if}
							</span>
							<ArrowRight size={24} />
						</button>
					{/if}

					{#if state === 'error' && error}
						<p class="rounded-2xl border border-rose-200 bg-rose-50 p-4 font-bold text-rose-800">
							{error}
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<aside class="relative overflow-hidden bg-[#06392d] p-8 text-white sm:p-10 lg:p-14">
			<div class="absolute inset-0 opacity-20 invite-lines"></div>
			<div class="relative z-10 flex h-full flex-col justify-center">
				<div class="flex -space-x-3">
					{#if relayImage}
						<img
							class="h-14 w-14 rounded-full border-2 border-white/80 object-cover"
							src={relayImage}
							alt={`${communityName} community`}
						/>
					{/if}
					<span
						class="grid h-14 w-14 place-items-center rounded-full border-2 border-white/80 bg-emerald-100 text-sm font-black text-emerald-950"
						>{communityInitials}</span
					>
					<span
						class="grid h-14 w-14 place-items-center rounded-full border-2 border-white/80 bg-stone-100 text-sm font-black text-stone-800"
						>N</span
					>
					<span
						class="grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-white/10 text-sm font-black text-white"
						>+27</span
					>
				</div>

				<h2 class="mt-10 text-3xl font-black leading-tight">
					Members and conversations are waiting.
				</h2>

				<ul class="mt-10 grid gap-6 text-lg font-bold text-white/90">
					<li class="flex items-center gap-4">
						<CheckCircle2 size={28} class="text-emerald-300" />
						Join conversations
					</li>
					<li class="flex items-center gap-4">
						<CheckCircle2 size={28} class="text-emerald-300" />
						Discover events
					</li>
					<li class="flex items-center gap-4">
						<CheckCircle2 size={28} class="text-emerald-300" />
						Build together
					</li>
				</ul>

				<div
					class="mt-12 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-black/10"
				>
					<p class="text-xl font-black leading-8">Great to have you on board.</p>
					<p class="mt-4 font-semibold text-white/70">The {communityName} team</p>
				</div>
			</div>
		</aside>
	</section>
</main>

<style>
	.invite-lines {
		background-image:
			radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.22) 1px, transparent 1px),
			linear-gradient(135deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
		background-size:
			90px 90px,
			140px 140px;
	}
</style>
