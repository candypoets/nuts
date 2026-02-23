<script lang="ts">
	import Icon from '@iconify/svelte';

	import { useSubscription } from '@candypoets/nipworker/hooks';
	import type {
		Kind3Parsed,
		ParsedEvent,
		RequestObject,
		WorkerMessage
	} from '@candypoets/nipworker';
	import { asKind0, asKind3, asParsedEvent, fbArray } from '@candypoets/nipworker/utils';
	import { onDestroy } from 'svelte';
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
	let unsubscribe: (() => void) | undefined;
	let lastFeedRequestsJson = '';

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		const parsedEvent = asParsedEvent(message);
		if (parsedEvent) {
			const pubkeyHash = parsedEvent?.pubkey()?.fnv1aHash() as number;
			if (seen_npubs.has(pubkeyHash)) return;
			seen_npubs.set(pubkeyHash, true);
			feed = [...feed, parsedEvent];
		}
	}

	// Initialize subscription when feedRequests changes (guard against duplicate subs)
	$: if (feedRequests.length > 0) {
		const requestsJson = JSON.stringify(feedRequests);
		if (requestsJson !== lastFeedRequestsJson) {
			lastFeedRequestsJson = requestsJson;
			unsubscribe?.();
			unsubscribe = useSubscription('newchat_contacts_' + Date.now(), feedRequests, handleEvents);
		}
	}

	// Cleanup on unmount
	onDestroy(() => {
		unsubscribe?.();
	});

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

	// Process feed: filter, sort, and apply search
	$: processedFeed = feed
		.filter((c) => asKind0(c)?.name())
		.filter((c) => {
			// Search filtering (parent handles search instead of Feed)
			if (!search) return true;
			const searchTerm = search.toLowerCase();
			const k0 = asKind0(c);
			const name = k0?.name?.()?.toString()?.toLowerCase() ?? '';
			const content = c?.content?.()?.toString()?.toLowerCase() ?? '';
			const pubkey = c?.pubkey?.()?.toString()?.toLowerCase() ?? '';
			return name.includes(searchTerm) || content.includes(searchTerm) || pubkey.includes(searchTerm);
		})
		.sort((a, b) => {
			const nameA = asKind0(a)?.name()?.toString()?.trim() ?? '';
			const nameB = asKind0(b)?.name()?.toString()?.trim() ?? '';
			return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
		});
</script>

{#if !selectedContact}
	<Feed
		class="bg-base-300 bg-opacity-85 backdrop-blur-md"
		items={processedFeed}
		getItemId={(item) => item?.pubkey?.()?.fnv1aHash?.() ?? Math.random()}
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
		<svelte:fragment slot="item-content" let:post let:index>
			{@const kind0 = asKind0(post)}
			{@const prevKind0 = asKind0(processedFeed[index - 1])}
			{@const nextKind0 = asKind0(processedFeed[index + 1])}
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
		</svelte:fragment>
	</Feed>
{:else}
	<div class="w-feed bg-base-300 bg-opacity-60 relative backdrop-blur-md">
		<Kind4 pubkey={selectedContact} goBack={navigator.goBack} visible />
	</div>
{/if}
