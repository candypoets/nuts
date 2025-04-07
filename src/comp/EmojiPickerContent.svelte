<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import tippy, { type Instance, type Props } from 'tippy.js';
	import 'tippy.js/dist/tippy.css';
	import 'tippy.js/themes/light-border.css'; // Or your preferred theme

	// Props
	export let triggerElement: HTMLElement | null = null; // The DOM element that triggers the popover
	export let emojis: string[] = [];
	export let onSelect = (emoji: string) => {}; // Callback function for when an emoji is selected

	// Internal state
	let contentElement: HTMLElement; // Reference to the root div of this component
	let tippyInstance: Instance<Props> | null = null;

	// Reactive statement to initialize or update Tippy when props change
	$: if (triggerElement && contentElement) {
		// Use tick to ensure DOM updates are flushed before initializing/updating
		tick().then(initializeOrUpdateTippy);
	} else {
		// If trigger is removed, destroy the instance
		destroyTippy();
	}

	function initializeOrUpdateTippy() {
		if (!triggerElement || !contentElement) return;

		// Destroy existing instance if trigger changes (unlikely but safe)
		if (tippyInstance && tippyInstance.reference !== triggerElement) {
			destroyTippy();
		}

		// Initialize if it doesn't exist yet for this trigger
		if (!tippyInstance) {
			// console.log('Initializing Tippy on:', triggerElement);
			tippyInstance = tippy(triggerElement, {
				content: contentElement, // Use this component's root element as content
				trigger: 'click',
				interactive: true,
				placement: 'top',
				theme: 'light-border',
				appendTo: () => document.body,
				// Hide the tippy manually when an emoji is selected (handled in handleSelect)
				onShow(instance) {
					// Optional: logic when tippy is shown
				},
				onHide(instance) {
					// Optional: logic when tippy is hidden
				}
			});
		} else {
			// If instance exists, potentially update props if needed (usually not necessary for content element)
			// console.log('Tippy instance already exists for:', triggerElement);
		}
	}

	function destroyTippy() {
		if (tippyInstance) {
			// console.log('Destroying Tippy instance');
			tippyInstance.destroy();
			tippyInstance = null;
		}
	}

	function handleSelect(emoji: string) {
		onSelect(emoji); // Call the provided callback
		tippyInstance?.hide(); // Hide the popover after selection
	}

	// Ensure Tippy is destroyed when the Svelte component unmounts
	onDestroy(() => {
		destroyTippy();
	});
</script>

<!-- bind:this gets the DOM node reference for the component's root -->
<div
	bind:this={contentElement}
	class="flex space-x-1 p-1.5 bg-white border border-gray-300 rounded-lg shadow-lg"
	role="menu"
	aria-orientation="horizontal"
	on:click|stopPropagation
>
	<!-- Stop propagation -->
	{#each emojis as emoji (emoji)}
		<button
			type="button"
			class="cursor-pointer p-1 text-xl rounded hover:bg-gray-200 transition-transform transform hover:scale-125 focus:outline-none focus:ring-2 focus:ring-blue-400"
			on:click={() => handleSelect(emoji)}
			title={`React with ${emoji}`}
			role="menuitem"
		>
			{emoji}
		</button>
	{/each}
</div>

<style>
	/* Ensure the content element isn't displayed in the normal flow initially */
	/* Tippy will move it to the body when shown */
	div:not(.tippy-box div) {
		/* display: none; */ /* This might be too aggressive initially. Tippy should handle it. */
		/* If you see a flash of the content, uncommenting display:none might help, */
		/* but ensure Tippy can still access and display it. */
	}
</style>
