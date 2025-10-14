<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { getContext, onMount } from 'svelte';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { go } from 'src/routes/modals/modal';
	import { asKind0, asKind3, asParsedEvent, fbArray } from '@candypoets/nipworker/utils';
	import {
	MessageType,
		type Kind3Parsed,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { kind3 } from 'src/controller/nostr';
	import { proxyAvatarUrl } from 'src/lib/proxy';
	import { useSubscription } from '@candypoets/nipworker/hooks';

	export let open: boolean = false;
	export let noteId: string | undefined = undefined;

	let animator: PagerAnimator = getContext('animator');
	let search: string = '';
	let feed: ParsedEvent[] = [];
	let cachedFeed: ParsedEvent[] = [];
	let eoce = false;
	let selectedContact: ParsedEvent | undefined = undefined;

	let feedRequests: RequestObject[] = [];
	let seen_npubs = new Map<number, boolean>();

	function updateFeed(message: WorkerMessage): ParsedEvent[] {
	switch (message.type()) {
	case MessageType.Eoce: {
		if (!eoce) {
			eoce = true;
			// Move cached into feed after cache phase closes
			mergeMapIntoFeed(cachedMap);
		}
		break;
	}
	}
		const parsedEvent = asParsedEvent(message);
		if (parsedEvent) {
			if (seen_npubs.has(parsedEvent?.pubkey()?.fnv1aHash() as number)) return feed;
			seen_npubs.set(parsedEvent?.pubkey()?.fnv1aHash() as number, true);
			return [...feed, parsedEvent];
		}
		return feed;
	}

	let note: ParsedEvent;

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

	$: feedRequests.length && useSubscription('contacts', feedRequests, updateFeed);

	$: filteredContacts = feed
		.filter((c) => asKind0(c)?.name())
		.sort((a, b) => {
			const nameA = asKind0(a)?.name()?.toString()?.trim() ?? '';
			const nameB = asKind0(b)?.name()?.toString()?.trim() ?? '';
			return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
		})
		.filter((contact) => {
			const kind0 = asKind0(contact);
			const name = kind0?.name()?.toString()?.toLowerCase() || '';
			const pubkey = kind0?.pubkey()?.toString()?.toLowerCase() || '';
			const lowerSearch = search.toLowerCase();
			return name.includes(lowerSearch) || pubkey.includes(lowerSearch);
		});

	function handleContactSelect(contact: ParsedEvent) {
		selectedContact = contact;
	}

	function handleSendMessage() {
		// Logic to send blurred message
		console.log('Sending blurred message to', asKind0(selectedContact)?.name());
		// After sending, maybe close the modal or clear selected contact
		selectedContact = undefined;
	}

	function copyNevent() {
		if (note) {
			// Logic to copy nevent
			console.log('Copying nevent for note:', note);
		}
	}

	function copyWebLink() {
		if (note) {
			// Logic to copy web link
			console.log('Copying web link for note:', note);
		}
	}

	function downloadImage() {
		if (note) {
			// Logic to download image
			console.log('Downloading image for note:', note);
		}
	}

	onMount(() => {
		if (noteId) {
			let replySub = useSubscription(noteId, [{ ids: [noteId], relays: [] }], (message) => {
				const parsedEvent = asParsedEvent(message);
				if (parsedEvent && parsedEvent?.id()?.toString() == noteId) {
					note = parsedEvent;
					replySub?.();
				}
			});
		}
	});
</script>

<div class="h-screen flex md:items-center items-end">
	<div
		class="bg-base-300 bg-opacity-85 backdrop-blur-md w-full h-1/2 rounded-t-2xl md:rounded-xl md:h-1/2 md:flex md:flex-col"
		role="dialog"
		aria-modal="true"
	>
		<!-- Header -->
		<div class="px-4 pt-safe flex justify-between h-16 items-center">
			<div on:click={animator.goBack}>
				<Icon icon="mingcute:down-line" class="text-xl" />
			</div>
			<h2 class="text-xl font-bold">Share</h2>
			<div></div>
			<!-- Spacer for centering title -->
		</div>

		<!-- Search Bar -->
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

		<!-- Contacts Grid -->
		<div class="flex-grow overflow-y-auto p-4">
			<div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
				{#each filteredContacts as contact (asKind0(contact)?.pubkey())}
					{@const kind0 = asKind0(contact)}
					<button
						class="flex flex-col items-center text-center"
						on:click={() => handleContactSelect(contact)}
					>
						<div class="avatar">
							<div class="w-16 h-16 rounded-full">
								<img
									src={proxyAvatarUrl(kind0?.picture()?.toString()) || 'default-avatar.png'}
									alt={kind0?.name()?.toString() || 'Contact'}
								/>
							</div>
						</div>
						<p class="text-sm mt-1 truncate w-full">{kind0?.name() || 'Anonymous'}</p>
					</button>
				{/each}
			</div>
		</div>

		<!-- Bottom Actions -->
		<div class="p-4 border-t border-base-content">
			{#if selectedContact}
				<div class="flex items-center space-x-2">
					<input
						type="text"
						placeholder="Send a bm (blurred message)"
						class="input input-bordered flex-grow"
					/>
					<button class="btn btn-primary" on:click={handleSendMessage}>Send</button>
				</div>
			{:else}
				<div class="flex gap-4">
					<div class="flex flex-col items-center">
						<button class="btn btn-circle" on:click={copyNevent}>
							<Icon icon="carbon:copy" />
						</button>
						<p class="text-xs">Nostr event</p>
					</div>
					<div class="flex flex-col items-center">
						<button class="btn btn-circle" on:click={copyWebLink}>
							<Icon icon="carbon:link" />
						</button>
						<p class="text-xs">Web link</p>
					</div>
					<!-- {#if note && note.tags && note.tags?.some((tag) => tag[0] === 'image')}
						<div class="flex flex-col items-center">
							<button class="btn btn-circle btn-outline" on:click={downloadImage}>
								<Icon icon="carbon:download" />
							</button>
							<p class="text-sm">Download image</p>
						</div>
					{/if} -->
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Add any specific styles here if needed, though Tailwind should handle most */
</style>
