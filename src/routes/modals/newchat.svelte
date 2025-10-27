<script lang="ts">
	import Icon from '@iconify/svelte';

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
	import Feed from 'src/routes/explore/feed.svelte';
	import { go } from 'src/routes/modals/modal';
	import { getContext } from 'svelte';
	import Kind4 from '../_kinds/kind4.svelte';

	let active: string;
	let search: string;
	// export let encodedToken: string = '';

	export let open: boolean = false;

	export let subopen: boolean = false;

	let feed: ParsedEvent[] = [];

	let selectedContact: string = '';

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

{#if !selectedContact}
	<Feed
		class="bg-base-300 bg-opacity-85 backdrop-blur-md"
		subscriptionID="contacts"
		requests={feedRequests}
		kinds={[0]}
		{updateFeed}
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
		bind:feed
	>
		<svelte:fragment slot="header">
			<div>
				<div class="px-4 pt-safe flex justify-between h-20 items-center">
					<div on:click={animator.goBack}>
						<Icon icon="mingcute:down-line" class="text-xl" />
					</div>
				</div>
			</div>
			<div class="px-4 pb-4">
				<div class="join bg-base-200 rounded-md w-full">
					<div class="join-item p-2">To :</div>
					<input
						placeholder=""
						bind:value={search}
						class="join-item flex-grow px-2 outline-none bg-transparent"
					/>
				</div>
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
				<strong class="px-2 mx-4">
					{kind0?.name()?.toString().trim().slice(0, 1).toUpperCase()}
				</strong>
			{/if}
			<div
				class="flex items-center p-3 mx-4 border border-primary-content hover:bg-base-200 cursor-pointer"
				class:border-b-0={!isLast}
				class:rounded-t-lg={isFirst}
				class:rounded-b-lg={isLast}
				class:mt-1={search}
				on:click={() => {
					selectedContact = kind0?.pubkey()?.toString() || '';
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
{:else}
	<div class="w-feed bg-base-300 bg-opacity-60 relative backdrop-blur-md">
		<Kind4 pubkey={selectedContact} goBack={navigator.goBack} visible />
	</div>
{/if}
