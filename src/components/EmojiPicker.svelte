<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';

	export let onEmojiSelect: (emoji: string) => void;
	export let position: 'top' | 'bottom' = 'bottom';
	export let show = false;

	let emojiPickerRef: HTMLElement;
	let emojiPickerLoaded = false;

	onMount(async () => {
		// Dynamically import emoji-picker-element on client-side only
		await import('emoji-picker-element');
		emojiPickerLoaded = true;
	});

	onDestroy(() => {
		// Clean up event listener
		if (emojiPickerRef) {
			emojiPickerRef.removeEventListener('emoji-click', handleEmojiClick);
		}
	});

	// Set up emoji picker event handler when the ref is available
	$: if (emojiPickerRef) {
		emojiPickerRef.addEventListener('emoji-click', handleEmojiClick);
		emojiPickerRef.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				show = false;
				event.stopPropagation();
			}
		});
	}

	function handleEmojiClick(event: CustomEvent) {
		const emoji = event.detail.unicode;
		onEmojiSelect(emoji);
	}

	function toggleEmojiPicker() {
		show = !show;

		// Focus the editor after toggling
		// focusEditor();
	}

	// Apply dark/light theme to emoji picker
	function applyEmojiPickerTheme() {
		if (emojiPickerRef) {
			const isDarkMode = document.documentElement.classList.contains('dark');
			emojiPickerRef.setAttribute('theme', isDarkMode ? 'dark' : 'light');
		}
	}

	// Run when the emoji picker is mounted or theme changes
	$: if (emojiPickerRef) {
		applyEmojiPickerTheme();
	}
</script>

<button
	type="button"
	class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 {show
		? 'bg-gray-100 dark:bg-gray-700'
		: ''}"
	title="Insert emoji"
	on:click={toggleEmojiPicker}
	data-emoji-trigger
>
	<Icon icon="carbon:face-satisfied" class="w-5 h-5" />
</button>

{#if show}
	<div
		class="absolute {position === 'top' ? 'bottom-12' : 'top-12'} z-50"
		transition:fly={{ y: 10, duration: 150 }}
		style="transform: translateY(-20rem) translateX(-16rem);"
	>
		{#if emojiPickerLoaded}
			<emoji-picker bind:this={emojiPickerRef} class="emoji-picker fixed z-50"></emoji-picker>
		{/if}
	</div>
	<div class="fixed inset-0 z-10" on:click={() => (show = false)}></div>
{/if}

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
