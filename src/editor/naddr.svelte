<script lang="ts">
	import { onMount } from 'svelte';
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Extract naddr data from node attributes
	const kind = node.attrs?.kind || '';
	const pubkey = node.attrs?.pubkey || '';
	const identifier = node.attrs?.identifier || '';
	const relays = node.attrs?.relays || [];

	// Format display text
	$: displayText = identifier || `${kind}:${pubkey.substring(0, 8)}...`;

	// Handle click to view the referenced content
	function handleClick() {
		// Navigate to the content or display it in a modal
		// This would be application-specific
	}
</script>

<NodeViewWrapper>
	<span
		class="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-sm font-medium text-purple-700 cursor-pointer hover:bg-purple-100"
		on:click={handleClick}
	>
		{displayText}
	</span>
</NodeViewWrapper>
