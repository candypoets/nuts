<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';

	export let onEmojiSelect: (emoji: string) => void;
	export let position: 'top' | 'bottom' = 'bottom';

	let emojiPickerRef: HTMLElement;
	let emojiPickerLoaded = false;

	onMount(async () => {
		// Dynamically import emoji-picker-element on client-side only
		await import('emoji-picker-element');
		emojiPickerLoaded = true;

		// Apply theme when loaded
		applyEmojiPickerTheme();
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
	}

	function handleEmojiClick(event: CustomEvent) {
		const emoji = event.detail.unicode;
		onEmojiSelect(emoji);
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

<div
	class="absolute {position === 'top' ? 'bottom-12' : 'top-12'} z-50"
	transition:fly={{ y: 10, duration: 150 }}
>
	{#if emojiPickerLoaded}
		<emoji-picker bind:this={emojiPickerRef} class="emoji-picker fixed z-50"></emoji-picker>
	{/if}
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
