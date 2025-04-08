<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { extensions } from 'src/editor';
	import { Editor, EditorContent, createEditor } from 'svelte-tiptap';
	import Icon from '@iconify/svelte';
	import { fly } from 'svelte/transition';
	import type { Readable } from 'svelte/store';
	import GifPicker from 'src/comp/GIFPicker.svelte';
	import { prepareEvent } from 'src/editor/utils';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import type { AnyKind, Kind1Parsed } from 'src/parsers';
	import User from './user.svelte';
	import type { EventTemplate, NostrEvent, Relay } from 'nostr-tools';
	import { signEvent } from 'src/actions/wallet';
	import { now } from 'src/lib/period';
	import { signer } from 'src/stores/signer';
	import { nostrManager, type RelayStatus } from 'src/wasm/manager';
	import { replying } from 'src/controller/editor';

	export let placeholder = 'Write your reply...';
	export let initialContent = '';
	export let parent: ParsedEvent<Kind1Parsed>;
	export let context: ParsedEvent<AnyKind>[] = [];
	export let onSubmit = (event: NostrEvent) => {};

	let editorReady = false;
	let isSubmitting = false;
	let editor: Readable<Editor>;
	let isExpanded = false;
	let editorContainer: HTMLElement;
	let showEmojiPicker = false;
	let showGifPicker = false;
	let emojiPickerRef: HTMLElement;
	let emojiPickerLoaded = false;

	// Tenor API key
	const TENOR_API_KEY = 'YOUR_TENOR_API_KEY';

	onMount(async () => {
		// Dynamically import emoji-picker-element on client-side only
		await import('emoji-picker-element');
		emojiPickerLoaded = true;

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
		if (initialContent || $replying) {
			setTimeout(() => {
				$editor.commands.focus();
				isExpanded = true;
				$replying = false;
			}, 100);
		}
	});

	// Set up emoji picker event handler when the ref is available
	$: if (emojiPickerRef) {
		emojiPickerRef.addEventListener('emoji-click', handleEmojiClick);
	}

	onDestroy(() => {
		// Clean up event listener
		if (emojiPickerRef) {
			emojiPickerRef.removeEventListener('emoji-click', handleEmojiClick);
		}
	});

	function handleEmojiClick(event: CustomEvent) {
		if (editor && $editor) {
			const emoji = event.detail.unicode;
			$editor.commands.focus();
			$editor.commands.insertContent(emoji);
		}
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
		if (!$signer || !editorReady || isSubmitting || !$editor.getText().trim()) return;
		console.log('submitting', $editor.commands);
		isSubmitting = true;
		const content = $editor.getText();

		let reply = {
			...parent,
			created_at: now(),
			content
		} as EventTemplate;

		reply = prepareEvent(reply);

		reply = await signEvent($signer, reply);

		onSubmit(reply as NostrEvent);

		nostrManager.publish(reply as NostrEvent, (status: RelayStatus) => {
			console.log(status.relay, status.message);
		});

		$editor.commands.clearContent();
		isExpanded = false;
		showEmojiPicker = false;
		showGifPicker = false;

		isSubmitting = false;
	}

	function handleKeyDown(event) {
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

	function handleClickOutside(event: any) {
		// Close pickers when clicking outside
		if (
			showEmojiPicker &&
			emojiPickerRef &&
			!emojiPickerRef.contains(event?.target) &&
			!event?.target.closest('[data-emoji-trigger]')
		) {
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
	}

	function toggleGifPicker() {
		showGifPicker = !showGifPicker;
		if (showGifPicker) showEmojiPicker = false;
	}

	// Apply dark/light theme to emoji picker
	function applyEmojiPickerTheme() {
		if (emojiPickerRef) {
			const isDarkMode = document.documentElement.classList.contains('dark');

			if (isDarkMode) {
				emojiPickerRef.setAttribute('theme', 'dark');
			} else {
				emojiPickerRef.setAttribute('theme', 'light');
			}
		}
	}

	// Run when the emoji picker is mounted or theme changes
	$: if (showEmojiPicker && emojiPickerRef) {
		applyEmojiPickerTheme();
	}

	$: $replying && $editor?.commands?.focus();
	$: $replying && (isExpanded = true);
</script>

<svelte:window on:click={handleClickOutside} />

<div
	class="reply-editor w-full rounded-lg transition-all duration-200 {isExpanded
		? 'shadow-md'
		: 'shadow-sm'}"
	bind:this={editorContainer}
>
	{#if isExpanded}
		<div class="px-4 pt-3 text-sm text-gray-500 dark:text-gray-400">
			Replying to <User pubkey={parent.pubkey} {context} />
		</div>
	{/if}

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
					{#if isExpanded}
						{placeholder}
					{:else}
						Reply to <User pubkey={parent.pubkey} {context} link={false} />...
					{/if}
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

						{#if showEmojiPicker && emojiPickerLoaded}
							<div class="absolute bottom-12 z-50" transition:fly={{ y: 10, duration: 150 }}>
								<emoji-picker bind:this={emojiPickerRef} class="emoji-picker"></emoji-picker>
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
							<GifPicker apiKey={TENOR_API_KEY} onGifSelect={handleGifSelect} position="top" />
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
								<span>Signing...</span>
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

<style>
	/* Emoji picker styling */
	:global(.emoji-picker) {
		width: 320px;
		height: 320px;
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		border-radius: 0.5rem;
		border: 1px solid #e5e7eb;
		--border-radius: 0.5rem;
		--emoji-size: 1.5rem;
		--emoji-padding: 0.4rem;
	}

	:global(.dark .emoji-picker) {
		border-color: #374151;
	}
</style>
