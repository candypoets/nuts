<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import Icon from '@iconify/svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import type { ProcessedNotification } from './notifications';
	import { onMount } from 'svelte';
	import { nostrManager } from 'src/model/nostr';
	import { isKind1, type AnyKind } from 'src/types';
	import type { ParsedEvent } from 'src/types';
	import User from '../explore/user.svelte';
	import Content from '../explore/_post/content.svelte';
	import { key, readRelays, writeRelays } from 'src/controller';
	import { go } from '../modals/modal';

	export let post: ProcessedNotification;
	export let visible: boolean;

	let context: ParsedEvent<AnyKind>[] = [];
	let originalPost: ParsedEvent<AnyKind> | null = null;
	let expanded: boolean = false;
	let timeout: NodeJS.Timeout | undefined;

	function toggleExpanded() {
		expanded = !expanded;
	}

	function formatTime(timestamp: number): string {
		return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
	}

	function subscribe() {
		timeout = setTimeout(async () => {
			if (visible) {
				nostrManager.subscribe(
					post.id + 'reactions',
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
							relays: [...$writeRelays, ...$readRelays],
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
			nostrManager.unsubscribe(post.id + 'reactions');
		}
	}

	onMount(() => {
		return () => {
			unsubscribe();
		};
	});

	$: visible ? subscribe() : unsubscribe();

	$: console.log('post context', post?.parsed);
</script>

<div class="border-b border-gray-100 p-4 mb-2 transition-colors">
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="bg-red-100 p-2 rounded-full flex-shrink-0">
			<Icon icon="mdi:heart" class="text-red-600 text-lg" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with like count -->
			<div class="flex justify-between items-center mb-2">
				<div class="font-medium">
					{post.parsed.events.length}
					{#if originalPost && originalPost.pubkey !== $key?.pub}
						{post.parsed.events.length === 1 ? 'person' : 'people'} liked a post you were mentioned in
					{:else}
						{post.parsed.events.length === 1 ? 'person' : 'people'} liked your post
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
					on:click={() => go(`nevent:${originalPost.id}`)}
				>
					<Content note={originalPost} showMedia={false} showQuote={false} depth={2} {context} />
				</a>
			{/if}
			<div class="inline-flex space-x-2 items-start">
				<!-- Author avatars -->
				<div class="inline-flex -space-x-2 mb-3">
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

				{#if post.parsed.events.length > 0 && !expanded}
					<div class="text-sm">
						{#if post.parsed.events.length <= 3}
							<span>
								{#each post.parsed.events as event, i}
									<a href="/{event.pubkey}" class="font-medium">
										<User pubkey={event.pubkey} link {context} />
									</a>
									{#if i < post.parsed.events.length - 2}
										,
									{:else if i < post.parsed.events.length - 1}
										{i === 0 ? ' and ' : ', and '}
									{/if}
								{/each}
								{post.parsed.events.length === 1 ? 'liked' : 'liked'} this post
							</span>
						{:else}
							<a href="/{post.parsed.events[0].pubkey}" class="font-medium">
								<User pubkey={post.parsed.events[0].pubkey} link={false} {context} />
							</a>,
							<a href="/{post.parsed.events[1].pubkey}" class="font-medium">
								<User pubkey={post.parsed.events[1].pubkey} link={false} {context} />
							</a>
							and <span class="font-medium">{post.parsed.events.length - 2} others</span> liked this
							post
						{/if}
					</div>
				{/if}
			</div>

			<!-- People who liked preview -->

			<!-- Expandable likes section -->
			{#if expanded}
				<div class="mt-3 border-t pt-3">
					{#each post.parsed.events.slice(0, 10) as event}
						<div class="flex items-center gap-2 mb-2">
							<Avatar pubkey={event.pubkey} {context} />
							<div class="flex items-center gap-2">
								<span class="font-medium text-sm">
									<User pubkey={event.pubkey} link={false} {context} />
								</span>
								<span class="text-xs text-gray-500">{formatTime(event.created_at)}</span>
							</div>
						</div>
					{/each}

					{#if post.parsed.events.length > 10}
						<button class="text-xs hover:underline">
							View all {post.parsed.events.length} likes
						</button>
					{/if}
				</div>
			{/if}

			<!-- Toggle button -->
			{#if post.parsed.events.length > 3}
				<button
					class="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
					on:click={toggleExpanded}
				>
					{expanded ? 'Show less' : 'Show more'}
					<Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
				</button>
			{/if}
		</div>
	</div>
</div>
