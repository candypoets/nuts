<script lang="ts">
	import { ParsedEvent, WorkerMessage, type ConnectionStatus } from '@candypoets/nipworker';
	import { usePublish, useSignEvent, useSubscription } from '@candypoets/nipworker/hooks';
	import { asParsedEvent, fbArray, isConnectionStatus, isKind1, isParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { nip19, type EventTemplate, type NostrEvent } from 'nostr-tools';
	import Editor from 'src/components/Editor.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { isMobile, readRelays, writeRelays } from 'src/controller';
	import { composing } from 'src/controller/editor';
	import { get } from 'svelte/store';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { prepareEvent } from 'src/editor/utils';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { now } from 'src/lib/period';
	import { getContext, onDestroy, onMount } from 'svelte';
	import type { Readable } from 'svelte/store';
	import { fly } from 'svelte/transition';
	import Note from '../explore/note.svelte';
	import User from '../explore/user.svelte';
	import { getUserRelays } from '../queries/user';
	import { decode } from 'nostr-tools/nip19';

	export let placeholder = "Speak your mind it's Nostr";
	export let initialContent = '';
	export let onSubmit = (event: NostrEvent) => {};
	export let actionsOnTop = false;
	export let reply: string | undefined = undefined;
	export let note: ParsedEvent | undefined = undefined;
	export let repost: string | undefined = undefined;

	$: noteId = reply || repost;
	$: hexId = (() => {
		if (!noteId) return undefined;
		try {
			const decoded = decode(noteId);
			if (decoded?.type === 'nevent') {
				return decoded.data.id;
			}
		} catch {
			// Not an nevent, assume it's already a hex id
		}
		return noteId;
	})();

	let editor: Readable<Editor>;
	let isSubmitting = false;
	let pagerAnimator: PagerAnimator | undefined = getContext('animator');
	let showPicker = false;

	let replySub: (() => void) | undefined;

	onMount(async () => {
		if (noteId) {
			// Try to decode as nevent to get hex id and relay hints
			let hexId = noteId;
			let relayHints: string[] = [];
			try {
				const decoded = decode(noteId);
				if (decoded && decoded.type === 'nevent') {
					hexId = decoded.data.id;
					relayHints = decoded.data.relays || [];
				}
			} catch {
				// Not an nevent, use noteId as-is (it's already a hex id)
			}

			// Add user's read and write relays as fallback
			const userReadRelays = get(readRelays);
			const userWriteRelays = get(writeRelays);
			const allRelays = [...new Set([...relayHints, ...userReadRelays, ...userWriteRelays])];

			replySub = useSubscription(
				'post_' + hexId,
				[
					{
						kinds: [1],
						ids: [hexId],
						limit: 5,
						relays: allRelays
					}
				],
				(message) => {
					const parsedEvent = isParsedEvent(message);
					const kind1 = isKind1(message);
					if (kind1 && parsedEvent && parsedEvent.id() === hexId) {
						note = parsedEvent;
					}
				}
			);
		}
	});

	onDestroy(() => {
		replySub?.();
	});

	async function handleSubmit() {
		let content = $editor.getText();
		if (isSubmitting || !content) return;
		isSubmitting = true;

		// Get tags from the editor (nprofile -> p tags, nevent -> q tags, etc.)
		const editorTags = $editor.storage.nostr?.getEditorTags() || [];

		let post: EventTemplate = {
			kind: 1,
			created_at: now(),
			content: content.trim(),
			tags: editorTags
		};

		if (note && reply) {
			post.id = reply;
			// Start with parent's tags, then add editor tags
			const parentTags = fbArray(note, 'tags').map((sv) =>
				fbArray(sv, 'items').map((item) => item)
			);
			post.tags = [...parentTags, ...editorTags];
		}

		if (note && repost) {
			// Append the quoted event as a nostr:nevent in content
			post.content += '\n\nnostr:' + nip19.neventEncode({ id: repost });
			
			// Get relay hints for the quoted event
			const timeoutPromise = new Promise<null>((resolve) => {
				setTimeout(() => resolve(null), 2000);
			});

			const relaysPromise = new Promise<string[]>((resolve) => {
				getUserRelays(note.pubkey(), resolve);
			});

			const result = await Promise.race([timeoutPromise, relaysPromise]);
			const relayHint = result === null ? '' : result[0];
			
			// Add q tag for the quoted event (NIP-18) and p tag for the author
			post.tags = [
				...editorTags,
				['q', repost, relayHint, note!.pubkey()],
				['p', note!.pubkey()]
			];
		}

		post = prepareEvent(post);

		onSubmit(post as NostrEvent);

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

		isSubmitting = false;
		pagerAnimator.goBack();
	}

	function toggleGifPicker() {
		showPicker = !showPicker;
		// $editor?.commands.focus();
	}
</script>

<div class="flex items-start md:items-center h-screen">
	<VirtualListBottom
		items={[{ id: 'content' }]}
		height="auto"
		maxHeight={$isMobile ? '100vh' : '90vh'}
		getItemId={(item) => {
			return item?.id;
		}}
	>
		<slot name="item-content">
			<div
				class="bg-base-300 md:border border-primary-content bg-opacity-85 rounded-xl px-4 w-feed md:h-auto md:min-h-fit min-h-screen backdrop-blur-sm overflow-visible"
			>
				<div class="md:px-0 pt-safe flex justify-between h-20 items-center">
					<div on:click={pagerAnimator.goBack}>
						<Icon icon="mingcute:down-line" class="text-xl" />
					</div>
				</div>
				{#if noteId && note}
					<Note
						noteId={hexId}
						depth={1}
						showRoot={false}
						footer={false}
						showQuote={false}
						context={[note]}
					/>
					<br />
				{:else if noteId}
					<!-- Loading state -->
					<div class="h-32 flex items-center justify-center">
						<Icon icon="carbon:circle-dash" class="w-8 h-8 animate-spin text-gray-400" />
					</div>
				{:else if $isMobile}
					<div class="h-32" />
				{/if}

				<!-- Editor container -->
				<div class="min-h-[120px] rounded-md relative transition-all duration-200" tabindex="-1">
					<Editor
						{initialContent}
						class="min-h-32 rounded-md border border-primary-content"
						onSubmit={handleSubmit}
						bind:editor
						{showPicker}
						autoFocus
					>
						{#if reply}
							Reply to
							{#if note}
								<User pubkey={note.pubkey()} />
							{/if}
						{:else if repost}
							Add a quote?
						{:else}
							{placeholder}
						{/if}
					</Editor>
				</div>

				<!-- Actions section -->
				<div
					class="flex items-center justify-end mt-3 pt-2 border-t border-primary-content dark:border-gray-700 transition-opacity duration-200 pb-safe md:pb-4"
					transition:fly={{ y: 20, duration: 200 }}
				>
					<div class="flex items-center space-x-1 mr-4">
						<!-- Image upload button -->
						<button
							type="button"
							class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
							title="Upload image"
							on:click={() => {
								if ($editor) {
									$editor.commands.selectFiles();
									$editor.commands.focus();
								}
							}}
						>
							<Icon icon="carbon:image" class="w-5 h-5" />
						</button>

						<!-- Emoji picker button -->
						<!-- <div class="relative">
							<EmojiPicker onEmojiSelect={handleEmojiSelect} position="bottom" />
						</div> -->

						<button
							type="button"
							class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
							title="Insert GIF"
							on:click={toggleGifPicker}
							data-gif-trigger
						>
							<Icon icon="mage:gif" class="w-5 h-5" />
						</button>
					</div>

					<!-- Cancel & Post buttons -->
					<div class="flex items-center space-x-2">
						{#if $editor?.getText().trim()}
							<button
								type="button"
								class="px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
								on:click|stopPropagation={() => {
									$editor.commands.clearContent();
								}}
							>
								Cancel
							</button>
						{/if}

						<button
							type="button"
							class="px-4 py-2 bg-blue-500 text-highlight rounded-full font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
							on:click={handleSubmit}
							disabled={isSubmitting || (!$editor?.getText().trim() && !repost)}
						>
							<div class="flex items-center space-x-1">
								{#if isSubmitting}
									<span>Signing...</span>
									<Icon icon="carbon:circle-dash" class="w-4 h-4 animate-spin" />
								{:else}
									{#if reply}
										<span>Reply</span>
									{:else if repost}
										<span>Repost</span>
									{:else}
										<span>Post</span>
									{/if}
									<Icon icon="carbon:send" class="w-4 h-4" />
								{/if}
							</div>
						</button>
					</div>
				</div>
			</div>
		</slot>
	</VirtualListBottom>
</div>
