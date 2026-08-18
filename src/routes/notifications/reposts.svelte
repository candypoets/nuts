<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind1, fbArray, isKind1, isParsedEvent } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { nip19 } from 'nostr-tools';
	import { onMount } from 'svelte';

	import { key, writeRelays, readRelays } from 'src/controller';
	import { kind6RepostReference } from 'src/lib/repost';
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
		return `${post?.type || 'repost'}-${post?.parsed?.referencedPostId || post?.createdAt?.() || 'unknown'}`;
	}

	function toggleExpanded() {
		expanded = !expanded;
	}

	function embeddedRepost(referencedPostId: string): ParsedEvent | null {
		for (const event of post.parsed.events) {
			const embedded = kind6RepostReference(event)?.embeddedEvent;
			if (embedded?.id() === referencedPostId) return embedded;
		}
		return null;
	}

	function referenceRelays(
		embedded: ParsedEvent | null,
		fallbackRelays: Array<string | null | undefined>
	) {
		return notificationRelayHints(post, [
			...(embedded ? (fbArray(embedded, 'relays') as string[]) : []),
			...fallbackRelays
		]);
	}

	function openReferencedPost() {
		const referencedPostId = notificationTargetId(post);
		if (!referencedPostId) return;
		openPath(
			`nevent:${nip19.neventEncode({
				id: referencedPostId,
				relays: referenceRelays(originalPost, [...$writeRelays, ...$readRelays])
			})}`
		);
	}

	function subscribe(postKey: string, referencedPostId: string, relays: string[]) {
		timeout = setTimeout(async () => {
			if (visible) {
				sub = useSubscription(
					`${postKey}-reposts`,
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
		const embedded = referencedPostId ? embeddedRepost(referencedPostId) : null;
		const fallbackRelays = [...$writeRelays, ...$readRelays];
		const relays = referenceRelays(embedded, fallbackRelays);
		const subscriptionKey = `${postKey}:${relays.join('|')}`;
		const rowKey = `${postKey}:${referencedPostId || ''}`;

		if (rowKey !== renderedPostKey) {
			unsubscribe();
			context = [];
			originalPost = embedded;
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

<div class="notification-row transition-colors">
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="notification-type-icon notification-type-icon--repost">
			<Icon icon="mdi:repeat" class="text-xl" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with repost count -->
			<div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
				<div class="notification-heading">
					{post.parsed.events.length}
					{#if originalPost && originalPost.pubkey() !== $key?.pub}
						{post.parsed.events.length === 1 ? 'person' : 'people'} reposted a post you were mentioned
						in
					{:else}
						{post.parsed.events.length === 1 ? 'person' : 'people'} reposted your post
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
					<ContentBlocks
						content={fbArray(asKind1(originalPost), 'parsedContent') || []}
						{context}
						showMedia={false}
						showQuote={false}
						depth={2}
					/>
				{:else}
					<span class="flex items-center justify-between gap-3">
						<span>Referenced post</span>
						<span class="whitespace-nowrap font-semibold text-primary">Open →</span>
					</span>
				{/if}
			</button>

			<!-- Author avatars and names -->
			<div class="inline-flex space-x-2 items-start notification-secondary-text">
				<!-- Author avatars -->
				<div class="inline-flex -space-x-2 mb-3">
					{#each post.parsed.events.slice(0, 5) as event}
						<span class="relative z-0 hover:z-10">
							<Avatar pubkey={event.pubkey()} {context} link />
						</span>
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
									<span class="font-medium">
										<User pubkey={event.pubkey()} link {context} />
									</span>
									{#if i < post.parsed.events.length - 2}
										,
									{:else if i < post.parsed.events.length - 1}
										{i === 0 ? ' and ' : ', and '}
									{/if}
								{/each}
								{post.parsed.events.length === 1 ? 'reposted' : 'reposted'} this post
							</span>
						{:else}
							<a
								href="/"
								class="font-medium"
								on:click|preventDefault={() =>
									openPath(`nprofile:${post.parsed.events[0].pubkey()}`)}
							>
								<User pubkey={post.parsed.events[0].pubkey()} link={false} {context} />
							</a>,
							<a
								href="/"
								class="font-medium"
								on:click|preventDefault={() =>
									openPath(`nprofile:${post.parsed.events[1].pubkey()}`)}
							>
								<User pubkey={post.parsed.events[1].pubkey()} link={false} {context} />
							</a>
							and <span class="font-medium">{post.parsed.events.length - 2} others</span> reposted this
							post
						{/if}
					</div>
				{/if}
			</div>

			<!-- Expandable reposts section -->
			{#if expanded}
				<div class="mt-3 border-t border-base-content/10 pt-3">
					{#each post.parsed.events.slice(0, 10) as event}
						<div class="flex items-center gap-2 mb-2">
							<Avatar pubkey={event.pubkey()} {context} />
							<div class="flex items-center gap-2">
								<span class="font-medium text-sm">
									<User pubkey={event.pubkey()} link={false} {context} />
								</span>
								<span class="notification-time">{formatTime(event.createdAt())}</span>
							</div>
						</div>
					{/each}

					{#if post.parsed.events.length > 10}
						<button class="notification-toggle text-xs hover:underline">
							View all {post.parsed.events.length} reposts
						</button>
					{/if}
				</div>
			{/if}

			<!-- Toggle button -->
			{#if post.parsed.events.length > 3}
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
