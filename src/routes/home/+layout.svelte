<script lang="ts">
	import {
		Kind10019Parsed,
		ParsePipeConfigT,
		PipeConfig,
		PipeT,
		ProofVerificationPipeConfigT,
		SaveToDbPipeConfigT,
		type ConnectionStatus,
		type ParsedEvent,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind0,
		asKind10019,
		asParsedEvent,
		ConnectionTracker,
		fbArray,
		fbIterable,
		isConnectionStatus,
		isKind17375,
		isKind9321,
		isParsedEvent,
		isValidProofs
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { onMount, onDestroy } from 'svelte';

	import Connect from 'src/components/Connect.svelte';
	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { key } from 'src/controller/key';
	import {
		delayedPromise,
		kind0,
		kind10019,
		kind10019Ready,
		kind17375,
		readRelays
	} from 'src/controller/nostr';
	import { addProofs, nutsWallet, setNutsWallet } from 'src/controller/proofs';
	import { activeMintUrl, walletLoaded } from 'src/controller/wallet';
	import { normalizeMintURL } from 'src/lib/utils';
	import Feed from 'src/routes/explore/feed.svelte';
	import MintCard from 'src/routes/home/components/mintcard.svelte';
	import Kind9321 from 'src/routes/kinds/kind9321.svelte';
	import { go } from 'src/routes/modals/modal';
	import EmptyWallet from './emptyWallet.svelte';
	import { DEFAULT_MINTS } from 'src/lib/wallet';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import { proxyAvatarUrl } from 'src/lib/proxy';

	export let visible = false;

	let isViewing = false;

	let scrollY: number;
	let privateKey: string;
	let loading = false;
	let extensionError = false;
	let showLinkProfile = true;

	// Wallet feed items - managed in parent
	let rawWalletEvents: ParsedEvent[] = [];

	// Viewport state
	let start = 0;
	let end = 0;

	function oneDayDiff(firstTimestampInSeconds: number, secondTimestampInSeconds: number): boolean {
		const differenceInSeconds = Math.abs(firstTimestampInSeconds - secondTimestampInSeconds);

		return differenceInSeconds > 86_400;
	}

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	$: walletRelays =
		$kind10019 &&
		fbArray(asKind10019($kind10019) as Kind10019Parsed, 'readRelays').map((r) => r.toString());

	let defaultRelays: string[];

	const connectionTracker = new ConnectionTracker();

	setTimeout(() => (defaultRelays = DEFAULT_RELAYS), 3000);

	$: relays =
		(walletRelays?.length && walletRelays) || ($readRelays?.length && $readRelays) || defaultRelays;

	const relayPromise = Promise.race([kind10019Ready.promise, delayedPromise]);

	let unsubscribeWallet: (() => void) | undefined;

	let proofs: () => void;

	$: if ($key?.pub && !loading) {
		proofs?.();
		proofs = useSubscription(
			'nutszap_' + $key?.pub,
			[
				{ kinds: [7375], authors: [$key?.pub], relays },
				{ kinds: [9321], tags: { '#p': [$key?.pub] }, noCache: true, limit: 50, relays }
			],
			(message) => {
				const vps = isValidProofs(message);
				if (vps) {
					for (const mintProofs of fbIterable(vps, 'proofs')) {
						addProofs(
							mintProofs.mint()!.toString(),
							fbArray(mintProofs, 'proofs').map((p) => ({
								C: p.c()!.toString(),
								amount: Number(p.amount()),
								id: p.id()!.toString(),
								secret: p.secret()!.toString(),
								dleq: {
									e: p.dleq()?.e()?.toString() as string,
									r: p.dleq()?.r()?.toString() as string,
									s: p.dleq()?.s()?.toString() as string
								}
							}))
						);
					}
				}
			},
			{
				pipeline: [
					new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
					new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
					new PipeT(PipeConfig.ProofVerificationPipeConfig, new ProofVerificationPipeConfigT(500))
				],
				isSlow: true
			}
		);
	}

	// Wallet feed subscription - moved from Feed to parent
	$: if (visible && $key?.pub && relays?.length) {
		unsubscribeWallet?.();
		unsubscribeWallet = useSubscription(
			'home_' + $key?.pub,
			[
				{
					kinds: [9321],
					authors: [$key?.pub],
					limit: 50,
					relays: relays,
					nocache: true
				},
				{
					kinds: [9321],
					tags: { '#p': [$key?.pub] },
					limit: 50,
					relays: relays,
					noCache: true
				}
			],
			handleWalletFeedEvents
		);
	}

	function handleWalletFeedEvents(message: WorkerMessage) {
		const event = isParsedEvent(message);
		const kind9321 = isKind9321(message);
		if (!kind9321 || !event) return;

		// Deduplicate by event ID hash (fnv1a)
		const eventIdHash = event.id()?.fnv1aHash();
		if (!eventIdHash) return;
		if (rawWalletEvents.some((e) => e.id()?.fnv1aHash() === eventIdHash)) return;

		rawWalletEvents = [...rawWalletEvents, event];
	}

	// Process and sort wallet items in parent (slice to avoid mutating original)
	$: walletItems = rawWalletEvents.slice().sort((a, b) => b.createdAt() - a.createdAt());

	// Cleanup subscription on unmount
	onDestroy(() => {
		unsubscribeWallet?.();
	});

	$: if ($key?.pub && relays?.length) {
		useSubscription(
			'active_wallet_' + $key?.pub,
			[
				// { kinds: [7375], authors: [$key?.pub], limit: 10, relays: relays },
				{ kinds: [17375], authors: [$key?.pub], limit: 10, relays: [...DEFAULT_RELAYS, ...relays] }
			],
			handleWalletEvents,
			{ bytesPerEvent: 6144 }
		);
	}

	function handleWalletEvents(message: WorkerMessage) {
		const status = isConnectionStatus(message);
		if (status) {
			connectionTracker.handleMessage(message);
			if (connectionTracker.resolutionRate > 0.5) {
				walletLoaded.resolve(true);
			}
			connectionStatus[status?.relayUrl()!.toString()] = status;
			return;
		}
		const parsedEvent = isParsedEvent(message);
		const wallet = isKind17375(message);
		if (parsedEvent && wallet) {
			// Only update if the store is empty or the event is more recent
			if (!$kind17375 || parsedEvent.createdAt() > $kind17375.createdAt()) {
				$kind17375 = parsedEvent;
				$activeMintUrl = wallet.mints(0).toString() && normalizeMintURL(wallet.mints(0).toString());
			}
			if (wallet.p2pkPrivKey()) {
				setNutsWallet(
					wallet.p2pkPrivKey()!.toString(),
					wallet.p2pkPrivKey()!.toString(),
					fbArray(wallet, 'mints').map((m) => normalizeMintURL(m.toString())),
					Number(parsedEvent.createdAt())
				);
			}
		}
	}

	onMount(() => {
		walletLoaded.then(() => (loading = false));
	});
</script>

<Pager rootPath="/home">
	<Feed
		items={walletItems}
		getItemId={(item) => item?.id?.()?.fnv1aHash?.()}
		backdrop={!walletItems.length}
		pullToRefresh
		bind:start
		bind:end
	>
		<svelte:fragment slot="header">
			<div
				class="w-feed bg-base-300 bg-opacity-85 backdrop-blur-md rounded-lg px-1 shadow-widget-down"
			>
				<div
					class="relative pt-safe place-content-center m-auto z-10"
					class:shadow-md={scrollY > 0}
				>
					<div class="flex justify-between lg:m-auto h-16 items-center">
						<h1 class="text-2xl font-semibold">Home</h1>
						<div class="flex gap-2 items-center">
							<div on:click={() => (isViewing = !isViewing)}>
								<Icon icon={isViewing ? 'ph:eye-closed' : 'ph:eye'} class="text-2xl" />
							</div>
							<button on:click|stopPropagation={() => go('qr')}
								><Icon icon="ph:qr-code" class="text-2xl" /></button
							>
							<div on:click|stopPropagation={() => go('profile')} class="cursor-pointer">
								<img
									src={proxyAvatarUrl(
										asKind0($kind0)?.picture()?.toString() || '/miss-profile.png'
									)}
									class="w-8 h-8 border rounded-full"
								/>
							</div>
						</div>
					</div>
					<RelaysList {relays} {connectionStatus} />
					{#if loading}
						loading
					{:else if $nutsWallet}
						<div
							class="flex items-stretch justify-start overflow-x-scroll scrollbar-hide snap-x snap-mandatory scroll-smooth mt-2"
							on:touchmove|stopPropagation
						>
							{#each $nutsWallet.mintUrls || [] as url}
								<MintCard mintUrl={url} navigate />
							{/each}
						</div>
					{:else if $key?.pub && walletItems.length}
						<div class="w-full p-4 rounded-lg mb-4 border border-primary-content mt-4">
							<div class="flex items-center justify-between">
								<div>
									<h3 class="font-semibold text-lg">Setup Your Wallet</h3>
									<p class="text-sm text-secondary-content">Configure your wallet to get started</p>
								</div>
								<button class="btn btn-accent" on:click|stopPropagation={() => go('wallet')}>
									<Icon icon="ph:wallet-bold" class="mr-2" />
									Setup Wallet
								</button>
							</div>
						</div>
					{/if}
				</div>
				{#if $nutsWallet}
					<div class="flex lg:gap-8 gap-4 px-4 py-2 mt-2 w-feed m-auto">
						<div class="text-center">
							<button
								class="btn w-14 h-14 btn-primary btn-circle text-base-100"
								on:click|stopPropagation={() => go('receive')}
							>
								<Icon icon="teenyicons:add-outline" class="text-2xl" />
							</button>
							<div class="text-sm mt-1 font-semibold">Receive</div>
						</div>
						<div class="text-center">
							<button
								class="btn w-14 h-14 btn-primary btn-circle text-base-100"
								on:click|stopPropagation={() => go('send')}
							>
								<Icon icon="ph:arrow-right" class="w-8 h-8" />
							</button>
							<div class="text-sm mt-1 font-semibold">Send</div>
						</div>
						<div class="text-center">
							<a
								class="btn w-14 h-14 btn-outline btn-circle"
								on:click|stopPropagation={() => go('scan')}
							>
								<Icon icon="teenyicons:scan-solid" class="text-2xl" />
							</a>
							<div class="text-sm mt-1 font-semibold">Scan</div>
						</div>
						<div class="flex-grow w-1/4" />
					</div>
				{/if}
			</div>
		</svelte:fragment>
		<svelte:fragment slot="empty-content">
			<br />
			{#if !$key?.pub}
				<Connect />
			{:else}
				<EmptyWallet hasWallet={!!$kind17375} />
			{/if}
		</svelte:fragment>
		<div slot="item-content" let:post let:visible let:index>
			<!-- {#if post} -->
			<Kind9321
				zap={post}
				context={[]}
				isFirst={index == 0 || oneDayDiff(post.createdAt(), walletItems[index - 1]?.createdAt())}
				isLast={index == walletItems.length - 1 ||
					oneDayDiff(post.createdAt(), walletItems[index + 1]?.createdAt())}
			/>
			<!-- {/if} -->
		</div>
		<!-- <svelte:fragment slot="item-content" let:post let:context let:visible>
		</svelte:fragment> -->
	</Feed>
</Pager>
