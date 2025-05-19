<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';

	import { kind3 } from 'src/controller/nostr';
	import type { Contact } from 'src/model/contact';
	import type { AnyKind, Kind0Parsed } from 'src/types';
	import Feed from 'src/routes/explore/feed.svelte';
	import { go, goBack } from 'src/routes/modals/modal';
	import type { Request, SubscribeKind } from 'src/model/nostr';
	import type { ParsedEvent } from 'src/types';

	let active: string;
	let search: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	$: {
		if (open) {
		} else {
		}
	}

	let addFriend = false;
	let scan = false;
	let scannedNpub: string;

	export let subopen: boolean = false;

	let headerItem: ParsedEvent<Kind0Parsed> = { id: 'header' };

	let paymentType: '' | 'Tapcash' | 'Zap' | 'Invoice' = '';

	let selectedContact: Contact;

	let feedRequests: Request[] = [];

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: SubscribeKind
	): [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] {
		const [event, ...context] = events;
		return _.uniqBy(
			[...feed, [event, _.uniqBy(context, 'id')]].sort(
				(a, b) => b[0].parsed?.name - a[0].parsed?.name
			),
			([event]) => event.pubkey
		);
	}

	$: {
		feedRequests =
			$kind3?.parsed?.map((p) => ({
				kinds: [0],
				authors: [p.pubkey],
				cacheFirst: true,
				relays: []
			})) || [];
	}
</script>

<!-- <ScanLN bind:invoice={scannedNpub} /> -->
<Feed
	class="bg-base-300 bg-opacity-85"
	subscriptionID="contacts"
	requests={feedRequests}
	kinds={[0]}
	{headerItem}
	{updateFeed}
>
	<svelte:fragment slot="header">
		<div>
			<div class="px-4 pt-4 flex justify-between">
				<div on:click={goBack}>
					<Icon icon="mingcute:down-line" class="text-xl" />
				</div>
				<div class="flex">
					<!-- <div on:click={() => (scan = true)}>
						<Icon icon="ic:baseline-qrcode" class="text-xl" />
					</div> -->

					<a on:click={() => go('scan')}>
						<Icon icon="teenyicons:scan-solid" class="text-2xl" />
					</a>
					<!-- <div
						on:click={() => {
							addFriend = true;
							// subopen = true;
							paymentType = '';
						}}
						class="ml-4"
					>
						<Icon icon="teenyicons:add-outline" class="text-2xl" />
					</div> -->
				</div>
			</div>
			<h2 class="text-xl font-bold px-4 pt-4">Send Money</h2>
		</div>
		<div class="p-4">
			<div class="join bg-base-200 rounded-md w-full">
				<div class="join-item p-2">
					<Icon icon="carbon:search" />
				</div>
				<input
					placeholder="Search"
					bind:value={search}
					class="join-item flex-grow px-2 outline-none bg-transparent"
				/>
			</div>
			<div class="my-4 rounded-lg border">
				<div
					class="flex items-center justify-around py-2 border-b opacity-40"
					on:click={() => go('tapcash')}
				>
					<Icon icon="carbon:lightning" class="w-16 h-6" />
					<div class="flex-grow">
						<strong>Tap cash</strong>
						<p class="text-xs">Offline instant payment</p>
					</div>
					<Icon icon="carbon:arrow-right" class="w-16 h-6" />
				</div>
				<div
					class="flex items-center justify-around py-2 border-b"
					on:click={() => go('lightning')}
				>
					<Icon icon="carbon:lightning" class="w-16 h-6" />
					<div class="flex-grow">
						<strong>Pay an invoice</strong>
						<p class="text-xs">Pay out with lightning</p>
					</div>
					<Icon icon="carbon:arrow-right" class="w-16 h-6" />
				</div>
			</div>
			<strong class="text-lg">Contacts</strong>
		</div>
	</svelte:fragment>
	<svelte.fragment slot="item-content" let:post let:context>
		{#if post.parsed}
			<div
				class="flex items-center p-3 border-b hover:bg-base-200 cursor-pointer"
				on:click={() => {
					go('ecash:' + post.pubkey);
				}}
			>
				<div class="avatar mr-3">
					<div class="w-10 h-10 rounded-full">
						<img
							src={post.parsed.picture || 'default-avatar.png'}
							alt={post.parsed.name || 'Contact'}
						/>
					</div>
				</div>
				<div>
					<p class="font-medium">{post.parsed.name || 'Anonymous'}</p>
				</div>
			</div>
		{/if}
	</svelte.fragment>
</Feed>
