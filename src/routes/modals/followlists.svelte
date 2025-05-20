<script lang="ts">
	import Feed from 'src/routes/explore/feed.svelte';
	import type { ParsedEvent } from 'src/types';
	import { isKind30000, type Kind30000Parsed } from 'src/types/kind30000';
	import Avatar from '../explore/avatar.svelte';

	let feed: [ParsedEvent<Kind30000Parsed>, ParsedEvent<unknown>[]][] = [];
	let subscriptionID = 'follow-lists';

	// Function to construct the requests for kind 30000 events
	function getRequests() {
		return [
			{
				kinds: [30000],
				limit: 50
			}
		];
	}

	// Update feed function for kind 30000 events
	function updateFeed(
		currentFeed: [ParsedEvent<Kind30000Parsed>, ParsedEvent<unknown>[]][],
		newEvents: ParsedEvent<unknown>[],
		eventKind: 'EVENT' | 'EOSE' | 'EOCE'
	) {
		const [event] = newEvents;
		if (!event?.parsed || !isKind30000(event)) return currentFeed;

		// Ensure list has required fields
		if (!event.parsed.list_identifier || !event.parsed.metadata?.title) return currentFeed;

		// Add new event to feed if not already present
		if (!currentFeed.some((item) => item[0].id === event.id)) {
			return [...currentFeed, [event, []]];
		}

		return currentFeed;
	}
</script>

<Feed {subscriptionID} requests={getRequests()} {updateFeed} let:post let:context let:visible>
	<div
		slot="item-content"
		class="bg-base-200 rounded-xl p-4 mb-4 hover:bg-base-300 transition-colors"
	>
		{#if post.parsed}
			<div class="flex items-center gap-4 mb-4">
				{#if post.parsed.metadata.image}
					<img
						src={post.parsed.metadata.image}
						alt={post.parsed.metadata.title}
						class="w-16 h-16 rounded-full object-cover"
					/>
				{:else}
					<div class="w-16 h-16 rounded-full bg-base-300 flex items-center justify-center">
						<span class="text-2xl">📝</span>
					</div>
				{/if}
				<div>
					<h3 class="text-xl font-bold">{post.parsed.metadata.title}</h3>
					{#if post.parsed.metadata.description}
						<p class="text-base-content/70">{post.parsed.metadata.description}</p>
					{/if}
				</div>
			</div>

			{#if post.parsed.people && post.parsed.people.length > 0}
				<div class="mt-4">
					<h4 class="text-sm font-semibold mb-2">Members ({post.parsed.people.length})</h4>
					<div class="flex flex-wrap gap-2">
						{#each post.parsed.people.slice(0, 10) as pubkey}
							<Avatar {pubkey} />
						{/each}
						{#if post.parsed.people.length > 10}
							<div
								class="flex items-center justify-center w-10 h-10 rounded-full bg-base-300 text-sm font-medium"
							>
								+{post.parsed.people.length - 10}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<div class="mt-4 text-sm text-base-content/50">
				List ID: {post.parsed.list_identifier}
			</div>
		{/if}
	</div>
</Feed>

<style>
	:global(.w-feed) {
		width: 100%;
		max-width: 42rem;
	}
</style>
