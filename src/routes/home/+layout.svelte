<script lang="ts">
	import {
		MessageType,
		ParsedData,
		type ConnectionStatus,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asKind0,
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
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import { nip19 } from 'nostr-tools';
	import { onMount } from 'svelte';

	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { key } from 'src/controller/key';
	import { cashuManager } from 'src/controller/managers';
	import {
		delayedPromise,
		kind0,
		kind10002,
		kind10019,
		kind10019Ready,
		kind17375,
		kind3,
		readRelays
	} from 'src/controller/nostr';
	import { limit } from 'src/controller/pagination';
	import { addProofs, nutsWallet, nutsWallets, setNutsWallet } from 'src/controller/proofs';
	import { activeMintUrl, walletLoaded } from 'src/controller/wallet';
	import { DAY } from 'src/lib/period';
	import { normalizeMintURL } from 'src/lib/utils';
	import { decodePrivKey } from 'src/lib/wallet';
	import Feed from 'src/routes/explore/feed.svelte';
	import MintCard from 'src/routes/home/components/mintcard.svelte';
	import Kind9321 from 'src/routes/kinds/kind9321.svelte';
	import { go } from 'src/routes/modals/modal';

	export let visible = false;

	let isViewing = false;

	let scrollY: number;
	let privateKey: string;
	let loading = false;
	let extensionError = false;
	let eoce = false;

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	$: walletRelays = $kind10019?.parsed?.readRelays;

	let defaultRelays;

	const connectionTracker = new ConnectionTracker();

	setTimeout(
		() =>
			(defaultRelays = [
				'wss://relay.damus.io',
				'wss://nos.lol',
				'wss://relay.primal.net',
				'wss://relay.nostr.band'
			]),
		3000
	);

	$: relays = walletRelays || $readRelays || defaultRelays;

	const relayPromise = Promise.race([kind10019Ready.promise, delayedPromise]);

	let feedRequests: RequestObject[] = [];

	relayPromise.then(() => {
		feedRequests = [
			{
				kinds: [9321],
				authors: [$key?.pub],
				limit: $limit,
				relays: relays
			},
			{
				kinds: [9321],
				tags: { '#p': [$key?.pub] },
				limit: $limit,
				relays: relays
			}
		];
	});

	let proofs: () => void;

	relayPromise.then(() => {
		proofs?.();
		proofs = useSubscription(
			'proofs_' + $key?.pub,
			[
				{ kinds: [7375], authors: [$key?.pub], relays },
				{ kinds: [9321], tags: { '#p': [$key?.pub] }, relays: relays }
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
								secret: p.secret()!.toString()
							}))
						);
					}
				}
			},
			{
				pipeline: {
					pipes: [{ name: 'parse' }, { name: 'saveToDb' }, { name: 'proofVerification' }]
				}
			},
			cashuManager
		);
	});

	let walletSub = Promise.race([kind10019Ready.promise, delayedPromise]).then((event) => {
		useSubscription(
			'active_wallet',
			[
				{ kinds: [7375], authors: [$key?.pub], limit: 10, relays: relays },
				{ kinds: [17375], authors: [$key?.pub], limit: 10, relays: relays }
			],
			(message) => {
				const status = isConnectionStatus(message);
				if (status) {
					connectionTracker.handleMessage(message);
					if (connectionTracker.resolutionRate > 0.5) {
						walletLoaded.resolve(true);
					}
					connectionStatus[status?.relayUrl()!.toString()] = status;
				}
				const parsedEvent = isParsedEvent(message);
				const wallet = isKind17375(message);
				if (parsedEvent && wallet) {
					console.log('wallet');
					// Only update if the store is empty or the event is more recent
					if (!$kind17375 || parsedEvent.createdAt() > $kind17375.createdAt()) {
						$kind17375 = parsedEvent;
						$activeMintUrl =
							wallet.mints(0).toString() && normalizeMintURL(wallet.mints(0).toString());
					}
					if (wallet.p2pkPrivKey()) {
						setNutsWallet(
							wallet.p2pkPrivKey()!.toString(),
							wallet.p2pkPubKey()!.toString(),
							fbArray(wallet, 'mints').map((m) => normalizeMintURL(m.toString())),
							Number(parsedEvent.createdAt())
						);
					}
				}
				// if (isKind7375(event) && event?.parsed?.mintUrl) {
				// if (event?.parsed?.deletedIds?.length) {
				// 	$deletedKind7375Ids = $deletedKind7375Ids.concat(event?.parsed?.deletedIds);
				// }
				// $kinds7375 = $kinds7375.concat(event);
				// console.log(
				// 	event.parsed.mintUrl,
				// 	formatDistanceToNow((event?.created_at || 0) * 1000, { addSuffix: true }),
				// 	event.parsed.proofs.reduce((acc, cur) => (acc += cur.amount), 0),
				// 	event.parsed.proofs
				// );
				// addProofs(event.parsed?.mintUrl, event.parsed?.proofs);
				// }
			},
			{ bytesPerEvent: 6144 }
		);
	});

	function updateFeed(feed: ParsedEvent[], message: WorkerMessage): ParsedEvent[] {
		const lastEvent = feed?.[feed.length - 1];

		// Add new events to our feed for processing
		let updatedFeed: ParsedEvent[] = feed;

		switch (message.type()) {
			case MessageType.ParsedNostrEvent:
				const event = asParsedEvent(message);
				const kind9321 = isKind9321(message);
				if (!kind9321 || !event) break;
				if (!lastEvent) {
					(event as any).isFirst = true;
				} else {
					if (Number(lastEvent!.createdAt()) > Number(event!.createdAt()) + DAY) {
						if (lastEvent) {
							(lastEvent as any).isFirst = true;
						}
					}
				}
				if (!eoce) {
					// For cached events, just add them to the feed
					updatedFeed = [...updatedFeed, event];
				} else {
					// For fetched events, add them in timestamp order
					if (feed.length === 0 || event.createdAt() >= feed[0].createdAt()) {
						updatedFeed = [event, ...feed];
					} else {
						// Add and sort by timestamp
						updatedFeed = [...feed, event].sort(
							(a, b) => Number(b.createdAt()) - Number(a.createdAt())
						);
					}
				}
				break;
			case MessageType.Eoce:
				eoce = true;
				break;
		}
		return updatedFeed;
	}

	async function handleLogin() {
		// Handle login logic here

		// build a key object to store in the db
		const pk = decodePrivKey(privateKey);

		const pubkey = bytesToHex(schnorr.getPublicKey(pk));
		const privkey = bytesToHex(pk);

		loading = true;

		const login = useSubscription(
			'login_' + pubkey,
			[
				{
					kinds: [0, 3, 10002],
					authors: [pubkey],
					limit: 10,
					cacheFirst: true,
					relays: []
				}
			],
			(message: WorkerMessage) => {
				switch (message.type()) {
					case MessageType.ParsedNostrEvent:
						const parsedEvent = asParsedEvent(message);
						switch (parsedEvent?.parsedType()) {
							case ParsedData.Kind0Parsed:
								$kind0 = parsedEvent;
								loading = false;
								try {
									$key = {
										pub: pubkey,
										priv: privkey,
										npub: nip19.npubEncode(pubkey),
										nsec: nip19.nsecEncode(pk)
									};
								} catch (error) {
									console.warn(error);
								}
								break;
							case ParsedData.Kind3Parsed:
								$kind3 = parsedEvent;
								break;
							case ParsedData.Kind10002Parsed:
								$kind10002 = parsedEvent;
								break;
						}
					case MessageType.ConnectionStatus:
						const status = asConnectionStatus(message);
						if (status?.status()?.toString() == 'EOSE') {
							loading = false;
							login();
						}
						break;
				}
			}
		);
	}

	onMount(() => {
		walletLoaded.then(() => console.log('walletLoaded', nutsWallets));
	});
</script>

<Pager rootPath="/home">
	<Feed
		subscriptionID="home"
		requests={feedRequests}
		manager={cashuManager}
		{updateFeed}
		backdrop
		bind:connectionStatus
	>
		<svelte:fragment slot="header">
			<div
				class="relative w-feed pt-safe place-content-center m-auto z-10 backdrop"
				class:shadow-md={scrollY > 0}
			>
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
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
								src={asKind0($kind0)?.picture()?.toString() || '/ns-naked.svg'}
								class="w-8 h-8 border rounded-full"
							/>
						</div>
					</div>
				</div>
				<RelaysList {relays} {connectionStatus} />
				{#if $nutsWallet}
					<div
						class="flex gap-2 items-stretch overflow-x-scroll scrollbar-hide snap-x snap-mandatory scroll-smooth mt-2"
						on:touchmove|stopPropagation
					>
						{#each $nutsWallet.mintUrls || [] as url}
							<MintCard mintUrl={url} navigate />
						{/each}
					</div>
				{:else}
					<div class="w-full p-4 rounded-lg mb-4 bg-base-200">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="font-semibold text-lg">Setup Your Wallet</h3>
								<p class="text-sm text-secondary-content">Configure your wallet to get started</p>
							</div>
							<button class="btn btn-primary" on:click|stopPropagation={() => go('wallet')}>
								<Icon icon="ph:wallet-bold" class="mr-2" />
								Setup Wallet
							</button>
						</div>
					</div>
				{/if}
			</div>
			<div class="flex lg:gap-8 gap-4 px-4 py-4 w-feed m-auto">
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
			{#if $key}
				<div
					class="h-auto lg:pt-0 overflow-scroll scrollbar-hide"
					on:scroll={(e) => (scrollY = e?.target?.scrollTop)}
				>
					<!-- <slot /> -->
				</div>
			{:else}
				<div class="w-feed m-auto h-auto lg:pt-0 px-4">
					<div class="mt-4">Log in with your nsec</div>
					<form class="mt-4" on:submit|preventDefault={handleLogin}>
						<div class="join w-full border">
							<div class="btn join-item btn-link"><Icon icon="ri:key-fill" /></div>
							<input
								placeholder="nsec"
								class="join-item flex-grow px-2"
								type="text"
								bind:value={privateKey}
							/>
							<button class="btn join-item btn-primary" type="submit">
								{#if !loading}<Icon icon="mdi:login" />
								{:else}
									<div class="loading" />
								{/if}
							</button>
						</div>
					</form>
					<div class="flex items-center gap-2 my-4">
						<div class="border-b w-full" />
						<div>OR</div>
						<div class="border-b w-full" />
					</div>
					<button
						class="btn btn-outline mt-4 m-auto block w-full"
						class:btn-error={extensionError}
						on:click={async () => {
							const pubKey = await window?.nostr?.getPublicKey();
							if (!pubKey) {
								extensionError = true;
								return;
							}
							if (pubKey == $key?.pub) return;
							$key = {
								pub: pubKey,
								npub: nip19.npubEncode(pubKey)
							};
						}}
					>
						{#if !extensionError}
							Log in with an extension
						{:else}
							Extension not found
						{/if}
					</button>
				</div>
			{/if}
		</svelte:fragment>
		<div slot="item-content" let:post let:visible>
			{#if post}
				<Kind9321 zap={post} context={[]} />
			{/if}
		</div>
		<!-- <svelte:fragment slot="item-content" let:post let:context let:visible>
		</svelte:fragment> -->
	</Feed>
</Pager>
