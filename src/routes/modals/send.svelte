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

	let active: string;
	let search: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	let addFriend = false;
	let scan = false;
	let scannedNpub: string;

	export let subopen: boolean = false;

	let feed: ParsedEvent[] = [];

	let headerItem: ParsedEvent;

	let paymentType: '' | 'Tapcash' | 'Zap' | 'Invoice' = '';

	let selectedContact: Contact;

	let animator: PagerAnimator = getContext('animator');

	let feedRequests: RequestObject[] = [];

	let seen_npubs = new Map<number, boolean>();

	function updateFeed(feed: ParsedEvent[], message: WorkerMessage): ParsedEvent[] {
		const parsedEvent = asParsedEvent(message);
		if (parsedEvent) {
			if (seen_npubs.has(parsedEvent?.pubkey()?.fnv1aHash() as number)) return feed;
			seen_npubs.set(parsedEvent?.pubkey()?.fnv1aHash() as number, true);
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

	$: feed = feed
		.filter((c) => asKind0(c)?.name())
		.sort((a, b) => {
			const nameA = asKind0(a)?.name()?.toString()?.trim() ?? '';
			const nameB = asKind0(b)?.name()?.toString()?.trim() ?? '';
			return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
		});
</script>

<!-- <ScanLN bind:invoice={scannedNpub} /> -->
<Feed
	class="bg-base-300 bg-opacity-85 backdrop-blur-md"
	subscriptionID="contacts"
	requests={feedRequests}
	kinds={[0]}
	{updateFeed}
	bind:feed
	fuseKeys={['content', 'pubkey', 'name']}
	fuseResolver={(item, key) => {
		switch (key) {
			case 'content':
				return item?.content?.()?.toString() ?? '';
			case 'pubkey':
				return item?.pubkey?.()?.toString() ?? '';
			case 'name': {
				const k0 = asKind0(item);
				return k0?.name?.()?.toString() ?? '';
			}
			default:
				return '';
		}
	}}
	{search}
>
	<svelte:fragment slot="header">
		<div>
			<div class="px-4 pt-safe flex justify-between h-20 items-center">
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
			<div class="my-4 rounded-lg border border-primary-content">
				<div
					class="flex items-center justify-around py-2 border-b border-primary-content opacity-40"
					on:click={() => go('tapcash')}
				>
					<Icon icon="carbon:lightning" class="w-16 h-6" />
					<div class="flex-grow">
						<strong>Tap cash</strong>
						<p class="text-xs">Offline instant payment</p>
					</div>
					<Icon icon="carbon:arrow-right" class="w-16 h-6" />
				</div>
				<div class="flex items-center justify-around py-2" on:click={() => go('lightning')}>
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
	<svelte.fragment slot="item-content" let:post let:index>
		{@const kind0 = asKind0(post)}
		{@const prevKind0 = asKind0(feed[index - 1])}
		{@const nextKind0 = asKind0(feed[index + 1])}
		{@const isFirst =
			!prevKind0 ||
			prevKind0?.name()?.toString().trim().toLowerCase().slice(0, 1) !==
				kind0?.name()?.toString().trim().toLowerCase().slice(0, 1)}
		{@const isLast =
			!nextKind0 ||
			nextKind0?.name()?.toString().trim().toLowerCase().slice(0, 1) !==
				kind0?.name()?.toString().trim().toLowerCase().slice(0, 1)}
		{#if isFirst && !search}
			<strong class="px-6">
				{kind0?.name()?.toString().trim().slice(0, 1).toUpperCase()}
			</strong>
		{/if}
		<div
			class="flex items-center p-3 mx-3 border border-primary-content hover:bg-base-200 cursor-pointer"
			class:border-b-0={!isLast}
			class:rounded-t-lg={isFirst}
			class:rounded-b-lg={isLast}
			class:mt-1={search}
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
	</svelte.fragment>
</Feed>
