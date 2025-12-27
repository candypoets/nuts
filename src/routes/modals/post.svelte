<script lang="ts">
	import { ParsedEvent, WorkerMessage, type ConnectionStatus } from '@candypoets/nipworker';
	import { usePublish, useSignEvent, useSubscription } from '@candypoets/nipworker/hooks';
	import { asParsedEvent, fbArray, isConnectionStatus } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { nip19, type EventTemplate, type NostrEvent } from 'nostr-tools';
	import Editor from 'src/components/Editor.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import { isMobile } from 'src/controller';
	import { composing } from 'src/controller/editor';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { prepareEvent } from 'src/editor/utils';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';
	import { now } from 'src/lib/period';
	import { getContext, onMount } from 'svelte';
	import type { Readable } from 'svelte/store';
	import { fly } from 'svelte/transition';
	import Note from '../explore/note.svelte';
	import User from '../explore/user.svelte';
	import { getUserRelays } from '../queries/user';

	export let placeholder = "Speak your mind it's Nostr";
	export let initialContent = '';
	export let onSubmit = (event: NostrEvent) => {};
	export let actionsOnTop = false;
	export let reply: string | undefined = undefined;
	export let note: ParsedEvent | undefined = undefined;
	export let repost: string | undefined = undefined;

	$: noteId = reply || repost;

	let editor: Readable<Editor>;
	let isSubmitting = false;
	let pagerAnimator: PagerAnimator | undefined = getContext('animator');
	let showPicker = false;

	onMount(async () => {
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

	async function handleSubmit() {
		let content = $editor.getText();
		if (isSubmitting || !content) return;
		isSubmitting = true;

		let post: EventTemplate = {
			kind: 1,
			created_at: now(),
			content: content.trim(),
			tags: []
		};

		if (note && reply) {
			post.id = reply;
			post.tags = fbArray(note, 'tags').map((sv) =>
				fbArray(sv, 'items').map((item) => item?.toString())
			);
		}

		if (note && repost) {
			if (!content.trim()) {
				post.kind = 1;
			} else {
				post.kind = 1;
			}
			post.content += '\n\nnostr:' + nip19.neventEncode({ id: repost });
			const timeoutPromise = new Promise<null>((resolve) => {
				setTimeout(() => resolve(null), 2000);
			});

			const relaysPromise = new Promise<string[]>((resolve) => {
				getUserRelays(note.pubkey()!.toString(), resolve);
			});

			await Promise.race([timeoutPromise, relaysPromise]).then((result) => {
				if (result === null) {
					post.tags = [
						['e', repost, '', 'mention'],
						['p', note!.pubkey()!.toString()]
					];
				} else {
					post.tags = [
						['e', repost, result[0], 'mention'],
						['p', note!.pubkey()!.toString()]
					];
				}
			});
		}
		post = prepareEvent(post);

		onSubmit(post as NostrEvent);

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
						{noteId}
						depth={1}
						showRoot={false}
						footer={false}
						showQuote={false}
						context={[note]}
					/>
					<br />
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
								<User pubkey={note.pubkey()?.toString()} />
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
