<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import Icon from '@iconify/svelte';

	export let originalPost: any; // The post that was replied to
	export let replies: any[] = []; // Array of reply events
	export let timestamp: number = Date.now() / 1000; // Timestamp of most recent reply
	export let expanded: boolean = false; // Whether to show all replies or just a summary

	// Get unique authors who replied
	$: uniqueAuthors = [...new Set(replies.map((reply) => reply.pubkey))];
	$: latestReply = replies.sort((a, b) => b.created_at - a.created_at)[0];

	function toggleExpanded() {
		expanded = !expanded;
	}

	function formatTime(timestamp: number): string {
		return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
	}
</script>

<div
	class="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-4 hover:bg-gray-50 transition-colors"
>
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="bg-blue-100 p-2 rounded-full flex-shrink-0">
			<Icon icon="mdi:message-reply" class="text-blue-600 text-lg" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with reply count -->
			<div class="flex justify-between items-center mb-2">
				<div class="font-medium text-gray-800">
					{uniqueAuthors.length}
					{uniqueAuthors.length === 1 ? 'person' : 'people'} replied to your post
				</div>
				<div class="text-xs text-gray-500">
					{formatTime(timestamp)}
				</div>
			</div>

			<!-- Original post summary -->
			<div class="bg-gray-50 p-3 rounded-md mb-3 text-sm text-gray-700 line-clamp-2">
				{originalPost.content}
			</div>

			<!-- Author avatars -->
			<div class="flex -space-x-2 mb-3">
				{#each uniqueAuthors.slice(0, 5) as author}
					<img
						src={author.picture || '/ns-naked.svg'}
						alt={author.name || 'User'}
						class="w-8 h-8 rounded-full border-2 border-white"
					/>
				{/each}
				{#if uniqueAuthors.length > 5}
					<div
						class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium border-2 border-white"
					>
						+{uniqueAuthors.length - 5}
					</div>
				{/if}
			</div>

			<!-- Latest reply preview -->
			<div class="text-sm text-gray-600 mb-2">
				<span class="font-medium">{latestReply.name || 'User'}</span>: {latestReply.content.substring(
					0,
					100
				)}{latestReply.content.length > 100 ? '...' : ''}
			</div>

			<!-- Expandable replies section -->
			{#if expanded}
				<div class="mt-3 border-t pt-3">
					{#each replies.slice(0, 5) as reply}
						<div class="flex items-start gap-2 mb-3">
							<img
								src={reply.picture || '/ns-naked.svg'}
								alt={reply.name || 'User'}
								class="w-6 h-6 rounded-full"
							/>
							<div>
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm">{reply.name || 'User'}</span>
									<span class="text-xs text-gray-500">{formatTime(reply.created_at)}</span>
								</div>
								<p class="text-sm text-gray-700">{reply.content}</p>
							</div>
						</div>
					{/each}

					{#if replies.length > 5}
						<button class="text-xs text-blue-600 hover:underline">
							View all {replies.length} replies
						</button>
					{/if}
				</div>
			{/if}

			<!-- Toggle button -->
			<button
				class="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
				on:click={toggleExpanded}
			>
				{expanded ? 'Show less' : 'Show more'}
				<Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
			</button>
		</div>
	</div>
</div>
