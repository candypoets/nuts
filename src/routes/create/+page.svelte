<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		getManager,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { asNip51, isConnectionStatus, isParsedEvent } from '@candypoets/nipworker/utils';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import {
		ArrowLeft,
		ArrowRight,
		CalendarDays,
		CheckCircle2,
		Ellipsis,
		ImagePlus,
		Loader2,
		Rocket,
		Ticket,
		TreePine,
		UserRound,
		UsersRound,
		Users
	} from 'lucide-svelte';
	import { nip19, type EventTemplate } from 'nostr-tools';
	import { QRCode } from 'svelte-qrcode-image/util';

	import { key, kind10002 } from 'src/controller';
	import CommunityBenefitsPanel from 'src/components/CommunityBenefitsPanel.svelte';
	import CommunityCreatedScreen from 'src/components/CommunityCreatedScreen.svelte';
	import {
		ADMIN_RELAY_SET_D,
		buildAdminRelaySetTags,
		buildRelayListTagsWithReadRelay,
		mergeRelayFeedIndexTags
	} from 'src/lib/adminRelays';
	import { DEFAULT_RELAYS, INDEXER_RELAYS } from 'src/lib/env';
	import { now } from 'src/lib/period';
	import { onDestroy, onMount } from 'svelte';

	type CreateState = 'idle' | 'creating-account' | 'creating-relay' | 'done' | 'error';
	type CommunityType =
		| 'Sports Club'
		| 'Startup Community'
		| 'Village'
		| 'Event'
		| 'Organization'
		| 'Other';

	type RelayRecord = {
		id: string;
		name?: string;
		status: string;
		domain: string;
		relay_url: string;
		base_url: string;
		required_badge: string;
		badge_issuer_pubkey: string;
		admin_pubkeys: string[];
	};

	const manager = getManager();
	const coordinatorUrl = import.meta.env.VITE_COORDINATOR_URL || 'https://coordinator.nuts.cash';
	const RELAY_LIST_PUBLISH_RELAYS = ['wss://relay.nuts.cash', 'wss://relay.damus.io'];
	const communityTypes: Array<{ label: CommunityType; icon: typeof Users }> = [
		{ label: 'Sports Club', icon: UsersRound },
		{ label: 'Startup Community', icon: Rocket },
		{ label: 'Village', icon: TreePine },
		{ label: 'Event', icon: Ticket },
		{ label: 'Organization', icon: Users },
		{ label: 'Other', icon: Ellipsis }
	];

	let communityName = '';
	let communityDescription = '';
	let communityImage = '';
	let communityImageName = '';
	let communityType: CommunityType = 'Sports Club';
	let creatorName = '';
	let picture = '';
	let pictureName = '';
	let state: CreateState = 'idle';
	let error = '';
	let relay: RelayRecord | undefined;
	let recoveryNsec = '';
	let qrDataUrl = '';
	let qrRequest = 0;
	let adminRelaySet: ParsedEvent | undefined;
	let relayFeed: ParsedEvent | undefined;
	let adminRelaySetFetch: Promise<ParsedEvent | undefined> | undefined;
	let relayFeedFetch: Promise<ParsedEvent | undefined> | undefined;
	let unsubscribeAdminRelaySet: (() => void) | undefined;
	let unsubscribeRelayFeed: (() => void) | undefined;
	let publishUnsubscribers: Array<() => void> = [];

	$: communitySlug = slugFromName(communityName);
	$: inviteUrl = relay ? `${relay.base_url}/redeem` : `https://nuts.cash/join/${communitySlug}`;
	$: forceSuccess = $page.url.searchParams.has('success');
	$: successInviteUrl = forceSuccess ? `https://nuts.cash/join/${communitySlug}` : inviteUrl;
	$: displayCommunityName = forceSuccess && !communityName ? 'The Office' : communityName;
	$: displayCommunityDescription =
		forceSuccess && !communityDescription ? 'Coolest coworking in town' : communityDescription;
	$: accountReady = Boolean($key?.pub);
	$: canCreate = communityName.trim().length > 1 && (accountReady || creatorName.trim().length > 1);
	$: generateQr(successInviteUrl);

	function slugFromName(value: string) {
		return (
			value
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 63)
				.replace(/-$/g, '') || 'community'
		);
	}

	function readImageFile(event: Event, onLoad: (value: string, name: string) => void) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			const value = typeof reader.result === 'string' ? reader.result : '';
			onLoad(value, file.name);
		};
		reader.readAsDataURL(file);
	}

	function handleCommunityImageUpload(event: Event) {
		readImageFile(event, (value, name) => {
			communityImage = value;
			communityImageName = name;
		});
	}

	function handlePictureUpload(event: Event) {
		readImageFile(event, (value, name) => {
			picture = value;
			pictureName = name;
		});
	}

	async function connectWithExtension() {
		const nostr = (window as Window & { nostr?: { getPublicKey: () => Promise<string> } }).nostr;
		if (!nostr) return;
		state = 'creating-account';
		error = '';
		try {
			const pubkey = await nostr.getPublicKey();
			manager.setSigner('nip07');
			$key = {
				pub: pubkey,
				npub: nip19.npubEncode(pubkey),
				hasSigner: true
			};
			state = 'idle';
		} catch (err) {
			state = 'error';
			error = err instanceof Error ? err.message : 'Could not connect signer.';
		}
	}

	function createLocalAccount() {
		const secret = schnorr.utils.randomSecretKey();
		const privkey = bytesToHex(secret);
		const pubkey = bytesToHex(schnorr.getPublicKey(secret));
		recoveryNsec = nip19.nsecEncode(secret);

		manager.setSigner('privkey', privkey);
		$key = {
			pub: pubkey,
			priv: privkey,
			npub: nip19.npubEncode(pubkey),
			nsec: recoveryNsec,
			hasSigner: true
		};

		const metadata: EventTemplate = {
			kind: 0,
			tags: [],
			content: JSON.stringify({
				name: creatorName.trim(),
				display_name: creatorName.trim(),
				picture,
				about: `Creator of ${communityName.trim()}`
			}),
			created_at: now()
		};

		usePublish('community_signup_' + pubkey, metadata, () => undefined, {
			trackStatus: true,
			defaultRelays: INDEXER_RELAYS
		});

		return pubkey;
	}

	function publishRelayList(pubkey: string, communityRelay: string) {
		const relayList: EventTemplate = {
			kind: 10002,
			tags: buildRelayListTagsWithReadRelay(
				$kind10002?.pubkey() === pubkey ? $kind10002 : undefined,
				communityRelay,
				INDEXER_RELAYS
			),
			content: '',
			created_at: now()
		};

		usePublish('community_relay_list_' + pubkey, relayList, () => undefined, {
			trackStatus: true,
			defaultRelays: INDEXER_RELAYS
		});
	}

	function cleanupPublishes() {
		for (const unsubscribe of publishUnsubscribers) {
			unsubscribe();
		}
		publishUnsubscribers = [];
	}

	function publishRequiredEvent(
		pubId: string,
		event: EventTemplate,
		onSuccess: () => void,
		onError: (error: Error) => void
	) {
		let settled = false;
		let unsubscribePublish: () => void = () => {};
		const timeout = window.setTimeout(() => {
			if (settled) return;
			settled = true;
			unsubscribePublish();
			onError(new Error(`Could not publish kind ${event.kind} to the relay list relays.`));
		}, 8000);

		unsubscribePublish = usePublish(
			pubId,
			event,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status?.status() !== 'true') return;
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				window.setTimeout(() => {
					unsubscribePublish();
					publishUnsubscribers = publishUnsubscribers.filter(
						(unsubscribe) => unsubscribe !== unsubscribePublish
					);
					onSuccess();
				}, 0);
			},
			{
				trackStatus: true,
				defaultRelays: RELAY_LIST_PUBLISH_RELAYS
			}
		);

		publishUnsubscribers.push(unsubscribePublish);
	}

	function publishCommunityRelaySet(
		pubkey: string,
		communityRelay: string,
		onSuccess: () => void,
		onError: (error: Error) => void
	) {
		const relaySet: EventTemplate = {
			kind: 30002,
			tags: buildAdminRelaySetTags(adminRelaySet, communityRelay),
			content: '',
			created_at: now()
		};

		const relayFeeds: EventTemplate = {
			kind: 10012,
			tags: mergeRelayFeedIndexTags(relayFeed, pubkey, ['admin', 'member', 'following']),
			content: '',
			created_at: now()
		};

		publishRequiredEvent(
			'community_relay_feeds_' + pubkey,
			relayFeeds,
			() => {
				publishRequiredEvent('community_admin_relay_set_' + pubkey, relaySet, onSuccess, onError);
			},
			onError
		);
	}

	function fetchAdminRelaySet(pubkey: string) {
		unsubscribeAdminRelaySet?.();

		const relays = Array.from(
			new Set([...INDEXER_RELAYS, ...DEFAULT_RELAYS, 'wss://relay.nuts.cash'])
		);
		const requests: RequestObject[] = [
			{
				kinds: [30002],
				authors: [pubkey],
				tags: { '#d': [ADMIN_RELAY_SET_D] },
				limit: 10,
				relays,
				cacheFirst: false,
				noCache: true
			}
		];

		adminRelaySetFetch = new Promise((resolveAdminRelaySet) => {
			let resolved = false;
			const resolveLatest = () => {
				if (resolved) return;
				resolved = true;
				window.clearTimeout(timeout);
				resolveAdminRelaySet(adminRelaySet);
			};
			const timeout = window.setTimeout(resolveLatest, 3000);
			unsubscribeAdminRelaySet = useSubscription(
				'community_admin_relay_set_fetch_' + pubkey,
				requests,
				(message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					if (status?.status() === 'EOSE') {
						resolveLatest();
						return;
					}

					const parsedEvent = isParsedEvent(message);
					if (!parsedEvent || parsedEvent.kind() !== 30002) return;
					const list = asNip51(parsedEvent);
					if (list?.d() !== ADMIN_RELAY_SET_D) return;
					if (!adminRelaySet || parsedEvent.createdAt() > adminRelaySet.createdAt()) {
						adminRelaySet = parsedEvent;
					}
				},
				{ bytesPerEvent: 10 * 1024 }
			);
		});

		return adminRelaySetFetch;
	}

	function fetchRelayFeed(pubkey: string) {
		unsubscribeRelayFeed?.();

		const relays = Array.from(
			new Set([...INDEXER_RELAYS, ...DEFAULT_RELAYS, 'wss://relay.nuts.cash'])
		);
		const requests: RequestObject[] = [
			{
				kinds: [10012],
				authors: [pubkey],
				limit: 10,
				relays,
				cacheFirst: false,
				noCache: true
			}
		];

		relayFeedFetch = new Promise((resolveRelayFeed) => {
			let resolved = false;
			const resolveLatest = () => {
				if (resolved) return;
				resolved = true;
				window.clearTimeout(timeout);
				resolveRelayFeed(relayFeed);
			};
			const timeout = window.setTimeout(resolveLatest, 3000);
			unsubscribeRelayFeed = useSubscription(
				'community_relay_feed_fetch_' + pubkey,
				requests,
				(message: WorkerMessage) => {
					const status = isConnectionStatus(message);
					if (status?.status() === 'EOSE') {
						resolveLatest();
						return;
					}

					const parsedEvent = isParsedEvent(message);
					if (!parsedEvent || parsedEvent.kind() !== 10012) return;
					if (!relayFeed || parsedEvent.createdAt() > relayFeed.createdAt()) {
						relayFeed = parsedEvent;
					}
				},
				{ bytesPerEvent: 10 * 1024 }
			);
		});

		return relayFeedFetch;
	}

	async function createRelay(adminPubkey: string) {
		const response = await fetch(`${coordinatorUrl.replace(/\/$/, '')}/relays`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: communityName.trim(),
				domain_label: communitySlug,
				admin_pubkeys: [adminPubkey],
				badge_d: 'members'
			})
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(body || `Coordinator returned ${response.status}`);
		}

		return (await response.json()) as RelayRecord;
	}

	async function createCommunity() {
		if (!canCreate || state === 'creating-account' || state === 'creating-relay') return;

		error = '';
		recoveryNsec = '';
		relay = undefined;

		try {
			let adminPubkey = $key?.pub;
			if (!adminPubkey) {
				state = 'creating-account';
				adminPubkey = createLocalAccount();
			} else {
				relayFeed = await (relayFeedFetch || fetchRelayFeed(adminPubkey));
			}

			state = 'creating-relay';
			relay = await createRelay(adminPubkey);
			adminRelaySet = await (adminRelaySetFetch || fetchAdminRelaySet(adminPubkey));
			publishRelayList(adminPubkey, relay.relay_url);
			publishCommunityRelaySet(
				adminPubkey,
				relay.relay_url,
				() => {
					if (!relay) return;
					void goto(resolve(`/admin/${encodeURIComponent(relay.relay_url)}`));
				},
				(err) => {
					state = 'error';
					error = err.message;
				}
			);
		} catch (err) {
			state = 'error';
			error = err instanceof Error ? err.message : 'Could not create community.';
		}
	}

	async function generateQr(text: string) {
		const requestId = ++qrRequest;
		const nextQrDataUrl = await QRCode.toDataURL(text, {
			errorCorrectionLevel: 'M',
			margin: 1,
			width: 720,
			color: {
				dark: '#151411',
				light: '#fff8ea'
			}
		});
		if (requestId !== qrRequest) return;
		qrDataUrl = nextQrDataUrl;
	}

	onMount(() => {
		if ($key?.pub) {
			fetchAdminRelaySet($key.pub);
			fetchRelayFeed($key.pub);
		}
	});

	onDestroy(() => {
		unsubscribeAdminRelaySet?.();
		unsubscribeRelayFeed?.();
		cleanupPublishes();
	});
</script>

<svelte:head>
	<title>Create community - Nuts</title>
	<meta
		name="description"
		content="Create a Nuts community with a local account, private relay and invite link."
	/>
</svelte:head>

<main class="min-h-screen bg-[#f7f5ef] text-[#171614]">
	<section class="flex min-h-screen items-stretch gap-0">
		<CommunityBenefitsPanel />
		{#if (state === 'done' && relay) || forceSuccess}
			<CommunityCreatedScreen
				communityName={displayCommunityName}
				communityDescription={displayCommunityDescription}
				{communityImage}
				inviteUrl={successInviteUrl}
				{qrDataUrl}
				{recoveryNsec}
			/>
		{:else}
			<section class="min-w-0 flex-1 px-4 pb-12 pt-4 sm:px-6 lg:px-8 xl:px-10">
				<a
					class="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-black text-stone-600 no-underline transition hover:bg-white/75 hover:text-[#171614] focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
					href={resolve('/')}
				>
					<ArrowLeft size={17} />
					Back
				</a>
				<p class="mt-12 text-sm font-black text-emerald-900">Create community</p>
				<h1 class="mt-4 max-w-4xl text-5xl font-black leading-[0.95] tracking-normal lg:text-7xl">
					Launch your community.
				</h1>
				{#if accountReady}
					<p class="mt-7 max-w-2xl text-xl font-medium leading-9 text-stone-600">
						Create the digital home for your club, association, village, event or organization.
					</p>
				{:else}
					<p class="mt-7 max-w-2xl text-xl font-medium leading-9 text-stone-600">
						Already have a Nuts or Nostr account? Sign in first. New here? We’ll create your account
						with the community.
					</p>
				{/if}

				<div class="mt-12 max-w-5xl">
					<div class="flex items-end justify-between gap-4">
						<div>
							<p class="text-sm font-black text-stone-500">Step 1</p>
							<h2 class="mt-1 text-2xl font-black">Pick the closest shape</h2>
						</div>
						<p
							class="hidden max-w-xs text-right text-sm font-semibold leading-6 text-stone-500 sm:block"
						>
							This only tunes the starting profile. You can change details later.
						</p>
					</div>
					<div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
						{#each communityTypes as type (type.label)}
							<button
								type="button"
								class={`grid h-28 place-items-center rounded-xl border p-3 text-center font-black transition focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] ${
									communityType === type.label
										? 'border-emerald-950 bg-emerald-950 text-white shadow-sm shadow-emerald-950/20'
										: 'border-stone-200 bg-white/80 text-stone-600 shadow-sm shadow-stone-950/5 hover:border-stone-300 hover:bg-white hover:text-[#171614]'
								}`}
								on:click={() => (communityType = type.label)}
							>
								<svelte:component this={type.icon} size={30} />
								<span class="text-sm">{type.label}</span>
							</button>
						{/each}
					</div>
				</div>

				<div
					class="mt-10 max-w-5xl rounded-2xl border border-stone-200 bg-white/85 p-5 shadow-sm shadow-stone-950/5 sm:p-7"
				>
					<div class="flex flex-wrap items-end justify-between gap-4">
						<div>
							<p class="text-sm font-black text-stone-500">Step 2</p>
							<h2 class="mt-1 text-2xl font-black">Community details</h2>
						</div>
						<p class="text-sm font-semibold text-stone-500">Relay slug: {communitySlug}</p>
					</div>
					<div class="mt-6 grid gap-5">
						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-600">Community name</span>
							<input
								class="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-4 text-lg font-black outline-none transition placeholder:text-stone-400 focus:border-emerald-900 focus:bg-white focus:ring-2 focus:ring-emerald-800/20"
								bind:value={communityName}
								autocomplete="organization"
								maxlength="50"
								placeholder="FC Avenir"
							/>
							<small class="justify-self-end text-xs font-black text-stone-400"
								>{communityName.length}/50</small
							>
						</label>

						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-600">Description</span>
							<textarea
								class="min-h-28 w-full resize-y rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-4 text-base font-semibold leading-7 outline-none transition placeholder:text-stone-400 focus:border-emerald-900 focus:bg-white focus:ring-2 focus:ring-emerald-800/20"
								rows="3"
								maxlength="200"
								bind:value={communityDescription}
								placeholder="A place for players, parents and supporters."
							></textarea>
							<small class="justify-self-end text-xs font-black text-stone-400"
								>{communityDescription.length}/200</small
							>
						</label>

						<label class="grid gap-2">
							<span class="text-sm font-black text-stone-600"
								>Community image <em class="font-semibold not-italic">(optional)</em></span
							>
							<input
								class="sr-only"
								type="file"
								accept="image/*"
								on:change={handleCommunityImageUpload}
							/>
							<span
								class="grid min-h-28 cursor-pointer grid-cols-[72px_1fr] items-center gap-4 rounded-xl border border-dashed border-stone-300 bg-stone-50/70 p-4 transition hover:border-emerald-900/50 hover:bg-white"
							>
								{#if communityImage}
									<img
										class="h-[72px] w-[72px] rounded-lg object-cover"
										src={communityImage}
										alt=""
									/>
								{:else}
									<span
										class="grid h-[72px] w-[72px] place-items-center rounded-lg bg-emerald-950 text-white"
									>
										<ImagePlus size={28} />
									</span>
								{/if}
								<span>
									<strong class="block text-lg font-black">Upload image</strong>
									<small class="mt-1 block text-sm font-semibold text-stone-500"
										>{communityImageName || 'JPG, PNG or GIF. Max 5MB'}</small
									>
								</span>
							</span>
						</label>

						{#if !accountReady}
							<label class="grid gap-2">
								<span class="text-sm font-black text-stone-600">Your name</span>
								<input
									class="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-4 text-lg font-black outline-none transition placeholder:text-stone-400 focus:border-emerald-900 focus:bg-white focus:ring-2 focus:ring-emerald-800/20"
									bind:value={creatorName}
									autocomplete="name"
									placeholder="Marie"
								/>
							</label>

							<label class="grid gap-2">
								<span class="text-sm font-black text-stone-600"
									>Your picture <em class="font-semibold not-italic">(optional)</em></span
								>
								<input
									class="sr-only"
									type="file"
									accept="image/*"
									on:change={handlePictureUpload}
								/>
								<span
									class="grid min-h-24 cursor-pointer grid-cols-[64px_1fr] items-center gap-4 rounded-xl border border-dashed border-stone-300 bg-stone-50/70 p-4 transition hover:border-emerald-900/50 hover:bg-white"
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
										<small class="mt-1 block text-sm font-semibold text-stone-500"
											>{pictureName || 'Optional account picture'}</small
										>
									</span>
								</span>
							</label>
						{/if}
					</div>
				</div>

				{#if !accountReady}
					<div
						class="mt-5 flex max-w-5xl flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white/60 p-3 text-sm font-bold text-stone-600 shadow-sm shadow-stone-950/5"
					>
						<button
							class="rounded-xl border border-stone-300 bg-white px-4 py-2 font-black text-[#171614] transition hover:border-emerald-900/50 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98]"
							type="button"
							on:click={connectWithExtension}>Sign in</button
						>
						<span>or continue below to create a new account</span>
					</div>
				{/if}

				{#if state === 'error'}
					<p
						class="mt-5 max-w-5xl break-words rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-800"
					>
						{error}
					</p>
				{/if}

				<div class="mt-8 flex max-w-5xl flex-wrap items-center gap-5">
					<button
						type="button"
						class="inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-emerald-950 px-7 text-base font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!canCreate || state === 'creating-account' || state === 'creating-relay'}
						on:click={createCommunity}
					>
						{#if state === 'creating-account' || state === 'creating-relay'}
							<span class="animate-spin">
								<Loader2 size={18} />
							</span>
							{state === 'creating-account' ? 'Creating account' : 'Creating community'}
						{:else}
							Create community
							<ArrowRight size={20} />
						{/if}
					</button>
					<p class="max-w-sm text-sm font-semibold leading-6 text-stone-500">
						You'll be able to invite members and customize more after creation.
					</p>
				</div>
			</section>
		{/if}

		<aside
			class="mx-auto hidden w-full max-w-[420px] px-6 pb-10 pt-6 xl:sticky xl:top-6 xl:block xl:w-[390px] xl:px-0 2xl:w-[420px] 2xl:self-start"
			aria-label="Community preview"
		>
			<div
				class="w-full min-w-0 rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm shadow-stone-950/5"
			>
				<p class="inline-flex items-center gap-2 text-sm font-black text-[#171614]">
					<span class="h-2.5 w-2.5 rounded-full bg-emerald-600"></span>
					Live preview
				</p>
				<div
					class="mt-4 w-full min-w-0 overflow-hidden rounded-2xl bg-[#fbf7ef] shadow-lg shadow-stone-950/10"
				>
					<div class="grid justify-items-center bg-emerald-950 px-8 py-12 text-center text-white">
						<div
							class="grid h-32 w-32 place-items-center rounded-2xl bg-[#e4ead7] text-[#171614] shadow-lg shadow-black/15"
						>
							{#if communityImage}
								<img class="h-32 w-32 rounded-2xl object-cover" src={communityImage} alt="" />
							{:else}
								<UserRound size={40} />
							{/if}
						</div>
						<h2 class="mt-6 max-w-full break-words text-3xl font-black">
							{displayCommunityName || 'New community'}
						</h2>
						<p class="mt-2 max-w-full break-words text-base font-semibold leading-7 text-white/70">
							{displayCommunityDescription || 'A home for your people.'}
						</p>
						<div class="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-8 text-white/85">
							<span class="text-lg font-black"
								><UsersRound class="mx-auto mb-1" size={18} />0<br /><small
									class="text-sm font-semibold text-white/55">Members</small
								></span
							>
							<span class="h-12 w-px bg-white/10"></span>
							<span class="text-lg font-black"
								><CalendarDays class="mx-auto mb-1" size={18} />0<br /><small
									class="text-sm font-semibold text-white/55">Events</small
								></span
							>
						</div>
					</div>
					<div class="p-6">
						<p class="break-words text-base font-semibold leading-7 text-[#171614]">
							{displayCommunityDescription ||
								'A community for people to meet, share, organize and grow together.'}
						</p>
						<hr class="my-6 border-stone-200" />
						<h3 class="text-sm font-black text-stone-500">What members can do</h3>
						<ul class="mt-5 grid gap-5">
							<li class="flex gap-3 text-sm">
								<CheckCircle2 class="mt-1 shrink-0 text-emerald-800" size={17} />
								<span
									><strong class="block text-base">Join and connect</strong>Find your people.</span
								>
							</li>
							<li class="flex gap-3 text-sm">
								<CheckCircle2 class="mt-1 shrink-0 text-emerald-800" size={17} />
								<span
									><strong class="block text-base">Share and discuss</strong>Posts, polls, events
									and more.</span
								>
							</li>
							<li class="flex gap-3 text-sm">
								<CheckCircle2 class="mt-1 shrink-0 text-emerald-800" size={17} />
								<span
									><strong class="block text-base">Organize events</strong>Meetups, trainings,
									workshops...</span
								>
							</li>
							<li class="flex gap-3 text-sm">
								<CheckCircle2 class="mt-1 shrink-0 text-emerald-800" size={17} />
								<span
									><strong class="block text-base">Grow together</strong>Build something meaningful.</span
								>
							</li>
						</ul>
						<button
							class="mt-8 flex w-full items-center justify-between rounded-xl bg-[#e4ead7] px-6 py-4 font-black text-[#171614] transition hover:bg-[#d9e2c6] active:scale-[0.98]"
							type="button">Join community <UsersRound size={22} /></button
						>
					</div>
				</div>
			</div>
		</aside>
	</section>
</main>
