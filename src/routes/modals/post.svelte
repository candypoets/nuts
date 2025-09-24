<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { extensions } from 'src/editor';
	import { Editor, EditorContent, createEditor } from 'svelte-tiptap';
	import Icon from '@iconify/svelte';
	import { fly } from 'svelte/transition';
	import type { Readable } from 'svelte/store';
	import EmojiPicker from 'src/components/EmojiPicker.svelte';
	import GifPicker from 'src/components/GIFPicker.svelte';
	import { prepareEvent } from 'src/editor/utils';
	import { nip19, type EventTemplate, type NostrEvent } from 'nostr-tools';
	import { now } from 'src/lib/period';
	import { composing } from 'src/controller/editor';
	import {
		Kind1Parsed,
		nostrManager,
		ParsedData,
		ParsedEvent,
		WorkerMessage,
		type ConnectionStatus,
		type SubscribeKind
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { asKind1, asParsedEvent, fbArray, isConnectionStatus } from '@candypoets/nipworker/utils';
	import Note from '../explore/note.svelte';
	import User from '../explore/user.svelte';
	import VirtualListBottom from 'src/components/VirtualListBottom.svelte';
	import type { PagerAnimator } from 'src/lib/animations/PagerAnimator';

	export let placeholder = "What's on your mind?";
	export let initialContent = '';
	export let onSubmit = (event: NostrEvent) => {};
	export let actionsOnTop = false;
	export let reply: string | undefined = undefined;
	export let note: ParsedEvent | undefined = undefined;
	export let repost: string | undefined = undefined;

	$: noteId = reply || repost;

	let editorReady = false;
	let isSubmitting = false;
	let editor: Readable<Editor>;
	let isExpanded = false;

	let pagerAnimator: PagerAnimator | undefined = getContext('animator');

	// Tenor API key
	const TENOR_API_KEY = 'AIzaSyB692q5nvoGphnMusHRvm1D_98a-DSQJRA';

	onMount(async () => {
		editor = createEditor({
			extensions,
			editorProps: {
				attributes: {
					class: 'outline-none',
					spellcheck: 'false',
					autocorrect: 'off',
					autocapitalize: 'off',
					'data-gramm': 'false'
				},
				handleDOMEvents: {
					focus: () => {
						return false;
					}
				}
			}
		});
		$editor.commands.setContent(initialContent);
		editorReady = true;

		// Focus the editor if there's initial content
		if (initialContent || $composing) {
			setTimeout(() => {
				focusEditor();
				isExpanded = true;
				$composing = false;
			}, 100);
		}
		focusEditor();
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

	// Added a dedicated function to handle editor focusing
	function focusEditor() {
		if (!$editor) return;

		// Use requestAnimationFrame for better timing
		requestAnimationFrame(() => {
			$editor.commands.focus();
			// Force focus on the actual DOM element for mobile keyboard
			const editorElement = $editor.view.dom;
			if (editorElement && editorElement.focus) {
				editorElement.focus();
				// For mobile devices, ensure the input is focusable
				if (editorElement.setAttribute) {
					editorElement.setAttribute('contenteditable', 'true');
				}
			}
		});
	}

	function handleEmojiSelect(emoji: string) {
		console.log('emoji select');
		if (editor && $editor) {
			$editor.commands.insertContent(emoji);

			// Close the picker and refocus the editor
			focusEditor();
		}
	}

	function handleGifSelect(gif: any) {
		// Get the GIF URL
		const gifUrl = gif.media_formats.gif.url;

		// Insert the GIF into the editor
		$editor.commands.insertContent(
			`<img src="${gifUrl}" alt="${gif.content_description || 'GIF'}" />`
		);

		focusEditor();
	}

	async function handleSubmit() {
		if (!editorReady || isSubmitting || !$editor.getText().trim()) return;
		isSubmitting = true;
		const content = $editor.getText();

		let post: EventTemplate = {
			kind: 1,
			created_at: now(),
			content,
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
				// post.kind = 6;
				post.kind = 1;
				// post.content = JSON
			} else {
				post.kind = 1;
			}
			post.content += '\n\nnostr:' + nip19.neventEncode({ id: repost });
			post.tags = [
				['e', repost, 'wss://relay.example', 'mention'],
				['p', note.pubkey()!.toString()]
			];
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

		$editor.commands.clearContent();
		isExpanded = false;

		isSubmitting = false;

		pagerAnimator.goBack();
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Submit on Ctrl+Enter or Cmd+Enter
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			handleSubmit();
		}

		// Escape minimizes the editor
		if (event.key === 'Escape') {
			if (!$editor.getText().trim()) {
				pagerAnimator.goBack();
			} else {
				$editor.commands.blur();
			}
		}
	}

	// Make sure editor focuses properly when composing
	$: $composing && focusEditor();
</script>

<div class="flex items-start md:items-center fullscreen-height">
	<VirtualListBottom
		items={[{ id: 'content' }]}
		height="auto"
		maxHeight="90vh"
		getItemId={(item) => {
			return item?.id;
		}}
	>
		<slot name="item-content">
			<div
				class="bg-base-300 md:border border-primary-content bg-opacity-85 rounded-xl md:p-4 w-feed md:h-auto fullscreen-height backdrop-blur-sm pt-safe overflow-visible"
			>
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
				{/if}
				<!-- Editor container -->
				<div
					class="min-h-[120px] rounded-md relative transition-all duration-200"
					on:keydown|stopPropagation={handleKeyDown}
					tabindex="-1"
				>
					<!-- Editor content -->
					<div
						class="min-h-[80px] border border-primary-content prose dark:prose-invert prose-sm max-w-none p-3 md:py-3 py-2 bg-opacity-85 bg-base-100 rounded-md cursor-text text-white"
						style="-webkit-backdrop-filter: blur(12px);"
						on:click|stopPropagation={focusEditor}
					>
						<EditorContent editor={$editor} />
					</div>

					<!-- Placeholder text -->
					{#if !$editor?.getText().trim()}
						<div
							class="absolute md:top-3 top-2 md:left-3 left-6 text-gray-400 pointer-events-none text-accent"
							style={editorReady ? '' : 'display: none;'}
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
						</div>
					{/if}
				</div>

				<div
					class="flex items-center justify-end mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 transition-opacity duration-200"
					transition:fly={{ y: 20, duration: 200 }}
				>
					<div class="flex items-center space-x-1 mr-4">
						<!-- Image upload button -->
						<button
							type="button"
							class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
							title="Upload image"
							on:click={() => {
								$editor.commands.selectFiles();
								focusEditor();
							}}
						>
							<Icon icon="carbon:image" class="w-5 h-5" />
						</button>

						<!-- Emoji picker button -->
						<div class="relative">
							<EmojiPicker onEmojiSelect={handleEmojiSelect} position="bottom" />
						</div>

						<!-- GIF picker button -->
						<div class="relative">
							<GifPicker apiKey={TENOR_API_KEY} onGifSelect={handleGifSelect} position="top" />
						</div>
					</div>

					<!-- Cancel & Post buttons -->
					<div class="flex items-center space-x-2">
						{#if $editor?.getText().trim()}
							<button
								type="button"
								class="px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
								on:click={() => {
									$editor.commands.clearContent();
								}}
							>
								Cancel
							</button>
						{/if}

						<button
							type="button"
							class="px-4 py-2 bg-blue-500 text-white rounded-full font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
							on:click={handleSubmit}
							disabled={!editorReady || isSubmitting || (!$editor?.getText().trim() && !repost)}
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
