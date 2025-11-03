<script lang="ts">
	import { writable } from 'svelte/store';
	import { onMount, onDestroy, getContext } from 'svelte';

	const animator = getContext('animator');

	// List of available themes from tailwind.config.cjs
	const themes = ['light', 'dark', 'matteblack', 'snowwhite', 'downfox'];

	// Writable store for the current theme (could be moved to src/controller/theme.ts for global use)
	export const theme = writable<string>('light'); // Default to 'light'

	// Variable for the currently highlighted theme index (for keyboard navigation)
	let highlightedIndex: number = 0;

	// Load persisted theme from localStorage on mount and set initial highlighted index
	onMount(() => {
		const savedTheme = localStorage.getItem('appTheme');
		if (savedTheme && themes.includes(savedTheme)) {
			theme.set(savedTheme);
			applyTheme(savedTheme);
			highlightedIndex = themes.indexOf(savedTheme);
		} else {
			applyTheme('light');
			highlightedIndex = 0;
		}
	});

	// Function to apply the theme to the document
	function applyTheme(selectedTheme: string) {
		document.documentElement.setAttribute('data-theme', selectedTheme);
		localStorage.setItem('theme', $theme);
	}

	// Handler for theme selection
	function selectTheme(selected: string) {
		theme.set(selected);
		applyTheme(selected);
		localStorage.setItem('appTheme', selected);
		// Close the modal by navigating back (adjust based on your modal routing setup)
	}

	// Keyboard event handler
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex + 1) % themes.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex - 1 + themes.length) % themes.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			selectTheme(themes[highlightedIndex]);
		}
	}

	// Add keyboard listener on mount and remove on destroy
	onMount(() => {
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});

	onDestroy(() => {
		document.removeEventListener('keydown', handleKeydown);
	});
</script>

<!-- Modal structure: Assuming this is a full-page modal or overlay; style with Tailwind/daisyUI -->
<div class="h-screen flex items-center">
	<div class="w-feed bg-base-300 p-4 rounded-lg">
		<h3 class="font-bold text-lg">Select Theme</h3>
		<p class="py-4">Choose your preferred theme (use arrow keys to navigate, Enter to select):</p>

		<div class="grid grid-cols-1 gap-4">
			{#each themes as t, index}
				<button
					class="btn btn-outline
            {$theme === t ? 'btn-active' : ''}
            {highlightedIndex === index ? 'ring-2 ring-primary' : ''}"
					on:click={() => selectTheme(t)}
				>
					{t.charAt(0).toUpperCase() + t.slice(1)}
				</button>
			{/each}
		</div>

		<div class="modal-action">
			<button class="btn" on:click={() => animator?.goBack()}>Close</button>
		</div>
	</div>
</div>

<style>
	/* Optional: Custom styles for the modal if needed */
</style>
