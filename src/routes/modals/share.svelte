<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getContext, onDestroy, onMount } from 'svelte';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { go } from 'src/routes/modals/modal';
	import {
		asKind0,
		asKind3,
		asParsedEvent,
		fbArray,
		isConnectionStatus
	} from '@candypoets/nipworker/utils';
	import type {
		ConnectionStatus,
		Kind3Parsed,
		ParsedEvent,
		RequestObject,
		WorkerMessage
	} from '@candypoets/nipworker';
	import { kind3 } from 'src/controller/nostr';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';

	// NEW: Use Feed and mobile breakpoint
	import Feed from 'src/routes/explore/feed.svelte';
	import { isMobile } from 'src/controller';
	import { nip19, type EventTemplate } from 'nostr-tools';
	import { now } from 'src/lib/period';
	import { getUserRelays } from 'src/routes/queries/user';
	import { updateSendStatus } from 'src/controller/sendStatus';

	export let open: boolean = false;
	export let noteId: string | undefined = undefined;

	let animator: PagerAnimator = getContext('animator');
	let search: string = '';
	let message: string = '';
	let feed: ParsedEvent[] = [];
	let selectedContact: ParsedEvent | undefined = undefined;

	let feedRequests: RequestObject[] = [];
	let seen_npubs = new Map<number, boolean>();
	let unsubscribe: (() => void) | undefined;
	let lastFeedRequestsJson = '';

	let note: ParsedEvent | undefined = undefined;
	let relays: string[] = [];
	let copiedNevent = false;
	let copiedWebLink = false;

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
			unsubscribe = useSubscription('share_contacts_' + Date.now(), feedRequests, handleEvents);
		}
	}

	// Cleanup on unmount
	onDestroy(() => {
		unsubscribe?.();
	});

	function toggleContactSelect(contact: ParsedEvent) {
		if (selectedContact?.pubkey()?.fnv1aHash() === contact?.pubkey()?.fnv1aHash()) {
			selectedContact = undefined;
		} else {
			selectedContact = contact;
		}
	}

	function copyNevent() {
		// console.log('Sending blurred message to', asKind0(selectedContact)?.name());
		// selectedContact = undefined;
		navigator.clipboard.writeText(
			'nostr:' +
				nip19.neventEncode({
					id: noteId as string,
					author: note?.pubkey()?.toString(),
					relays
				})
		);
		copiedNevent = true;
		setTimeout(() => (copiedNevent = false), 2500);
	}

	function copyWebLink() {
		navigator.clipboard.writeText(
			`${window.location.origin}/explore/nevent:${nip19.neventEncode({
				id: noteId as string,
				author: note?.pubkey()?.toString(),
				relays
			})}`
		);
		copiedWebLink = true;
		setTimeout(() => (copiedWebLink = false), 2500);
	}

	function handleSendMessage() {
		let post: EventTemplate = {
			kind: 4,
			created_at: now(),
			content: message,
			tags: [['p', selectedContact!.pubkey()!.toString()]]
		};

		// post.tags = [['e', noteId as string, result[0], 'mention']];
		post.content +=
			'\n\nnostr:' +
			nip19.neventEncode({ id: noteId as string, author: note?.pubkey()?.toString(), relays });

		let sendStatus: { [url: string]: ConnectionStatus } = {};
		const id = Math.random().toString(36).substring(2, 9);
		usePublish(id, post, (message: WorkerMessage) => {
			const status = isConnectionStatus(message);
			if (status) {
				const relayUrl = status.relayUrl()?.toString();
				sendStatus[relayUrl] = status;
				updateSendStatus(id, sendStatus);
			}
		});
	}

	function downloadImage() {
		if (note) {
			console.log('Downloading image for note:', note);
		}
	}

	onMount(() => {
		if (noteId) {
			let replySub = useSubscription(noteId, [{ ids: [noteId], relays: [] }], (message) => {
				const parsedEvent = asParsedEvent(message);
				if (parsedEvent && parsedEvent?.id()?.toString() == noteId) {
					note = parsedEvent;
					getUserRelays(note.pubkey()!.toString(), (result) => (relays = result));
					replySub?.();
				}
			});
		}
	});

	// Process feed: filter by search (parent handles search instead of Feed)
	$: processedFeed = feed.filter((c) => {
		if (!search) return true;
		const searchTerm = search.toLowerCase();
		const k0 = asKind0(c);
		const name = k0?.name?.()?.toString()?.toLowerCase() ?? '';
		const content = c?.content?.()?.toString()?.toLowerCase() ?? '';
		const pubkey = c?.pubkey?.()?.toString()?.toLowerCase() ?? '';
		return name.includes(searchTerm) || content.includes(searchTerm) || pubkey.includes(searchTerm);
	});
</script>

<div class="h-screen flex items-end">
	<!-- Feed-backed modal content -->
	<Feed
		class="bg-base-300 bg-opacity-85 backdrop-blur-md w-full !h-2/3 !min-h-fit rounded-t-2xl md:rounded-xl md:h-1/2"
		items={processedFeed}
		getItemId={(item) => item?.pubkey?.()?.fnv1aHash?.() ?? Math.random()}
		stickyFooterVisible={!!selectedContact}
		itemsPerRow={$isMobile ? 3 : 6}
	>
		<!-- Header + search moved into Feed header slot -->
		<svelte:fragment slot="header">
			<div class="px-4 pt-safe flex justify-between h-16 items-center">
				<div on:click={animator.goBack}>
					<Icon icon="mingcute:down-line" class="text-xl" />
				</div>
				<h2 class="text-xl font-bold">Share</h2>
				<div></div>
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
			</div>
		</svelte:fragment>

		<!-- Grid rendering using multi-item rows -->
		<svelte:fragment slot="item-content" let:posts>
			<div
				class="grid gap-4 px-4 py-4"
				style="grid-template-columns: repeat({$isMobile ? 3 : 6}, minmax(0, 1fr));"
			>
				{#each posts as contact (asKind0(contact)?.pubkey())}
					{@const kind0 = asKind0(contact)}
					{@const selected = selectedContact?.pubkey()?.fnv1aHash() == kind0?.pubkey()?.fnv1aHash()}
					<button
						class="flex flex-col items-center text-center"
						on:click={() => toggleContactSelect(contact)}
					>
						<div class="avatar">
							<div
								class="w-16 h-16 rounded-full"
								class:border-2={selected}
								class:border-accent={selected}
							>
								<img
									src={proxyAvatarUrl(kind0?.picture()?.toString()) || 'default-avatar.png'}
									alt={kind0?.name()?.toString() || 'Contact'}
								/>
							</div>
						</div>
						<p class="text-sm mt-1 truncate w-full" class:font-bold={selected}>
							{kind0?.name() || 'Anonymous'}
						</p>
					</button>
				{/each}
			</div>
		</svelte:fragment>

		<!-- Bottom actions moved into Feed sticky-footer slot -->
		<svelte:fragment slot="sticky-footer">
			<div class="p-4 bg-base-300/60 backdrop-blur-md">
				{#if selectedContact}
					{@const kind0 = asKind0(selectedContact)}
					<div class="flex items-center space-x-2">
						<input
							type="text"
							placeholder="Send as BM to {kind0?.name()?.toString()}"
							class="input input-bordered flex-grow"
							bind:value={message}
						/>
						<button class="btn btn-primary" on:click={handleSendMessage}>Send</button>
					</div>
				{:else}
					<div class="flex justify-around">
						<div class="flex flex-col items-center">
							<button
								class="btn btn-circle btn-outline relative"
								on:click={() => {
									copyNevent();
								}}
							>
								<Icon icon="carbon:copy" />
								{#if copiedNevent}
									<div class="absolute top-full mt-1 bg-black text-white text-xs px-2 py-1 rounded">
										Copied!
									</div>
								{/if}
							</button>
							<p class="text-xs mt-1">Copy note ID (nevent)</p>
						</div>
						<div class="flex flex-col items-center">
							<button
								class="btn btn-circle btn-outline relative"
								on:click={() => {
									copyWebLink();
								}}
							>
								<Icon icon="carbon:link" />
								{#if copiedWebLink}
									<div class="absolute top-full mt-1 bg-black text-white text-xs px-2 py-1 rounded">
										Copied!
									</div>
								{/if}
							</button>
							<p class="text-xs mt-1">Copy web link</p>
						</div>
						<!-- {#if note && note.tags && note.tags?.some((tag) => tag[0] === 'image')}
						<div class="flex flex-col items-center">
							<button class="btn btn-circle btn-outline" on:click={downloadImage}>
								<Icon icon="carbon:download" />
							</button>
							<p class="text-xs">Download image</p>
						</div>
					{/if} -->
					</div>
				{/if}
			</div>
		</svelte:fragment>
	</Feed>
</div>
