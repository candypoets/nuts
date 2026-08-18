<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind1, isKind1, isParsedEvent, fbArray } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { nip19 } from 'nostr-tools';
	import { onMount } from 'svelte';

	import { key, readRelays, writeRelays } from 'src/controller';
	import ContentBlocks from 'src/routes/explore/_post/ContentBlocks.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';
	import {
		formatTime,
		notificationRelayHints,
		notificationTargetId,
		type ProcessedNotification
	} from './notifications';

	export let post: ProcessedNotification;
	export let visible: boolean;
	const nav = usePagerNavigation();

	let context: ParsedEvent[] = [];
	let originalPost: ParsedEvent | null = null;
	let expanded: boolean = false;
	let timeout: NodeJS.Timeout | undefined;
	let activePostKey = '';
	let renderedPostKey = '';

	let sub: (() => void) | undefined;

	function openPath(eventPath: string) {
		nav ? nav.push(eventPath) : go(eventPath);
	}

	function getNotificationKey() {
		const hash = post?.id?.()?.fnv1aHash?.();
		if (typeof hash === 'string' && hash.length > 0) return hash;
		return `${post?.type || 'reply'}-${post?.parsed?.referencedPostId || post?.createdAt?.() || 'unknown'}`;
	}

	function toggleExpanded() {
		expanded = !expanded;
	}

	function openReferencedPost() {
		const referencedPostId = notificationTargetId(post);
		if (!referencedPostId) return;
		openPath(
			`nevent:${nip19.neventEncode({
				id: referencedPostId,
				relays: notificationRelayHints(post, [...$writeRelays, ...$readRelays])
			})}`
		);
	}

	function subscribe(postKey: string, referencedPostId: string, relays: string[]) {
		timeout = setTimeout(async () => {
			if (visible) {
				sub = useSubscription(
					`${postKey}-replies`,
					[
						{
							kinds: [1],
							ids: [referencedPostId],
							limit: 1,
							relays,
							cacheFirst: true
						}
					],
					(message) => {
						const parsedEvent = isParsedEvent(message);
						const kind1 = isKind1(message);
						if (kind1 && parsedEvent?.id() === referencedPostId) {
							originalPost = parsedEvent;
						} else if (parsedEvent) {
							context = [...context, parsedEvent];
						}
					},
					{ closeOnEose: true }
				);
			}
		}, 200);
	}

	function unsubscribe() {
		if (timeout) clearTimeout(timeout);
		timeout = undefined;
		sub?.();
		sub = undefined;
		activePostKey = '';
	}

	onMount(() => {
		return () => {
			unsubscribe();
		};
	});

	$: {
		const referencedPostId = post?.parsed?.referencedPostId;
		const postKey = getNotificationKey();
		const relays = notificationRelayHints(post, [...$writeRelays, ...$readRelays]);
		const subscriptionKey = `${postKey}:${relays.join('|')}`;
		const rowKey = `${postKey}:${referencedPostId || ''}`;

		if (rowKey !== renderedPostKey) {
			unsubscribe();
			context = [];
			originalPost = null;
			renderedPostKey = rowKey;
		}

		if (!visible || !referencedPostId) {
			unsubscribe();
		} else if (!originalPost && subscriptionKey !== activePostKey) {
			unsubscribe();
			activePostKey = subscriptionKey;
			subscribe(postKey, referencedPostId, relays);
		}
	}
</script>

<!-- {post.parsed.referencedPostId} -->
<div class="notification-row transition-colors relative">
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="notification-type-icon notification-type-icon--reply">
			<Icon icon="mdi:message-reply" class="text-xl" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with reply count -->
			<div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
				<div class="notification-heading">
					{post.parsed.events.length}
					{#if originalPost && originalPost.pubkey() !== $key?.pub}
						{post.parsed.events.length === 1 ? 'person' : 'people'} replied to a post you were mentioned
						in
					{:else}
						{post.parsed.events.length === 1 ? 'person' : 'people'} replied to your post
					{/if}
				</div>
				<div class="notification-time">
					{formatTime(post.parsed.events[0].createdAt())}
				</div>
			</div>
			<!-- Original post summary -->
			<button
				type="button"
				class="notification-post-preview mb-3 w-post-1 w-full cursor-pointer p-3 text-left text-sm"
				on:click={openReferencedPost}
			>
				{#if originalPost}
					<!-- {originalPost.content.slice(0, 100)}... -->
					<ContentBlocks
						content={fbArray(asKind1(originalPost), 'parsedContent') || []}
						{context}
						showMedia={false}
						showMediaUrls
						showQuote={false}
						depth={1}
					/>
				{:else}
					<span class="flex items-center justify-between gap-3">
						<span>Referenced post</span>
						<span class="whitespace-nowrap font-semibold text-primary">Open →</span>
					</span>
				{/if}
			</button>

			<!-- Author avatars -->
			<div class="flex -space-x-2 mb-3">
				{#each post.parsed.events.slice(0, 5) as event}
					<a
						href="/"
						class="relative z-0 hover:z-10"
						on:click|preventDefault={() => openPath(`nprofile:${event.pubkey()}`)}
					>
						<Avatar pubkey={event.pubkey()} {context} />
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
				<div class="notification-secondary-text text-sm mb-2">
					<span class="font-medium">
						<User pubkey={post.parsed.events[0].pubkey()} link={false} {context} />
					</span>:
					<ContentBlocks
						content={fbArray(asKind1(post.parsed.events[0]), 'parsedContent') || []}
						{context}
						showMedia={false}
						showMediaUrls
						showQuote={false}
						depth={1}
					/>
				</div>
			{/if}

			<!-- Expandable replies section -->
			{#if expanded && post.parsed.events.length > 1}
				<div class="mt-3 border-t border-base-content/10 pt-3">
					{#each post.parsed.events.slice(1, 6) as event}
						<div class="flex items-start gap-2 mb-3">
							<Avatar pubkey={event.pubkey()} query={false} {context} />
							<div>
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm">
										<User pubkey={event.pubkey()} link={false} {context} />
									</span>
									<span class="notification-time">{formatTime(event.createdAt())}</span>
								</div>
								<ContentBlocks
									content={fbArray(asKind1(post.parsed.events[0]), 'parsedContent') || []}
									{context}
									showMedia={false}
									showMediaUrls
									showQuote={false}
									depth={1}
								/>
							</div>
						</div>
					{/each}

					{#if post.parsed.events.length > 6}
						<button class="notification-toggle text-xs hover:underline">
							View all {post.parsed.events.length} replies
						</button>
					{/if}
				</div>
			{/if}

			<!-- Toggle button -->
			{#if post.parsed.events.length > 1}
				<button
					class="notification-toggle mt-2 text-xs hover:underline flex items-center gap-1"
					on:click={toggleExpanded}
				>
					{expanded ? 'Show less' : 'Show more'}
					<Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
				</button>
			{/if}
		</div>
	</div>
</div>
