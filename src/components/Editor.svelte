<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { extensions } from 'src/editor';
	import { Editor, EditorContent, createEditor } from 'svelte-tiptap';
	import Icon from '@iconify/svelte';
	import { type Readable } from 'svelte/store';
	import EmojiPicker from 'src/components/EmojiPicker.svelte';
	import GifPicker from 'src/components/GIFPicker.svelte';

	// Props
	export let placeholder = 'Write a message...';
	export let initialContent = '';
	export let isCompact = false; // Whether to use compact chat mode or expanded mode
	export let onSubmit = (content: string) => {};
	export let submitOnEnter = false; // For chat mode, submit on Enter without Shift

	// State
	let editorReady = false;
	let isSubmitting = false;
	let editor: Readable<Editor>;
	let isExpanded = false;
	let editorContainer: HTMLElement;
	let showEmojiPicker = false;
	let showGifPicker = false;

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
		if (initialContent) {
			setTimeout(() => {
				$editor.commands.focus();
				isExpanded = true;
			}, 100);
		}

		// In compact mode, always show expanded
		if (isCompact) {
			isExpanded = true;
		}
	});

	function handleEmojiSelect(emoji: string) {
		if (editor && $editor) {
			$editor.commands.focus();
			$editor.commands.insertContent(emoji);
		}
		showEmojiPicker = false;
	}

	function handleGifSelect(gif: any) {
		// Get the GIF URL
		const gifUrl = gif.media_formats.gif.url;

		// Insert the GIF into the editor
		$editor.commands.focus();
		$editor.commands.insertContent(
			`<img src="${gifUrl}" alt="${gif.content_description || 'GIF'}" />`
		);

		// Close the GIF picker
		showGifPicker = false;
	}

	async function handleSubmit() {
		if (!editorReady || isSubmitting || !$editor.getText().trim()) return;
		isSubmitting = true;
		const content = $editor.getText();

		// Call the provided submit handler
		await onSubmit(content);

		$editor.commands.clearContent();
		if (!isCompact) {
			isExpanded = false;
		}
		showEmojiPicker = false;
		showGifPicker = false;

		isSubmitting = false;
	}

	function handleKeyDown(event) {
		// Submit on Ctrl+Enter/Cmd+Enter or just Enter in chat mode
		if (
			((event.ctrlKey || event.metaKey) && event.key === 'Enter') ||
			(submitOnEnter && event.key === 'Enter' && !event.shiftKey)
		) {
			event.preventDefault();
			handleSubmit();
		}

		// Escape minimizes the editor in non-compact mode
		if (event.key === 'Escape' && !isCompact) {
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

	function handleClickOutside(event: any) {
		// Close pickers when clicking outside
		if (showEmojiPicker && !event?.target.closest('[data-emoji-trigger]')) {
			showEmojiPicker = false;
		}

		if (showGifPicker && !event?.target.closest('[data-gif-trigger]')) {
			showGifPicker = false;
		}

		// If editor is expanded and click is outside editor container
		// and there's no content, minimize the editor in non-compact mode
		if (
			!isCompact &&
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
	}

	function toggleGifPicker() {
		showGifPicker = !showGifPicker;
		if (showGifPicker) showEmojiPicker = false;
	}
</script>

<svelte:window on:click={handleClickOutside} />

{#if isCompact}
	<!-- Compact chat-style editor -->
	<div
		class="message-editor w-full rounded-lg border border-primary-content"
		bind:this={editorContainer}
	>
		<div class="flex items-center bg-base-300 rounded-xl">
			<!-- Editor container -->
			<div
				class="flex-grow min-h-[40px] rounded-l-xl relative"
				on:keydown={handleKeyDown}
				tabindex="-1"
			>
				<!-- Editor content -->
				<div class="prose dark:prose-invert prose-sm max-w-none p-3">
					<EditorContent editor={$editor}></EditorContent>
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

			<!-- Editor toolbar - always visible in compact mode -->
			<div class="flex items-center pr-2">
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
						<div class="relative">
							<EmojiPicker onEmojiSelect={handleEmojiSelect} position="top" />
						</div>
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
						<div class="relative">
							<GifPicker apiKey={TENOR_API_KEY} onGifSelect={handleGifSelect} position="top" />
						</div>
					{/if}
				</div>

				<!-- Image upload button -->
				<button
					type="button"
					class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
					title="Upload image"
					on:click={() => $editor.commands.selectFiles()}
				>
					<Icon icon="carbon:image" class="w-5 h-5" />
				</button>

				<!-- Send button -->
				<button
					type="button"
					class="p-2 ml-1 bg-blue-500 text-white rounded-full font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
					on:click={handleSubmit}
					disabled={!editorReady || isSubmitting || !$editor?.getText().trim()}
				>
					{#if isSubmitting}
						<Icon icon="carbon:circle-dash" class="w-5 h-5 animate-spin" />
					{:else}
						<Icon icon="carbon:send-alt" class="w-5 h-5" />
					{/if}
				</button>
			</div>
		</div>
	</div>
{:else}
	<!-- Full expandable editor -->
	<div
		class="message-editor w-full rounded-lg transition-all duration-200 {isExpanded
			? 'shadow-md'
			: 'shadow-sm'}"
		bind:this={editorContainer}
	>
		<div class="p-3">
			<!-- Editor container -->
			<div
				class="min-h-[40px] rounded-md dark:bg-gray-800 relative transition-all duration-200"
				on:keydown={handleKeyDown}
				on:focus={handleEditorFocus}
				tabindex="-1"
			>
				<!-- Editor content -->
				<div
					class="prose dark:prose-invert prose-sm max-w-none p-3 bg-base-300 rounded-xl"
					on:click={handleEditorFocus}
				>
					<EditorContent editor={$editor}></EditorContent>
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
				>
					<div class="flex items-center space-x-1">
						<!-- Image upload button -->
						<button
							type="button"
							class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
							title="Upload image"
							on:click={() => $editor.commands.selectFiles()}
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
								<div class="relative">
									<EmojiPicker onEmojiSelect={handleEmojiSelect} position="bottom" />
								</div>
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
								<div class="relative">
									<GifPicker
										apiKey={TENOR_API_KEY}
										onGifSelect={handleGifSelect}
										position="bottom"
									/>
								</div>
							{/if}
						</div>
					</div>

					<!-- Cancel & Send buttons -->
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
									<span>Sending...</span>
									<Icon icon="carbon:circle-dash" class="w-4 h-4 animate-spin" />
								{:else}
									<span>Send</span>
									<Icon icon="carbon:send" class="w-4 h-4" />
								{/if}
							</div>
						</button>
					</div>
				</div>
			{:else if $editor?.getText().trim()}
				<!-- Minimized state with content - show just the send button -->
				<div class="flex justify-end mt-2">
					<button
						type="button"
						class="px-4 py-1.5 bg-blue-500 text-white rounded-full font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700 transition"
						on:click={handleSubmit}
					>
						<div class="flex items-center space-x-1">
							<span>Send</span>
							<Icon icon="carbon:send" class="w-4 h-4" />
						</div>
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
