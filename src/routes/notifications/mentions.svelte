<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker/';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';

	import { isKind1, isParsedEvent } from '@candypoets/nipworker/utils';
	import { readRelays, writeRelays } from 'src/controller';
	import Content from 'src/routes/explore/_post/content.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { formatTime, type ProcessedNotification } from 'src/routes/notifications/notifications';

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
					post.id() + 'mentions',
					[
						{
							kinds: [1],
							ids: [post.parsed.referencedPostId],
							limit: 5,
							relays: [...$writeRelays, ...$readRelays],
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

<div class="p-4 transition-colors">
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="bg-purple-100 p-2 rounded-full flex-shrink-0">
			<Icon icon="mdi:at" class="text-purple-600 text-lg" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with mention count -->
			<div class="flex justify-between items-center mb-2">
				<div class="font-medium">
					{post.parsed.events.length === 1
						? 'You were mentioned in a post'
						: `You were mentioned in ${post.parsed.events.length} posts`}
				</div>
				<div class="text-xs text-gray-500">
					{formatTime(post.parsed.events[0].createdAt())}
				</div>
			</div>

			<!-- Latest mention preview -->
			<div class=" bg-primary-content bg-opacity-85 p-3 rounded-md mb-3">
				<div class="flex items-start gap-2 mb-1">
					<Avatar pubkey={post.parsed.events[0].pubkey()} query={false} {context} />
					<div>
						<div class="flex items-center gap-2">
							<span class="font-medium text-sm">
								<User pubkey={post.parsed.events[0].pubkey()} link={false} {context} />
							</span>
							<span class="text-xs text-gray-500">
								{formatTime(post.parsed.events[0].createdAt())}
							</span>
						</div>
						<p class="w-post-2 overflow-hidden">
							<Content
								note={post.parsed.events?.[0]}
								{context}
								showMedia={false}
								showQuote={false}
								depth={2}
							/>
						</p>
					</div>
				</div>
			</div>

			<!-- Author avatars if multiple mentions -->
			{#if post.parsed.events.length > 1}
				<div class="flex -space-x-2 mb-3">
					{#each post.parsed.events.slice(0, 5) as event}
						<a href="/{event.pubkey}" class="relative z-0 hover:z-10">
							<Avatar pubkey={event.pubkey()} query={false} {context} />
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
			{/if}

			<!-- Expandable mentions section -->
			{#if expanded && post.parsed.events.length > 1}
				<div class="mt-3 border-t pt-3">
					{#each post.parsed.events.slice(1, 6) as event}
						<div class="flex items-start gap-2 mb-3">
							<Avatar pubkey={event.pubkey()} query={false} {context} />
							<div>
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm">
										<User pubkey={event.pubkey()} link={false} {context} />
									</span>
									<span class="text-xs text-gray-500">{formatTime(event.createdAt())}</span>
								</div>
								<!-- <p class="text-sm text-gray-700">{event.content()?.toString()}</p> -->
							</div>
						</div>
					{/each}

					{#if post.parsed.events.length > 6}
						<button class="text-xs text-blue-600 hover:underline">
							View all {post.parsed.events.length} mentions
						</button>
					{/if}
				</div>
			{/if}

			<!-- Toggle button -->
			{#if post.parsed.events.length > 1}
				<button
					class="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
					on:click={toggleExpanded}
				>
					{expanded ? 'Show less' : 'Show more mentions'}
					<Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
				</button>
			{/if}
		</div>
	</div>
</div>
