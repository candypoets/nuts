<script lang="ts">
	import Icon from '@iconify/svelte';
	import { schnorr } from '@noble/curves/secp256k1';
	import { bytesToHex } from '@noble/hashes/utils';
	import { kinds, nip19 } from 'nostr-tools';
	import { decodePrivKey } from 'src/actions/wallet';
	import AccountsCarousel from 'src/comp/AccountsCarousel.svelte';
	import Layer from 'src/comp/drawers/Layer.svelte';
	import QrScanner from 'src/comp/QRScanner.svelte';
	import { kind10002, kind10019 } from 'src/controller/nostr';
	import ProfileModal from 'src/routes/_profile/index.svelte';
	import {
		accountModalOpen,
		lightningInvoice,
		meltModalOpen,
		scannedPubkey,
		selectedTransaction
	} from 'src/stores';
	import { activeAccount, key, keysCache } from 'src/stores/db';
	import { profile } from 'src/stores/profile';
	import { pool } from 'src/stores/relays';
	import Feed from '../explore/feed.svelte';
	import AccountModal from './account-modal.svelte';
	import AddFriendModal from './add-friend-modal.svelte';
	import AddModal from './add-modal.svelte';
	import MeltModal from './melt-modal.svelte';
	import QrModal from './qr-modal.svelte';
	import SendModal from './send/send-modal.svelte';
	import TransactionModal from './transaction-modal.svelte';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { isKind17375, type AnyKind, type Kind17375Parsed } from 'src/parsers';
	import type { SubscribeKind } from 'src/wasm/manager';
	import _ from 'lodash';
	import Kind9321 from '../kinds/kind9321.svelte';
	import Pager from 'src/comp/Pager.svelte';

	let profileOpen: boolean = false;
	let qrOpen: boolean = false;
	let isRefresh = false;

	let addOpen: boolean = false;
	let sendOpen: boolean = false;
	let addFriend: boolean = false;

	let isViewing = false;

	let scrollY: number;
	let privateKey: string;
	let loading = false;
	let extensionError = false;

	let kind17375: ParsedEvent<Kind17375Parsed>;

	// let scrolling = false;
	//

	$: walletRelays = $kind10019
		? $kind10019?.parsed?.readRelays
		: $kind10002?.parsed?.filter((r) => r.read).map((r) => r.url) || [];

	$: feedRequests = [
		{
			kinds: [7375, 7374, 7376, 9321, 17375],
			authors: [$key?.pub],
			relays: walletRelays
		},
		{
			kinds: [9321],
			tags: { '#p': [$key?.pub] },
			relays: walletRelays
		}
	];

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: SubscribeKind
	): [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] {
		const [event, ...context] = events;
		if (!event || !event.parsed) return feed;
		// Add new events to our feed for processing
		let updatedFeed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][];

		if (isKind17375(event)) kind17375 = event;

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

	$: open = !!$selectedTransaction;

	// $: console.log('loginError', loginError);
	$: isError = Array.from($keysCache.values())[$activeAccount]?.pub != $key?.pub;
</script>

<Pager rootPath="/home">
	<Feed
		subscriptionID="home"
		requests={feedRequests}
		{updateFeed}
		headerItem={{ id: 'home-header' }}
	>
		<svelte:fragment slot="header-content" let:item let:visible>
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
						<button on:click={() => (qrOpen = true)}
							><Icon icon="ph:qr-code" class="text-2xl" /></button
						>
						<div on:click={() => (profileOpen = true)} class="cursor-pointer">
							<img src={$profile?.picture || '/ns-naked.svg'} class="w-8 h-8 border rounded-full" />
						</div>
					</div>
				</div>
				<AccountsCarousel {isViewing} />
			</div>
			<div class="flex lg:gap-8 gap-4 px-4 py-4 w-feed lg:m-auto">
				<div class="text-center">
					<button class="btn w-14 h-14 btn-primary btn-circle" on:click={() => (addOpen = true)}>
						<Icon icon="teenyicons:add-outline" class="text-2xl" />
					</button>
					<div class="text-sm mt-1 font-semibold">Receive</div>
				</div>
				<div class="text-center">
					<button class="btn w-14 h-14 btn-primary btn-circle" on:click={() => (sendOpen = true)}>
						<Icon icon="ph:arrow-right-thin" class="w-8 h-8" />
					</button>
					<div class="text-sm mt-1 font-semibold">Send</div>
				</div>
				<div class="text-center">
					<!-- <button class="btn w-14 h-14 btn-circle btn-outline" on:click={() => (addFriend = true)}>
			<Icon icon="carbon:user" class="w-8 h-8" />
		</button> -->
					<button class="btn w-14 h-14 btn-outline btn-circle">
						<QrScanner />
					</button>
					<div class="text-sm mt-1 font-semibold">Scan</div>
				</div>
				<div class="flex-grow w-1/4" />
			</div>
			{#if isError}
				<div class="py-4 w-feed lg:m-auto">
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
				<div class="w-feed lg:m-auto h-auto lg:pt-0 px-4">
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
							console.log('clicked', $activeAccount);
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
		<svelte:fragment slot="item-content" let:post let:context let:visible>
			{#if post.kind == 9321}
				<Kind9321 zap={post} {context} />
			{/if}
		</svelte:fragment>
	</Feed>
</Pager>

<ProfileModal bind:open={profileOpen} />

<MeltModal bind:open={$meltModalOpen} invoice={$lightningInvoice} />

<AccountModal bind:open={$accountModalOpen} npub={$scannedPubkey} />

<QrModal bind:open={qrOpen} />

<AddModal bind:open={addOpen} />

<SendModal bind:open={sendOpen} />

<Layer bind:open={addFriend}>
	<AddFriendModal bind:open={addFriend} />
</Layer>

<Layer bind:open onClose={() => ($selectedTransaction = null)}>
	<TransactionModal />
</Layer>
