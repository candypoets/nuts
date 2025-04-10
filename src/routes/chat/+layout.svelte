<script lang="ts">
	import _ from 'lodash';
	import type { NostrEvent } from 'nostr-tools';
	import { isKind1, isKind4, type AnyKind, type Kind3Parsed, type Kind4Parsed } from 'src/parsers';
	import { key } from 'src/stores/db';
	import type { SubscribeKind } from 'src/wasm/manager';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import { getContext, onMount } from 'svelte';
	import { spring } from 'svelte/motion';
	import type { Writable } from 'svelte/store';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { formatDistanceToNow } from 'date-fns';

	let profileOpen: boolean = false;
	let feedRequests: any[] = [];

	let messages: NostrEvent[] = [];

	const translateX = spring(0);

	let followList: Writable<Kind3Parsed> = getContext('followList');

	function updateFeed(
		feed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][],
		events: ParsedEvent<AnyKind>[],
		eventKind: SubscribeKind
	): [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][] {
		const [event, ...context] = events;
		if (!event || !event.parsed || !isKind4(event)) return feed;
		// Add new events to our feed for processing
		let updatedFeed: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][];

		if (eventKind === 'CACHED_EVENT') {
			// For cached events, just add them to the feed
			updatedFeed = [...feed, [event, _.uniqBy(context, 'id')]];
		} else if (eventKind === 'FETCHED_EVENT') {
			// For fetched events, add them in timestamp order
			if (feed.length === 0 || event.created_at >= feed[0][0].created_at) {
				updatedFeed = [[event, _.uniqBy(context, 'id')], ...feed];
			} else {
				// Add and sort by timestamp
				updatedFeed = [...feed, [event, _.uniqBy(context, 'id')]].sort(
					(a, b) => b[0].created_at - a[0].created_at
				);
			}
		} else {
			return feed;
		}
		const processedFeed = processMessages(updatedFeed);

		// Process the updated feed into grouped notifications
		return processedFeed;
	}

	function processMessages(messages: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]][]) {
		let contacts: { [key: string]: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]] } = {};
		messages.forEach((m) => {
			const dm = m[0];
			const sender = dm.tags.find((tag) => tag[0] === 'p')?.[1];
			if (dm.pubkey == $key?.pub && sender == $key?.pub) return;
			const chat = dm.pubkey == $key?.pub ? sender : dm.pubkey;
			if (chat && !contacts[chat]) {
				contacts[chat] = m;
			}
		});
		return Object.values(contacts);
	}

	$: {
		if ($followList && $followList.length && $key?.pub) {
			feedRequests = $followList.flatMap((c) => [
				{
					kinds: [4],
					tags: { '#p': [$key.pub] },
					authors: [c.pubkey],
					limit: 20,
					noOptimize: true
				},
				{
					kinds: [4],
					tags: { '#p': [c.pubkey] },
					authors: [$key.pub],
					limit: 20,
					noOptimize: true
				}
			]);
		}
	}

	function correspondant(post: ParsedEvent<Kind4Parsed>) {
		const recipient = post.parsed?.recipient;
		return recipient == $key.pub ? post.pubkey : (recipient as string);
	}
</script>

<Feed subscriptionID={`chat`} requests={feedRequests} {updateFeed} headerItem={{ id: 'header' }}>
	<svelte:fragment slot="sticky-header">
		<div id="top">
			<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
				<h1 class="text-2xl font-semibold">Chat</h1>
			</div>
		</div>
	</svelte:fragment>
	<svelte:fragment slot="header-content">
		<div id="top">
			<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
				<h1 class="text-2xl font-semibold">Chat</h1>
			</div>
		</div>
	</svelte:fragment>
	<svelte:fragment slot="item-content" let:post let:context let:visible>
		<a
			href={'/chat/' + post.pubkey}
			class="flex gap-2 h-28 overflow-hidden hover:bg-base-200 p-4 cursor-pointer w-feed"
		>
			<div class="flex-shrink-0">
				<Avatar pubkey={correspondant(post)} {context} size="xl" />
			</div>
			<div class="max-w-full">
				<div class="flex justify-between">
					<User pubkey={correspondant(post)} link={false} {context} />
					<div class="text-xs font-bold text-gray-700 shrink-0">
						{formatDistanceToNow(post.created_at * 1000, { addSuffix: true })}
					</div>
				</div>
				<div class="text-xs lg:text-base break-words overflow-hidden max-w-full">
					<span>
						{#if post.pubkey == $key?.pub}<span class="text-primary">you:</span>
						{/if}
						{post.parsed?.decryptedContent}
					</span>
				</div>
			</div>
		</a>
	</svelte:fragment>
</Feed>

<slot />

<!-- <ProfileModal bind:open={profileOpen} /> -->

<style>
	.max-w-full {
		width: calc(100% - 3rem);
	}
	@media (min-width: 1024px) {
		.lg\:m-25 {
			margin-left: 25% !important;
		}
		.lg\:m-50 {
			margin-left: 37.5%;
		}
	}
</style>
