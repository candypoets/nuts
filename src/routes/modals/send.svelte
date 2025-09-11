<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';

	import type {
		Kind3Parsed,
		ParsedEvent,
		RequestObject,
		WorkerMessage
	} from '@candypoets/nipworker';
	import { asKind0, asKind3, asParsedEvent, fbArray } from '@candypoets/nipworker/utils';
	import { kind3 } from 'src/controller/nostr';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import type { Contact } from 'src/model/contact';
	import Feed from 'src/routes/explore/feed.svelte';
	import { go } from 'src/routes/modals/modal';
	import { getContext } from 'svelte';
	import { profileManager } from 'src/controller/managers';

	let active: string;
	let search: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	let addFriend = false;
	let scan = false;
	let scannedNpub: string;

	export let subopen: boolean = false;

	let headerItem: ParsedEvent;

	let paymentType: '' | 'Tapcash' | 'Zap' | 'Invoice' = '';

	let selectedContact: Contact;

	let animator: PagerAnimator = getContext('animator');

	let feedRequests: RequestObject[] = [];

	let seen_npubs = new Map<number, boolean>();

	function updateFeed(feed: ParsedEvent[], message: WorkerMessage): ParsedEvent[] {
		const parsedEvent = asParsedEvent(message);
		if (seen_npubs.has(parsedEvent?.pubkey()?.fnv1aHash() as number)) return feed;
		seen_npubs.set(parsedEvent?.pubkey()?.fnv1aHash() as number, true);
		if (parsedEvent) {
			return [...feed, parsedEvent];
		}
		return feed;
	}

	$: {
		feedRequests =
			($kind3 &&
				fbArray(asKind3($kind3) as Kind3Parsed, 'contacts')?.map((p) => ({
					kinds: [0],
					authors: [p.pubkey()!.toString()],
					cacheFirst: true,
					noContext: true,
					relays: []
				}))) ||
			[];
	}
</script>

<!-- <ScanLN bind:invoice={scannedNpub} /> -->
<Feed
	class="bg-base-300 bg-opacity-85"
	subscriptionID="contacts"
	requests={feedRequests}
	manager={profileManager}
	kinds={[0]}
	{updateFeed}
>
	<svelte:fragment slot="header">
		<div>
			<div class="px-4 pt-4 flex justify-between unsafe-padding-top">
				<div on:click={animator.goBack}>
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
	<svelte.fragment slot="item-content" let:post>
		{#if post}
			{@const kind0 = asKind0(post)}
			<div
				class="flex items-center p-3 border-b hover:bg-base-200 cursor-pointer"
				on:click={() => {
					go('ecash:' + kind0?.pubkey()?.toString());
				}}
			>
				<div class="avatar mr-3">
					<div class="w-10 h-10 rounded-full">
						<img
							src={proxyAvatarUrl(kind0?.picture()?.toString()) || 'default-avatar.png'}
							alt={kind0?.name()?.toString() || 'Contact'}
						/>
					</div>
				</div>
				<div>
					<p class="font-medium">{kind0?.name()?.toString() || 'Anonymous'}</p>
				</div>
			</div>
		{:else}
			no post
		{/if}
	</svelte.fragment>
</Feed>
