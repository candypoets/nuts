<script lang="ts">
	import Icon from '@iconify/svelte';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import _ from 'lodash';
	import { kinds, nip19 } from 'nostr-tools';

	import { decodePrivKey } from 'src/actions/wallet';
	import Pager from 'src/comp/Pager.svelte';
	import { kind10002, kind10019, kind17375, kinds7375 } from 'src/controller/nostr';
	import {
		activeMintUrl,
		balanceByMint,
		deletedKind7375Ids,
		mints,
		walletLoaded
	} from 'src/controller/wallet';
	import { isKind17375, isKind7375, isKind9321, type AnyKind } from 'src/parsers';
	import { normalizeMintURL } from 'src/parsers/utils';
	import Feed from 'src/routes/explore/feed.svelte';
	import MintCard from 'src/routes/home/components/mintcard.svelte';
	import Kind9321 from 'src/routes/kinds/kind9321.svelte';
	import Modal from 'src/routes/modals/index.svelte';
	import { go } from 'src/routes/modals/modal';
	import { activeAccount, key, keysCache } from 'src/stores/db';
	import { profile } from 'src/stores/profile';
	import { pool } from 'src/stores/relays';
	import { cashuManager } from 'src/wasm/cashu';
	import { nostrManager, type SubscribeKind } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { onMount } from 'svelte';

	let isViewing = false;

	let scrollY: number;
	let privateKey: string;
	let loading = false;
	let extensionError = false;

	$: walletRelays = $kind10019
		? $kind10019?.parsed?.readRelays
		: $kind10002?.parsed?.filter((r) => r.read).map((r) => r.url) || [];

	$: feedRequests = [
		{
			kinds: [7374, 7376, 9321],
			authors: [$key?.pub],
			relays: walletRelays
		},
		{
			kinds: [9321],
			tags: { '#p': [$key?.pub] },
			relays: walletRelays
		}
	];

	$: walletSub =
		walletRelays &&
		nostrManager.subscribe(
			'active_wallet',
			[{ kinds: [7375, 17375], authors: [$key?.pub], relays: walletRelays }],
			(events: ParsedEvent<unknown>[], eventKind: SubscribeKind) => {
				if (eventKind == 'EOSE') {
					walletLoaded.resolve(true);
				}
				const [event, ...context] = events;
				if (!event || !event.parsed) return;
				if (isKind17375(event)) {
					// Only update if the store is empty or the event is more recent
					if (!$kind17375 || event.created_at > $kind17375.created_at) {
						$kind17375 = event;
						$activeMintUrl = normalizeMintURL(event.parsed.mints?.[0]);
					}
					if (event?.parsed?.p2pkPrivKey) {
						cashuManager.createWallet(event?.parsed?.p2pkPrivKey, event?.parsed?.mints);
					}
				}
				if (isKind7375(event) && event?.parsed?.mintUrl) {
					if (event?.parsed?.deletedIds?.length) {
						$deletedKind7375Ids = $deletedKind7375Ids.concat(event?.parsed?.deletedIds);
					}
					$kinds7375 = $kinds7375.concat(event);
				}
			}
		);

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: SubscribeKind
	): [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] {
		const [event, ...context] = events;
		if (!event || !event.parsed) return feed;

		// Add new events to our feed for processing
		let updatedFeed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][];

		if (!isKind9321(event)) return feed;
		if (eventKind === 'CACHED_EVENT') {
			// For cached events, just add them to the feed
			updatedFeed = [...feed, [event, _.uniqBy(context, 'id')]];
		} else if (eventKind === 'FETCHED_EVENT') {
			// For fetched events, add them in timestamp order
			if (feed.length === 0 || event.created_at >= feed[0][0].created_at) {
				updatedFeed = [...feed, [event, _.uniqBy(context, 'id')]];
			} else {
				// Add and sort by timestamp
				updatedFeed = [...feed, [event, _.uniqBy(context, 'id')]].sort(
					(a, b) => b[0].created_at - a[0].created_at
				);
			}
		} else {
			return feed;
		}
		return updatedFeed;
	}

	async function handleLogin() {
		// Handle login logic here
		console.log('Logging in with private key:', privateKey);

		// build a key object to store in the db
		const pk = decodePrivKey(privateKey);

		const pubkey = bytesToHex(schnorr.getPublicKey(pk));
		const privkey = bytesToHex(pk);

		const abortController = new AbortController();
		// abortController = new AbortController();

		loading = true;
		const messages = $pool.req([{ kinds: [kinds.Metadata], authors: [pubkey], limit: 1 }], {
			signal: abortController.signal
		});

		for await (const message of messages) {
			if (message[0] === 'CLOSED') break;
			if (message[0] !== 'EVENT') continue;
			loading = false;
			try {
				keysCache.put({
					pub: pubkey,
					priv: privkey,
					npub: nip19.npubEncode(pubkey),
					nsec: nip19.nsecEncode(pk)
				});
				$activeAccount = Array.from($keysCache.values()).findIndex((k) => k.pub == pubkey);
			} catch (error) {
				console.warn(error);
			}
			break;
		}
		privateKey = '';
		abortController.abort();
	}

	$: isError = Array.from($keysCache.values())[$activeAccount]?.pub != $key?.pub;

	onMount(() => {
		cashuManager.subscribe('wallet_update', (result: { [key: string]: number }) => {
			$balanceByMint = result;
		});
	});
</script>

<Pager rootPath="/home">
	<Feed subscriptionID="home" requests={feedRequests} {updateFeed}>
		<svelte:fragment slot="header">
			<div
				class="relative w-feed place-content-center m-auto bg-basic z-10 backdrop"
				class:shadow-md={scrollY > 0}
				id="top"
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
							<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
						</div>
					</div>
				</div>
				{#await $mints then mints}
					{#if mints.length}
						<div
							class="flex gap-2 items-stretch overflow-x-scroll scrollbar-hide snap-x snap-mandatory scroll-smooth"
						>
							{#each mints || [] as mint}
								<MintCard {mint} />
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
				{/await}
			</div>
			<div class="flex lg:gap-8 gap-4 px-4 py-4 w-feed m-auto">
				<div class="text-center">
					<button
						class="btn w-14 h-14 btn-primary btn-circle"
						on:click|stopPropagation={() => go('receive')}
					>
						<Icon icon="teenyicons:add-outline" class="text-2xl" />
					</button>
					<div class="text-sm mt-1 font-semibold">Receive</div>
				</div>
				<div class="text-center">
					<button
						class="btn w-14 h-14 btn-primary btn-circle"
						on:click|stopPropagation={() => go('send')}
					>
						<Icon icon="ph:arrow-right-thin" class="w-8 h-8" />
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
			{#if isError}
				<div class="py-4 w-feed m-auto">
					<div class="bg-secondary-content p-4 rounded-lg">
						<div class="text-center">
							<Icon icon="ph:warning" class="text-5xl inline" />
						</div>
						<br />
						<p class="text-center">Your browser extension is not pointing to this account</p>
						<p class="text-center">change it to view this account.</p>
					</div>
				</div>
			{:else if $key}
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
							keysCache.put({
								pub: pubKey,
								npub: nip19.npubEncode(pubKey)
							});
							$activeAccount = Array.from($keysCache.values()).findIndex((k) => k.pub == pubKey);
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
		<div slot="item-content" let:post let:context let:visible>
			{#if post.kind == 9321}
				<Kind9321 zap={post} {context} />
			{/if}
		</div>
		<!-- <svelte:fragment slot="item-content" let:post let:context let:visible>
		</svelte:fragment> -->
	</Feed>
</Pager>
<Modal />
