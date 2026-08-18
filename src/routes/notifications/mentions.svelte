<script lang="ts">
	import type { ParsedEvent } from '@candypoets/nipworker/';
	import Icon from '@iconify/svelte';
	import { nip19 } from 'nostr-tools';

	import { fbArray, asKind1 } from '@candypoets/nipworker/utils';
	import { readRelays, writeRelays } from 'src/controller';
	import ContentBlocks from 'src/routes/explore/_post/ContentBlocks.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { go, usePagerNavigation } from 'src/routes/modals/modal';
	import {
		formatTime,
		notificationRelayHints,
		notificationTargetId,
		type ProcessedNotification
	} from 'src/routes/notifications/notifications';

	export let post: ProcessedNotification;
	export let visible: boolean;
	const nav = usePagerNavigation();

	let context: ParsedEvent[] = [];
	let expanded: boolean = false;

	function toggleExpanded() {
		expanded = !expanded;
	}

	function openMention() {
		const eventId = notificationTargetId(post);
		if (!eventId) return;
		const eventPath = `nevent:${nip19.neventEncode({
			id: eventId,
			relays: notificationRelayHints(post, [...$writeRelays, ...$readRelays])
		})}`;
		nav ? nav.push(eventPath) : go(eventPath);
	}

	$: context = post.parsed.context;
	$: if (!visible) expanded = false;
</script>

<div class="notification-row transition-colors">
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="notification-type-icon notification-type-icon--mention">
			<Icon icon="mdi:at" class="text-xl" />
		</div>

		<!-- Content -->
		<div class="flex-grow">
			<!-- Header with mention count -->
			<div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
				<div class="notification-heading">
					{post.parsed.events.length === 1
						? 'You were mentioned in a post'
						: `You were mentioned in ${post.parsed.events.length} posts`}
				</div>
				<div class="notification-time">
					{formatTime(post.parsed.events[0].createdAt())}
				</div>
			</div>

			<!-- Latest mention preview -->
			<button
				type="button"
				class="notification-post-preview mb-3 w-full p-3 text-left"
				on:click={openMention}
			>
				<div class="flex items-start gap-2 mb-1">
					<Avatar pubkey={post.parsed.events[0].pubkey()} query={false} {context} />
					<div>
						<div class="flex items-center gap-2">
							<span class="font-medium text-sm">
								<User pubkey={post.parsed.events[0].pubkey()} link={false} {context} />
							</span>
							<span class="notification-time">
								{formatTime(post.parsed.events[0].createdAt())}
							</span>
						</div>
						<p class="w-post-2 overflow-hidden">
							<ContentBlocks
								content={fbArray(asKind1(post.parsed.events[0]), 'parsedContent') || []}
								{context}
								showMedia={false}
								showQuote={false}
								depth={2}
							/>
						</p>
					</div>
				</div>
			</button>

			<!-- Author avatars if multiple mentions -->
			{#if post.parsed.events.length > 1}
				<div class="flex -space-x-2 mb-3">
					{#each post.parsed.events.slice(0, 5) as event}
						<a href="/{event.pubkey()}" class="relative z-0 hover:z-10">
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
								<!-- <p class="text-sm text-gray-700">{event.content()?.toString()}</p> -->
							</div>
						</div>
					{/each}

					{#if post.parsed.events.length > 6}
						<button class="notification-toggle text-xs hover:underline">
							View all {post.parsed.events.length} mentions
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
					{expanded ? 'Show less' : 'Show more mentions'}
					<Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
				</button>
			{/if}
		</div>
	</div>
</div>
