<script lang="ts">
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Debug logging - only log when upload state changes
	$: if (node?.attrs) {
		console.log('Image upload state:', {
			uploading: node.attrs.uploading,
			uploadUrl: node.attrs.uploadUrl,
			uploadType: node.attrs.uploadType,
			defaultUploadUrl: node.attrs.defaultUploadUrl,
			uploadError: node.attrs.uploadError,
			src: node.attrs.src?.slice(0, 50) + '...'
		});
	}

	// Get the server URL to display
	$: serverUrl = node?.attrs?.uploadUrl || node?.attrs?.defaultUploadUrl || 'unknown server';
</script>

<NodeViewWrapper>
	<!-- <div class="my-2 relative"> -->
	{#if node.attrs.uploading}
		<div class="flex flex-col gap-1">
			<span class="text-gray-400 animate-pulse">
				Uploading image to <span class="text-primary font-medium">{serverUrl}</span>...
			</span>
			<span class="text-xs text-gray-500">Type: {node.attrs.uploadType || 'auto'}</span>
		</div>
	{:else if node.attrs.uploadError}
		<div class="bg-error/10 text-error p-3 rounded-lg max-w-md">
			<p class="font-semibold">Upload failed</p>
			<p class="text-sm">{node.attrs.uploadError}</p>
			<p class="text-xs mt-1 opacity-70">Server: {serverUrl}</p>
		</div>
	{:else}
		<img src={node.attrs.src} class="h-32" alt={node.attrs.alt || ''} />
	{/if}
	<!-- </div> -->
</NodeViewWrapper>
