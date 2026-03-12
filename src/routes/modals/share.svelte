<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getContext, onDestroy, onMount } from 'svelte';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import SearchInput from 'src/components/SearchInput.svelte';
	import VirtualList from 'src/components/VirtualList.svelte';
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
	import ModalHandle from 'src/components/ModalHandle.svelte';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
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
					authors: [p.pubkey()],
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
			const pubkeyHash = parsedEvent?.pubkey() as number;
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
		if (selectedContact?.pubkey() === contact?.pubkey()) {
			selectedContact = undefined;
		} else {
			selectedContact = contact;
		}
	}

	function copyNevent() {
		navigator.clipboard.writeText(
			'nostr:' +
				nip19.neventEncode({
					id: noteId as string,
					author: note?.pubkey(),
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
				author: note?.pubkey(),
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
			tags: [['p', selectedContact!.pubkey()]]
		};

		post.content +=
			'\n\nnostr:' + nip19.neventEncode({ id: noteId as string, author: note?.pubkey(), relays });

		let sendStatus: { [url: string]: ConnectionStatus } = {};
		const id = Math.random().toString(36).substring(2, 9);
		usePublish(id, post, (message: WorkerMessage) => {
			const status = isConnectionStatus(message);
			if (status) {
				const relayUrl = status.relayUrl();
				sendStatus[relayUrl] = status;
				updateSendStatus(id, sendStatus);
			}
		});
	}

	onMount(() => {
		if (noteId) {
			let replySub = useSubscription(noteId, [{ ids: [noteId], relays: [] }], (message) => {
				const parsedEvent = asParsedEvent(message);
				if (parsedEvent && parsedEvent?.id() == noteId) {
					note = parsedEvent;
					getUserRelays(note.pubkey(), (result) => (relays = result));
					replySub?.();
				}
			});
		}
	});

	// Process feed: filter by search
	$: processedFeed = feed.filter((c) => {
		if (!search) return true;
		const searchTerm = search.toLowerCase();
		const k0 = asKind0(c);
		const name = k0?.name?.()?.toLowerCase() ?? '';
		const content = c?.content?.()?.toLowerCase() ?? '';
		const pubkey = c?.pubkey?.()?.toLowerCase() ?? '';
		return name.includes(searchTerm) || content.includes(searchTerm) || pubkey.includes(searchTerm);
	});

	const getItemId = (item: ParsedEvent) => item?.pubkey?.() ?? Math.random();

	// Calculate grid items per row based on mobile/desktop
	$: itemsPerRow = $isMobile ? 3 : 6;
</script>

<div class="h-screen flex items-end">
	<div
		class="bg-base-300 bg-opacity-85 w-full !h-2/3 !min-h-fit rounded-t-2xl md:rounded-xl md:h-1/2 flex flex-col shadow-widget"
		on:click|stopPropagation
	>
		<ModalHandle />

		<!-- Search -->
		<div class="px-2 pb-3 mt-4 shrink-0">
			<SearchInput
				placeholder="Search"
				bind:value={search}
				showSearchIcon={true}
				showClearButton={true}
			/>
		</div>

		<!-- Virtualized list -->
		<div class="px-2 flex-1 min-h-0 overflow-hidden">
			{#if processedFeed.length > 0}
				<VirtualList
					items={processedFeed}
					{getItemId}
					{itemsPerRow}
					height="100%"
					itemHeight={100}
					className="w-full !max-h-none"
					let:item
					let:items
				>
					<div
						class="grid gap-4 px-2 py-2"
						style="grid-template-columns: repeat({itemsPerRow}, minmax(0, 1fr));"
					>
						{#each items as contact (asKind0(contact)?.pubkey())}
							{@const kind0 = asKind0(contact)}
							{@const selected = selectedContact?.pubkey() == kind0?.pubkey()}
							<button
								class="flex flex-col items-center text-center"
								on:click|stopPropagation={() => toggleContactSelect(contact)}
							>
								<div class="avatar">
									<div
										class="w-16 h-16 rounded-full"
										class:border-2={selected}
										class:border-accent={selected}
									>
										<img
											src={proxyAvatarUrl(kind0?.picture()) || 'default-avatar.png'}
											alt={kind0?.name() || 'Contact'}
										/>
									</div>
								</div>
								<p class="text-sm mt-1 truncate w-full" class:font-bold={selected}>
									{kind0?.name() || 'Anonymous'}
								</p>
							</button>
						{/each}
					</div>
				</VirtualList>
			{:else}
				<div class="p-8 text-center opacity-70">No contacts to show yet.</div>
			{/if}
		</div>

		<!-- Bottom actions -->
		<div class="p-4 pb-safe bg-base-300/60 shrink-0 mb-0 md:mb-4">
			{#if selectedContact}
				{@const kind0 = asKind0(selectedContact)}
				<div class="flex items-center space-x-2">
					<input
						type="text"
						placeholder="Send as BM to {kind0?.name()}"
						class="input input-bordered flex-grow"
						bind:value={message}
						autocomplete="off"
						data-1p-ignore
						autofocus={false}
					/>
					<button
						type="button"
						class="btn btn-circle btn-accent"
						on:click={handleSendMessage}
						aria-label="Send"
					>
						<Icon icon="mdi:send" class="w-5 h-5" />
					</button>
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
				</div>
			{/if}
		</div>
	</div>
</div>
