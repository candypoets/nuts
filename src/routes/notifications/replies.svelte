<script lang="ts">
	import type { AnyKind, ParsedEvent } from '@candypoets/nipworker';
	import { nostrManager } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { isKind1 } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { nip19 } from 'nostr-tools';
	import { onMount } from 'svelte';

	import { key, writeRelays } from 'src/controller';
	import Content from 'src/routes/explore/_post/content.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { go } from 'src/routes/modals/modal';
	import { formatTime, type ProcessedNotification } from './notifications';

	export let post: ProcessedNotification;
	export let visible: boolean;

	let context: ParsedEvent<AnyKind>[] = [];
	let originalPost: ParsedEvent<AnyKind> | null = null;
	let expanded: boolean = false;
	let timeout: NodeJS.Timeout | undefined;

	function toggleExpanded() {
		expanded = !expanded;
	}

	function subscribe() {
		timeout = setTimeout(async () => {
			if (visible) {
				useSubscription(
					post.id + 'replies',
					[
						{
							kinds: [0],
							authors: post.parsed.events.map((event) => event.pubkey),
							cacheFirst: true,
							relays: []
						},
						{
							kinds: [1],
							ids: [post.parsed.referencedPostId],
							relays: [],
							cacheFirst: true
						},
						...(post.requests || [])
					],
					(events, eventType) => {
						if (isKind1(events[0])) {
							originalPost = events[0];
						} else if (events[0]?.parsed) {
							context = [...context, ...events];
						}
					}
				);
			}
		}, 200);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			nostrManager.unsubscribe(post.id + 'replies');
		}
	}

	onMount(() => {
		return () => {
			unsubscribe();
		};
	});

	$: visible ? subscribe() : unsubscribe();
</script>

<!-- {post.parsed.referencedPostId} -->
<div class=" border-b border-gray-100 p-4 mb-4 transition-colors">
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="bg-blue-100 p-2 rounded-full flex-shrink-0">
			<Icon icon="mdi:message-reply" class="text-blue-600 text-lg" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with reply count -->
			<div class="flex justify-between items-center mb-2">
				<div class="font-medium">
					{post.parsed.events.length}
					{#if originalPost && originalPost.pubkey !== $key?.pub}
						{post.parsed.events.length === 1 ? 'person' : 'people'} replied to a post you were mentioned
						in
					{:else}
						{post.parsed.events.length === 1 ? 'person' : 'people'} replied to your post
					{/if}
				</div>
				<div class="text-xs text-gray-500">
					{formatTime(post.parsed.events[0].created_at)}
				</div>
			</div>
			<!-- Original post summary -->
			{#if originalPost}
				<a
					class="cursor-pointer bg-base-content p-3 rounded-md mb-3 text-sm text-primary-content line-clamp-2 w-post-1"
					on:click={() =>
						go(`nevent:${nip19.neventEncode({ id: originalPost.id, relays: $writeRelays })}`)}
				>
					<!-- {originalPost.content.slice(0, 100)}... -->
					<Content note={originalPost} showMedia={false} showQuote={false} depth={1} {context} />
				</a>
			{/if}

			<!-- Author avatars -->
			<div class="flex -space-x-2 mb-3">
				{#each post.parsed.events.slice(0, 5) as event}
					<a href="/{event.pubkey}" class="relative z-0 hover:z-10">
						<Avatar pubkey={event.pubkey} {context} />
					</a>
				{/each}
				{#if post.parsed.events.length > 5}
					<div
						class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium border-2 border-white"
					>
						+{post.parsed.events.length - 5}
					</div>
				{/if}
			</div>

			<!-- Latest reply preview -->
			{#if post.parsed.events.length > 0}
				<div class="text-sm mb-2">
					<span class="font-medium">
						<User pubkey={post.parsed.events[0].pubkey} link={false} {context} />
					</span>: {post.parsed.events[0].content.substring(0, 100)}
					{post.parsed.events[0].content.length > 100 ? '...' : ''}
				</div>
			{/if}

			<!-- Expandable replies section -->
			{#if expanded && post.parsed.events.length > 1}
				<div class="mt-3 border-t pt-3">
					{#each post.parsed.events.slice(1, 6) as event}
						<div class="flex items-start gap-2 mb-3">
							<Avatar pubkey={event.pubkey} query={false} {context} />
							<div>
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm">
										<User pubkey={event.pubkey} link={false} {context} />
									</span>
									<span class="text-xs">{formatTime(event.created_at)}</span>
								</div>
								<p class="text-sm">{event.content}</p>
							</div>
						</div>
					{/each}

					{#if post.parsed.events.length > 6}
						<button class="text-xs hover:underline">
							View all {post.parsed.events.length} replies
						</button>
					{/if}
				</div>
			{/if}

			<!-- Toggle button -->
			{#if post.parsed.events.length > 1}
				<button
					class="mt-2 text-xs hover:underline flex items-center gap-1"
					on:click={toggleExpanded}
				>
					{expanded ? 'Show less' : 'Show more'}
					<Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
				</button>
			{/if}
		</div>
	</div>
</div>
