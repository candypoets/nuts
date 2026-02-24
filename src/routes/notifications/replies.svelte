<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind1, isKind1, isParsedEvent } from '@candypoets/nipworker/utils';
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

	let context: ParsedEvent[] = [];
	let originalPost: ParsedEvent | null = null;
	let expanded: boolean = false;
	let timeout: NodeJS.Timeout | undefined;

	let sub: () => void;

	function toggleExpanded() {
		expanded = !expanded;
	}

	function subscribe() {
		timeout = setTimeout(async () => {
			if (visible) {
				sub = useSubscription(
					post.id()?.fnv1aHash() + 'replies',
					[
						{
							kinds: [0],
							authors: post.parsed.events.map((event) => event.pubkey()?.toString()),
							cacheFirst: true,
							relays: []
						},
						{
							kinds: [1],
							ids: [post.parsed.referencedPostId],
							relays: [],
							cacheFirst: true
						}
					],
					(message) => {
						const parsedEvent = isParsedEvent(message);
						if (isKind1(message)) {
							originalPost = parsedEvent;
						} else if (parsedEvent) {
							context = [...context, parsedEvent];
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
			sub?.();
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
<div class="p-4 transition-colors relative">
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="bg-blue-100 p-2 rounded-full flex-shrink-0">
			<Icon icon="mdi:message-reply" class="text-blue-600 text-lg" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with reply count -->
			<div class="md:flex justify-between items-center mb-2">
				<div class="font-medium">
					{post.parsed.events.length}
					{#if originalPost && originalPost.pubkey()?.toString() !== $key?.pub}
						{post.parsed.events.length === 1 ? 'person' : 'people'} replied to a post you were mentioned
						in
					{:else}
						{post.parsed.events.length === 1 ? 'person' : 'people'} replied to your post
					{/if}
				</div>
				<div class="text-xs text-gray-500 right-4 top-1">
					{formatTime(post.parsed.events[0].createdAt())}
				</div>
			</div>
			<!-- Original post summary -->
			{#if originalPost}
				<a
					class="cursor-pointer bg-primary-content bg-opacity-85 p-3 rounded-md mb-3 text-sm line-clamp-2 w-post-1"
					on:click={() =>
						go(
							`nevent:${nip19.neventEncode({ id: originalPost?.id()?.toString(), relays: $writeRelays })}`
						)}
				>
					<!-- {originalPost.content.slice(0, 100)}... -->
					<Content note={originalPost} showMedia={false} showQuote={false} depth={1} {context} />
				</a>
			{/if}

			<!-- Author avatars -->
			<div class="flex -space-x-2 mb-3">
				{#each post.parsed.events.slice(0, 5) as event}
					<a
						href="/"
						class="relative z-0 hover:z-10"
						on:click|preventDefault={() => go(`kind0:${event.pubkey()?.toString()}`)}
					>
						<Avatar pubkey={event.pubkey()?.toString()} {context} />
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
						<User pubkey={post.parsed.events[0].pubkey()?.toString()} link={false} {context} />
					</span>: <Content
						note={post.parsed.events[0]}
						showMedia={false}
						showQuote={false}
						depth={1}
						{context}
					/>
				</div>
			{/if}

			<!-- Expandable replies section -->
			{#if expanded && post.parsed.events.length > 1}
				<div class="mt-3 border-t pt-3">
					{#each post.parsed.events.slice(1, 6) as event}
						<div class="flex items-start gap-2 mb-3">
							<Avatar pubkey={event.pubkey()?.toString()} query={false} {context} />
							<div>
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm">
										<User pubkey={event.pubkey()?.toString()} link={false} {context} />
									</span>
									<span class="text-xs">{formatTime(event.createdAt())}</span>
								</div>
								<Content
									note={post.parsed.events[0]}
									showMedia={false}
									showQuote={false}
									depth={1}
									{context}
								/>
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
