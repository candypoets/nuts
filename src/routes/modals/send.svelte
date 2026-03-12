<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { getContext, onDestroy } from 'svelte';

	import type { Kind3Parsed, ParsedEvent, WorkerMessage } from '@candypoets/nipworker';
	import { asKind0, asKind3, asParsedEvent, fbArray } from '@candypoets/nipworker/utils';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { kind3 } from 'src/controller/nostr';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import type { Contact } from 'src/model/contact';
	import Feed from 'src/routes/explore/feed.svelte';
	import { go } from 'src/routes/modals/modal';
	import SearchInput from 'src/components/SearchInput.svelte';

	let active: string;
	let search: string;

	export let open: boolean = false;

	let addFriend = false;
	let scan = false;
	let scannedNpub: string;

	export let subopen: boolean = false;

	// Feed items managed in parent
	let feed: ParsedEvent[] = [];

	let headerItem: ParsedEvent;

	let paymentType: '' | 'Tapcash' | 'Zap' | 'Invoice' = '';

	let selectedContact: Contact;

	let animator: PagerAnimator = getContext('animator');

	let seenPubkeys = new Set<number>();

	let unsubscribeContacts: (() => void) | undefined;

	// Subscribe to kind0 events for contacts when kind3 is available
	$: if ($kind3) {
		const contacts = fbArray(asKind3($kind3) as Kind3Parsed, 'contacts');
		if (contacts?.length) {
			// Unsubscribe from previous subscription
			unsubscribeContacts?.();

			// Reset feed when contacts change
			feed = [];
			seenPubkeys.clear();

			// Subscribe to kind0 events for each contact
			unsubscribeContacts = useSubscription(
				'send_contacts_' + $kind3?.pubkey(),
				contacts.map((p) => ({
					kinds: [0],
					authors: [p.pubkey()],
					cacheFirst: true,
					noContext: true,
					relays: []
				})),
				handleContactEvents
			);
		}
	}

	function handleContactEvents(message: WorkerMessage) {
		const parsedEvent = asParsedEvent(message);
		if (parsedEvent) {
			const pubkeyHash = parsedEvent?.pubkey() as number;
			if (seenPubkeys.has(pubkeyHash)) return;
			seenPubkeys.add(pubkeyHash);
			feed = [...feed, parsedEvent];
		}
	}

	// Cleanup subscription on unmount
	onDestroy(() => {
		unsubscribeContacts?.();
	});

	// Process feed: filter, sort, and apply search
	$: processedFeed = feed
		.filter((c) => asKind0(c)?.name())
		.filter((c) => {
			// Search filtering (parent handles search instead of Feed)
			if (!search) return true;
			const searchTerm = search.toLowerCase();
			const k0 = asKind0(c);
			const name = k0?.name?.()?.toLowerCase() ?? '';
			const content = c?.content?.()?.toLowerCase() ?? '';
			const pubkey = c?.pubkey?.()?.toLowerCase() ?? '';
			return (
				name.includes(searchTerm) || content.includes(searchTerm) || pubkey.includes(searchTerm)
			);
		})
		.sort((a, b) => {
			const nameA = asKind0(a)?.name().trim() ?? '';
			const nameB = asKind0(b)?.name().trim() ?? '';
			return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
		});
</script>

<!-- <ScanLN bind:invoice={scannedNpub} /> -->
<Feed
	class="bg-base-300 bg-opacity-85"
	items={processedFeed}
	getItemId={(item) => item?.pubkey?.() ?? Math.random()}
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
			<SearchInput
				placeholder="Search contacts"
				bind:value={search}
				showSearchIcon={true}
				showClearButton={true}
			/>
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
		{@const prevKind0 = asKind0(processedFeed[index - 1])}
		{@const nextKind0 = asKind0(processedFeed[index + 1])}
		{@const isFirst =
			!prevKind0 ||
			prevKind0?.name().trim().toLowerCase().slice(0, 1) !==
				kind0?.name().trim().toLowerCase().slice(0, 1)}
		{@const isLast =
			!nextKind0 ||
			nextKind0?.name().trim().toLowerCase().slice(0, 1) !==
				kind0?.name().trim().toLowerCase().slice(0, 1)}
		{#if isFirst && !search}
			<strong class="px-6">
				{kind0?.name().trim().slice(0, 1).toUpperCase()}
			</strong>
		{/if}
		<div
			class="flex items-center p-3 mx-3 border border-primary-content hover:bg-base-200 cursor-pointer"
			class:border-b-0={!isLast}
			class:rounded-t-lg={isFirst}
			class:rounded-b-lg={isLast}
			class:mt-1={search}
			on:click={() => {
				go('ecash:' + kind0?.pubkey());
			}}
		>
			<div class="avatar mr-3">
				<div class="w-10 h-10 rounded-full">
					<img
						src={proxyAvatarUrl(kind0?.picture()) || 'default-avatar.png'}
						alt={kind0?.name() || 'Contact'}
					/>
				</div>
			</div>
			<div>
				<p class="font-medium">{kind0?.name() || 'Anonymous'}</p>
			</div>
		</div>
	</svelte.fragment>
</Feed>
