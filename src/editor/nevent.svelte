<script lang="ts">
	import { onMount } from 'svelte';
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Extract nevent data from node attributes
	const id = node.attrs?.id || '';
	const relays = node.attrs?.relays || [];

	// Since this is a quote that doesn't show content directly,
	// we'll start with a collapsed state that can be expanded
	let expanded = false;
	let loading = false;
	let eventData = null;

	async function toggleExpand() {
		expanded = !expanded;

		if (expanded && !eventData && id) {
			loading = true;
			try {
				// Here you would fetch the actual event data from Nostr
				// eventData = await fetchEventFromNostr(id, relays);

				// Placeholder for demonstration
				eventData = { content: 'Example quoted content' };
			} catch (error) {
				console.error('Failed to load quoted event:', error);
			} finally {
				loading = false;
			}
		}
	}
</script>

<NodeViewWrapper>
	<div
		class="border border-gray-200 rounded-md p-2 my-2 bg-gray-50 cursor-pointer"
		on:click={toggleExpand}
	>
		<!-- No visible content for the collapsed quote, just an indicator -->
		<div class="flex items-center text-gray-600">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 mr-2"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
					clip-rule="evenodd"
				/>
			</svg>
			<span>Quoted note (click to {expanded ? 'collapse' : 'expand'})</span>
		</div>

		<!-- Expanded content - only shown when expanded -->
		{#if expanded}
			<div class="mt-2 border-t border-gray-200 pt-2">
				{#if loading}
					<div class="text-center py-2">
						<span class="inline-block animate-pulse">Loading...</span>
					</div>
				{:else if eventData}
					<div class="text-sm text-gray-700">
						{eventData.content}
					</div>
				{:else}
					<div class="text-sm text-gray-500">Unable to load quoted content</div>
				{/if}
			</div>
		{/if}
	</div>
</NodeViewWrapper>
