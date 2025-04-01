<script lang="ts">
	import { onMount } from 'svelte';
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Extract nprofile data from node attributes
	const npub = node.attrs?.id || '';
	const name = node.attrs?.name || '';
	const relays = node.attrs?.relays || [];

	// Display formatted name (without the full npub in UI)
	$: displayName = name || (npub ? `${npub.substring(0, 8)}...` : 'Unknown user');

	// Handle click to potentially view profile
	function handleClick() {
		// You can dispatch a custom event to handle profile navigation
		// or implement inline functionality
	}
</script>

<NodeViewWrapper>
	<span
		class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-sm font-medium text-blue-700 cursor-pointer hover:bg-blue-100"
		on:click={handleClick}
	>
		@{displayName}
	</span>
</NodeViewWrapper>
