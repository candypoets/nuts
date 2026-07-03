<script lang="ts">
	import {
		Kind10019Parsed,
		MessageType,
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
		asKind9321,
		asConnectionStatus,
		asKind9735,
		ConnectionTracker,
		fbArray,
		fbIterable,
		isKind17375,
		isKind9321,
		isKind9735,
		isParsedEvent,
		isValidProofs,
		isConnectionStatus
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';

	import Connect from 'src/components/Connect.svelte';
	import Pager from 'src/components/Pager.svelte';
	import { key } from 'src/controller/key';
	import {
		delayedPromise,
		kind0,
		kind10019,
		kind10019Ready,
		kind17375,
		mutePipeConfig,
		readRelays
	} from 'src/controller/nostr';
	import { addProofs, nutsWallet, setNutsWallet } from 'src/controller/proofs';
	import { activeMintUrl, walletLoaded } from 'src/controller/wallet';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { normalizeMintURL } from 'src/lib/utils';
	import Feed from 'src/routes/explore/feed.svelte';
	import MintCard from 'src/routes/home/components/mintcard.svelte';
	import Kind9321 from 'src/routes/kinds/kind9321.svelte';
	import Kind9735 from 'src/routes/kinds/kind9735.svelte';
	import { go } from 'src/routes/modals/modal';
	import EmptyWallet from './emptyWallet.svelte';

	export let visible = false;

	let isViewing = false;

	let scrollY = 0;
	let privateKey: string;
	let loading = false;
	let extensionError = false;
	let showLinkProfile = true;
	let refreshing = false;
	let refreshCounter = 0;

	// Wallet feed items - managed in parent
	let rawWalletEvents: ParsedEvent[] = [];

	// Viewport state
	let start = 0;
	let end = 0;

	// Track seen event IDs for deduplication during refresh
	let seenEventIds = new Set<string>();

	// Track if EOSE has been received for proof verification
	let eoseReceived = false;

	// Refresh timeout fallback
	let refreshTimeout: ReturnType<typeof setTimeout> | undefined;

	// Reset EOSE flag on refresh
	function resetEoseFlag() {
		eoseReceived = false;
	}

	// Pagination state
	let until: number | undefined = undefined;
	let hasMore = true;
	let paginationCounter = 0;
	let itemsBeforePagination = 0;
	let paginationStartedAt = 0;
	let paginationTimeout: ReturnType<typeof setTimeout> | undefined;
	let paginationMinTimeout: ReturnType<typeof setTimeout> | undefined;
	const paginationMinDurationMs = 1000;
	const paginationMaxDurationMs = 3000;
	const walletEventRequestLimit = 50;

	function oneDayDiff(firstTimestampInSeconds: number, secondTimestampInSeconds: number): boolean {
		const differenceInSeconds = Math.abs(firstTimestampInSeconds - secondTimestampInSeconds);

		return differenceInSeconds > 86_400;
	}

	$: walletRelays =
		$kind10019 &&
		fbArray(asKind10019($kind10019) as Kind10019Parsed, 'readRelays')
			.map((r) => fbString(r))
			.filter((r): r is string => !!r);

	let defaultRelays: string[];
	const homeWalletRelays = ['wss://relay.nuts.cash'];

	const connectionTracker = new ConnectionTracker();

	setTimeout(() => (defaultRelays = DEFAULT_RELAYS), 3000);

	$: relays = Array.from(
		new Set([
			...homeWalletRelays,
			...(defaultRelays || []),
			...(walletRelays || []),
			...($readRelays || [])
		])
	).filter((relay): relay is string => !!relay);

	const relayPromise = Promise.race([kind10019Ready.promise, delayedPromise]);

	let unsubscribeWallet: (() => void) | undefined;
	let unsubscribeProofs: (() => void) | undefined;
	let unsubscribeActiveWallet: (() => void) | undefined;
	let prevPaginationSubId: string | undefined = undefined;

	let proofs: () => void;

	type HomeRelayRequest = {
		kinds: number[];
		authors?: string[];
		tags?: Record<string, string[]>;
		limit?: number;
		relays?: string[];
		noCache?: boolean;
		until?: number;
	};

	function fbString(value: string | Uint8Array | null | undefined) {
		return typeof value === 'string' ? value : undefined;
	}

	function finishPaginationLoading(reason: string) {
		if (!itemsBeforePagination) return;
		const elapsed = Date.now() - paginationStartedAt;
		const remainingMinWait = Math.max(0, paginationMinDurationMs - elapsed);
		if (paginationMinTimeout) clearTimeout(paginationMinTimeout);
		paginationMinTimeout = setTimeout(() => {
			console.log('[Home] Pagination finished:', reason);
			loading = false;
			paginationMinTimeout = undefined;
		}, remainingMinWait);
	}

	async function handleProofsMessage(message: WorkerMessage) {
		switch (message.type()) {
			case MessageType.Eoce: {
				// End of Cache Event - verify all proofs
				const wallet = get(nutsWallet);
				if (wallet) {
					wallet
						.verifyAndCleanProofs()
						.catch((e) => console.error('[wallet] EOCE verification failed:', e));
				}
				return;
			}
			case MessageType.ConnectionStatus: {
				const status = asConnectionStatus(message) as ConnectionStatus;
				const statusStr = status?.status();
				if (statusStr === 'EOSE' && !eoseReceived) {
					eoseReceived = true;
					const wallet = get(nutsWallet);
					if (wallet) {
						wallet
							.verifyAndCleanProofs()
							.catch((e) => console.error('[wallet] EOSE verification failed:', e));
					}
				}
				return;
			}
		}

		const vps = isValidProofs(message);
		if (vps) {
			for (const mintProofs of fbIterable(vps, 'proofs')) {
				const mint = mintProofs.mint()!;
				const proofs = fbArray(mintProofs, 'proofs').map((p) => ({
					C: p.c()!,
					amount: Number(p.amount()),
					id: p.id()!,
					secret: p.secret()!,
					dleq: {
						e: p.dleq()?.e() as string,
						r: p.dleq()?.r() as string,
						s: p.dleq()?.s() as string
					}
				}));

				// After EOSE, verify spending state of each proof before adding
				if (eoseReceived) {
					const wallet = get(nutsWallet);
					if (wallet) {
						try {
							const validProofs = await wallet.checkAndFilterProofs(mint, proofs);
							if (validProofs.length > 0) {
								addProofs(mint, validProofs);
							}
						} catch (e) {
							console.error('[wallet] Proof verification failed:', e);
							// Fall back to adding without verification
							addProofs(mint, proofs);
						}
					} else {
						addProofs(mint, proofs);
					}
				} else {
					addProofs(mint, proofs);
				}
			}
		}
	}

	function initProofsSubscription() {
		if (!$key?.pub) return;
		unsubscribeProofs?.();
		const subId = 'nutszap_' + $key?.pub + '_' + refreshCounter;
		const requests: HomeRelayRequest[] = [
			{ kinds: [7375], authors: [$key?.pub], relays },
			{
				kinds: [9321],
				tags: { '#p': [$key?.pub] },
				noCache: refreshing,
				limit: walletEventRequestLimit,
				relays
			}
		];
		unsubscribeProofs = useSubscription(subId, requests, handleProofsMessage, {
			pipeline: [
				new PipeT(PipeConfig.MuteFilterPipeConfig, $mutePipeConfig),
				new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
				new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
				new PipeT(PipeConfig.ProofVerificationPipeConfig, new ProofVerificationPipeConfigT(500))
			],
			isSlow: true
		});
	}

	$: if ($key?.pub && $key?.hasSigner !== false && !loading) {
		resetEoseFlag();
		initProofsSubscription();
	}

	// Build requests for wallet feed subscription
	function buildWalletRequests(isPagination = false): HomeRelayRequest[] {
		const baseReq = {
			limit: walletEventRequestLimit,
			relays: relays,
			noCache: refreshing
		};
		if (isPagination && until) {
			(baseReq as typeof baseReq & { until: number }).until = until;
		}
		return [
			{
				...baseReq,
				kinds: [9321, 9735],
				authors: [$key?.pub]
			},
			{
				...baseReq,
				kinds: [9321, 9735],
				tags: { '#p': [$key?.pub] }
			},
			{
				...baseReq,
				kinds: [9735],
				tags: { '#P': [$key?.pub] }
			}
		];
	}

	// Wallet feed subscription - moved from Feed to parent
	function initWalletFeedSubscription(isPagination = false) {
		if (!visible || !$key?.pub || !relays?.length) return;
		if (!isPagination) {
			unsubscribeWallet?.();
		}
		const subId = isPagination
			? 'home_page_' + $key?.pub + '_' + paginationCounter + '_' + until
			: 'home_' + $key?.pub + '_' + refreshCounter;
		const requests = buildWalletRequests(isPagination);
		const unsubscribe = useSubscription(subId, requests, handleWalletFeedEvents, {
			pagination: isPagination ? prevPaginationSubId : undefined
		});
		// Track this subId for next pagination
		if (isPagination) {
			prevPaginationSubId = subId;
		}
		if (!isPagination) {
			unsubscribeWallet = unsubscribe;
		}
		return unsubscribe;
	}

	$: if (visible && $key?.pub && $key?.hasSigner !== false && relays?.length) {
		initWalletFeedSubscription();
	}

	function handleWalletFeedEvents(message: WorkerMessage) {
		const status = isConnectionStatus(message);
		if (status) {
			if (status.status() === 'EOSE') {
				if (itemsBeforePagination) {
					finishPaginationLoading('EOSE');
				} else {
					loading = false;
				}
				refreshing = false;
			}
			return;
		}
		const event = isParsedEvent(message);
		const kind9321 = isKind9321(message);
		const kind9735 = isKind9735(message);

		if ((!kind9321 && !kind9735) || !event) return;

		// Deduplicate by event ID hash (fnv1a)
		const eventId = event.id();
		if (!eventId) return;
		if (seenEventIds.has(eventId)) return;
		seenEventIds.add(eventId);
		if (rawWalletEvents.some((e) => e.id() === eventId)) return;

		rawWalletEvents = [...rawWalletEvents, event];
	}

	// Process and sort wallet items in parent (slice to avoid mutating original)
	$: walletItems = rawWalletEvents.slice().sort((a, b) => b.createdAt() - a.createdAt());
	$: isPaginating = loading && itemsBeforePagination > 0;

	// Cleanup subscription on unmount
	onDestroy(() => {
		unsubscribeWallet?.();
		unsubscribeProofs?.();
		unsubscribeActiveWallet?.();
		if (refreshTimeout) clearTimeout(refreshTimeout);
		if (paginationTimeout) clearTimeout(paginationTimeout);
		if (paginationMinTimeout) clearTimeout(paginationMinTimeout);
		prevPaginationSubId = undefined;
	});

	// Handle near-bottom pagination
	function handleNearBottom(event: { distance: number }) {
		console.log('[Home] handleNearBottom called', {
			loading,
			hasMore,
			walletItemsLength: walletItems.length
		});
		if (loading || !hasMore || walletItems.length === 0) {
			console.log('[Home] Pagination blocked:', {
				loading,
				hasMore,
				walletItemsLength: walletItems.length
			});
			return;
		}

		loading = true;
		itemsBeforePagination = walletItems.length;
		paginationStartedAt = Date.now();
		paginationCounter++;

		// Use the createdAt of an item ~5 positions back as until (with overlap buffer)
		// This prevents gaps if the last few items arrived out of order
		const overlapIndex = Math.max(0, walletItems.length - 6);
		const cursorItem = walletItems[overlapIndex];
		if (cursorItem) {
			until = cursorItem.createdAt() - 1;
			console.log(
				'[Home] Pagination cursor at index',
				overlapIndex,
				'of',
				walletItems.length,
				'timestamp:',
				until
			);
		}

		initWalletFeedSubscription(true);

		// Fallback: clear loading after timeout if EOSE isn't received.
		paginationTimeout = setTimeout(() => {
			finishPaginationLoading('timeout');
		}, paginationMaxDurationMs);
	}

	// Track when pagination completes and check if new items were added
	$: if (!loading && itemsBeforePagination > 0) {
		const itemsAtCheck = itemsBeforePagination;

		// Clear the timeout if it hasn't fired yet
		if (paginationTimeout) {
			clearTimeout(paginationTimeout);
			paginationTimeout = undefined;
		}

		// Check if we actually got new items
		const newItemsAdded = walletItems.length - itemsAtCheck;
		console.log('[Home] Pagination complete. New items added:', newItemsAdded);
		if (newItemsAdded === 0) {
			hasMore = false;
			console.log('[Home] No more data available');
		}
		itemsBeforePagination = 0;
	}

	// Handle refresh - keep feed items, just refresh data
	function handleRefresh() {
		if (refreshing || !$key?.pub) return;
		refreshing = true;
		refreshCounter++;
		resetEoseFlag();

		// Clear any existing timeout
		if (refreshTimeout) {
			clearTimeout(refreshTimeout);
		}

		// Fallback: stop refreshing after 10 seconds
		refreshTimeout = setTimeout(() => {
			refreshing = false;
			refreshTimeout = undefined;
		}, 10000);

		// Verify wallet proofs - check if any are spent and clean them up
		const wallet = get(nutsWallet);
		if (wallet) {
			wallet
				.verifyAndCleanProofs()
				.catch((e) => console.error('[wallet] Refresh verification failed:', e));
		}

		// Re-init subscriptions with unique subIds (forces noCache via new subId)
		initProofsSubscription();
		initWalletFeedSubscription();
		initActiveWalletSubscription();
	}

	function initActiveWalletSubscription() {
		if (!$key?.pub || !relays?.length) return;
		unsubscribeActiveWallet?.();
		const subId = 'active_wallet_' + $key?.pub + '_' + refreshCounter;
		const requests: HomeRelayRequest[] = [
			{
				kinds: [17375],
				authors: [$key?.pub],
				limit: 10,
				relays: [...DEFAULT_RELAYS, ...relays],
				noCache: refreshing
			}
		];
		unsubscribeActiveWallet = useSubscription(subId, requests, handleWalletEvents, {
			bytesPerEvent: 6144
		});
	}

	$: if ($key?.pub && $key?.hasSigner !== false && relays?.length) {
		initActiveWalletSubscription();
	}

	function handleWalletEvents(message: WorkerMessage) {
		const status = isConnectionStatus(message);
		if (status && connectionTracker) {
			connectionTracker.handleMessage(message);
			if (connectionTracker.resolutionRate > 0.5) {
				walletLoaded.resolve(true);
			}
			return;
		}
		const parsedEvent = isParsedEvent(message);
		const wallet = isKind17375(message);
		if (parsedEvent && wallet) {
			// Only update if the store is empty or the event is more recent
			if (!$kind17375 || parsedEvent.createdAt() > $kind17375.createdAt()) {
				$kind17375 = parsedEvent;
				$activeMintUrl = wallet.mints(0) && normalizeMintURL(wallet.mints(0));
			}
			if (wallet.p2pkPrivKey()) {
				setNutsWallet(
					wallet.p2pkPrivKey()!,
					wallet.p2pkPrivKey()!,
					fbArray(wallet, 'mints')
						.map((m) => fbString(m))
						.filter((m): m is string => !!m)
						.map((m) => normalizeMintURL(m)),
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
		getItemId={(item) => item?.id?.() || ''}
		backdrop={!walletItems.length}
		loading={isPaginating}
		pullToRefresh
		onRefresh={handleRefresh}
		onNearBottom={handleNearBottom}
		bind:start
		bind:end
	>
		<svelte:fragment slot="header">
			<div class="w-feed bg-base-300 bg-opacity-85 rounded-lg px-1 shadow-widget-down">
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
							<button on:click|stopPropagation={() => go('qr')}>
								<Icon icon="ph:qr-code" class="text-2xl" />
							</button>
							<!-- Refresh button -->
							<button
								on:click|stopPropagation={handleRefresh}
								title="Refresh"
								class="cursor-pointer"
							>
								<Icon
									icon="mdi:refresh"
									class="text-2xl {refreshing ? 'animate-spin' : ''}"
									style="transform-origin: center;"
								/>
							</button>
							<div on:click|stopPropagation={() => go('profile')} class="cursor-pointer">
								<img
									src={proxyAvatarUrl(
										($kind0 ? asKind0($kind0)?.picture() : undefined) || '/miss-profile.png'
									)}
									class="w-8 h-8 border rounded-full"
								/>
							</div>
						</div>
					</div>
					{#if loading && !isPaginating}
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
			{#if asKind9321(post)}
				<!-- Kind 9321 - Nutzap -->
				<Kind9321
					zap={post}
					context={[]}
					isFirst={index == 0 || oneDayDiff(post.createdAt(), walletItems[index - 1]?.createdAt())}
					isLast={index == walletItems.length - 1 ||
						oneDayDiff(post.createdAt(), walletItems[index + 1]?.createdAt())}
				/>
			{:else if asKind9735(post)}
				<!-- Kind 9735 - Zap Receipt -->
				<Kind9735
					zap={post}
					context={[]}
					isFirst={index == 0 || oneDayDiff(post.createdAt(), walletItems[index - 1]?.createdAt())}
					isLast={index == walletItems.length - 1 ||
						oneDayDiff(post.createdAt(), walletItems[index + 1]?.createdAt())}
				/>
			{/if}
			<!-- {/if} -->
		</div>
		<!-- <svelte:fragment slot="item-content" let:post let:context let:visible>
		</svelte:fragment> -->
	</Feed>
</Pager>
