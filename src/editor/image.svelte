<script lang="ts">
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;
</script>

<NodeViewWrapper>
	<!-- <div class="my-2 relative"> -->
	{#if node.attrs.uploading}
		<span class="text-gray-400 animate-pulse">Uploading image to {node.attrs.uploadUrl}...</span>
	{:else if node.attrs.uploadError}
		Failed to upload image
	{:else}
		{node.attrs.src}
	{/if}
	<!-- </div> -->
</NodeViewWrapper>
