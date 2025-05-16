<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { extensions } from 'src/editor';
	import { Editor, EditorContent, createEditor } from 'svelte-tiptap';
	import Icon from '@iconify/svelte';
	import { fly } from 'svelte/transition';
	import type { Readable } from 'svelte/store';
	import EmojiPicker from 'src/components/EmojiPicker.svelte';
	import GifPicker from 'src/components/GIFPicker.svelte';
	import { prepareEvent } from 'src/editor/utils';
	import type { EventTemplate, NostrEvent } from 'nostr-tools';
	import { now } from 'src/lib/period';
	import { nostrManager, type RelayStatus } from 'src/model/nostr';
	import { composing } from 'src/controller/editor';

	export let placeholder = "What's on your mind?";
	export let initialContent = '';
	export let onSubmit = (event: NostrEvent) => {};

	let editorReady = false;
	let isSubmitting = false;
	let editor: Readable<Editor>;
	let isExpanded = false;
	let editorContainer: HTMLElement;
	let showEmojiPicker = false;
	let showGifPicker = false;
	let editorFocusTimeout: ReturnType<typeof setTimeout>;

	// Tenor API key
	const TENOR_API_KEY = 'YOUR_TENOR_API_KEY';

	onMount(async () => {
		editor = createEditor({
			extensions,
			editorProps: {
				attributes: {
					class: 'outline-none'
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
	});

	onDestroy(() => {
		// Clear any pending timeouts
		clearTimeout(editorFocusTimeout);
	});

	// Added a dedicated function to handle editor focusing
	function focusEditor() {
		if (!$editor) return;

		// Clear any existing timeouts
		clearTimeout(editorFocusTimeout);

		// Use a timeout to ensure the focus happens after the current execution context
		editorFocusTimeout = setTimeout(() => {
			$editor.commands.focus();
			isExpanded = true;
		}, 10);
	}

	function handleEmojiSelect(event: CustomEvent) {
		if (editor && $editor) {
			const emoji = event.detail.unicode;
			$editor.commands.insertContent(emoji);

			// Close the picker and refocus the editor
			showEmojiPicker = false;
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

		// Close the GIF picker and refocus the editor
		showGifPicker = false;
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

		post = prepareEvent(post);

		onSubmit(post as NostrEvent);

		nostrManager.publish('post', post as NostrEvent, (status: RelayStatus) => {
			console.log(status.relay, status.message);
		});

		$editor.commands.clearContent();
		isExpanded = false;
		showEmojiPicker = false;
		showGifPicker = false;

		isSubmitting = false;
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Submit on Ctrl+Enter or Cmd+Enter
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			handleSubmit();
		}

		// Escape minimizes the editor
		if (event.key === 'Escape' && isExpanded) {
			if (!$editor.getText().trim()) {
				isExpanded = false;
				$editor.commands.blur();
			}

			// Close pickers if open
			showEmojiPicker = false;
			showGifPicker = false;
		}
	}

	function handleEditorFocus() {
		isExpanded = true;
	}

	// Modified to handle click on the entire container
	function handleEditorContainerClick() {
		focusEditor();
	}

	function handleClickOutside(event: any) {
		// Close pickers when clicking outside
		if (showEmojiPicker && !event?.target.closest('[data-emoji-trigger]')) {
			showEmojiPicker = false;
		}

		if (showGifPicker && !event?.target.closest('[data-gif-trigger]')) {
			// The GifPicker component handles its own click containment
			showGifPicker = false;
		}

		// If editor is expanded and click is outside editor container
		// and there's no content, minimize the editor
		if (
			isExpanded &&
			editorContainer &&
			!editorContainer.contains(event?.target) &&
			editor &&
			!$editor.getText().trim()
		) {
			isExpanded = false;
			$editor.commands.blur();
		}
	}

	function toggleEmojiPicker() {
		showEmojiPicker = !showEmojiPicker;
		if (showEmojiPicker) showGifPicker = false;

		// Focus the editor after toggling
		focusEditor();
	}

	function toggleGifPicker() {
		showGifPicker = !showGifPicker;
		if (showGifPicker) showEmojiPicker = false;

		// Focus the editor after toggling
		focusEditor();
	}

	// Make sure editor focuses properly when composing
	$: $composing && focusEditor();
	$: $composing && (isExpanded = true);
</script>

<svelte:window on:click={handleClickOutside} />

<div
	class="w-feed m-auto rounded-lg transition-all duration-200 {isExpanded
		? 'shadow-md'
		: 'shadow-sm'}"
	bind:this={editorContainer}
>
	<div class="p-3">
		<!-- Editor container -->
		<div
			class="min-h-[60px] rounded-md dark:bg-gray-800 relative transition-all duration-200"
			on:keydown|stopPropagation={handleKeyDown}
			on:click={handleEditorContainerClick}
			tabindex="-1"
		>
			<!-- Editor content -->
			<div class="prose dark:prose-invert prose-sm max-w-none p-3 bg-base-300 rounded-xl">
				<EditorContent editor={$editor} on:focus={handleEditorFocus} />
			</div>

			<!-- Placeholder text -->
			{#if !$editor?.getText().trim()}
				<div
					class="absolute top-3 left-3 text-gray-400 pointer-events-none"
					style={editorReady ? '' : 'display: none;'}
				>
					{placeholder}
				</div>
			{/if}
		</div>

		<!-- Editor toolbar - only visible when expanded -->
		{#if isExpanded}
			<div
				class="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 transition-opacity duration-200"
				transition:fly={{ y: 20, duration: 200 }}
			>
				<div class="flex items-center space-x-1">
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
						<button
							type="button"
							class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 {showEmojiPicker
								? 'bg-gray-100 dark:bg-gray-700'
								: ''}"
							title="Insert emoji"
							on:click={toggleEmojiPicker}
							data-emoji-trigger
						>
							<Icon icon="carbon:face-satisfied" class="w-5 h-5" />
						</button>

						{#if showEmojiPicker}
							<EmojiPicker onEmojiSelect={handleEmojiSelect} position="bottom" />
						{/if}
					</div>

					<!-- GIF picker button -->
					<div class="relative">
						<button
							type="button"
							class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 {showGifPicker
								? 'bg-gray-100 dark:bg-gray-700'
								: ''}"
							title="Insert GIF"
							on:click={toggleGifPicker}
							data-gif-trigger
						>
							<Icon icon="mage:gif" class="w-5 h-5" />
						</button>

						{#if showGifPicker}
							<GifPicker apiKey={TENOR_API_KEY} onGifSelect={handleGifSelect} position="bottom" />
						{/if}
					</div>
				</div>

				<!-- Cancel & Post buttons -->
				<div class="flex items-center space-x-2">
					{#if $editor?.getText().trim()}
						<button
							type="button"
							class="px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
							on:click={() => {
								isExpanded = false;
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
						disabled={!editorReady || isSubmitting || !$editor?.getText().trim()}
					>
						<div class="flex items-center space-x-1">
							{#if isSubmitting}
								<span>Signing...</span>
								<Icon icon="carbon:circle-dash" class="w-4 h-4 animate-spin" />
							{:else}
								<span>Post</span>
								<Icon icon="carbon:send" class="w-4 h-4" />
							{/if}
						</div>
					</button>
				</div>
			</div>
		{:else if $editor?.getText().trim()}
			<!-- Minimized state with content - show just the post button -->
			<div class="flex justify-end mt-2">
				<button
					type="button"
					class="px-4 py-1.5 bg-blue-500 text-white rounded-full font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 transition"
					on:click={handleSubmit}
				>
					<div class="flex items-center space-x-1">
						<span>Post</span>
						<Icon icon="carbon:send" class="w-4 h-4" />
					</div>
				</button>
			</div>
		{/if}
	</div>
</div>
