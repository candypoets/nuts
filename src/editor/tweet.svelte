<script lang="ts">
	import { onMount } from 'svelte';
	import { NodeViewWrapper } from 'svelte-tiptap';

	// Props passed from the NodeView
	export let node;
	export let updateAttributes;

	// Extract tweet data from node attributes
	const id = node.attrs?.id || '';
	const url = node.attrs?.url || '';
	const author = node.attrs?.author || '';
	const content = node.attrs?.content || '';
	const date = node.attrs?.date || '';

	let expanded = true;

	function toggleExpand() {
		expanded = !expanded;
	}
</script>

<NodeViewWrapper>
	<div class="border border-gray-200 rounded-md my-2 overflow-hidden">
		<div class="bg-blue-50 px-4 py-2 flex justify-between items-center">
			<div class="flex items-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 text-blue-400 mr-2"
					fill="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723 10.054 10.054 0 01-3.127 1.184 4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"
					/>
				</svg>
				<span class="font-medium text-blue-700">Tweet</span>
			</div>
			<button class="text-gray-500 hover:text-gray-700" on:click={toggleExpand}>
				{#if expanded}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
							clip-rule="evenodd"
						/>
					</svg>
				{/if}
			</button>
		</div>

		{#if expanded}
			<div class="p-4">
				<div class="flex items-start mb-2">
					<div class="w-10 h-10 rounded-full bg-gray-200 mr-3 flex-shrink-0"></div>
					<div>
						<div class="font-bold">{author || 'Unknown Author'}</div>
						<div class="text-gray-500 text-sm">{date || 'Unknown date'}</div>
					</div>
				</div>

				<div class="mb-3">
					{content || 'No content available'}
				</div>

				{#if url}
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						class="text-blue-600 text-sm hover:underline"
					>
						View on Twitter
					</a>
				{/if}
			</div>
		{/if}
	</div>
</NodeViewWrapper>
