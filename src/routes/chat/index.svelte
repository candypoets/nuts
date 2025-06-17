<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatDistanceToNow } from 'date-fns';
	import _ from 'lodash';
	import { kind10002, kind3 } from 'src/controller/nostr';
	import { isKind4, type AnyKind, type Kind4Parsed } from 'src/types';
	import Kind from 'src/routes/_kinds/index.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { key } from 'src/controller';
	import type { Request, SubscribeKind } from 'src/model/nostr';
	import type { ParsedEvent } from 'src/types';
	import { cubicOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import Content from '../explore/_post/content.svelte';
	import { viewport } from 'src/controller/viewport';

	export let visible = true;

	let feedRequests: Request[] = [];
	let subs: string[] = [];

	let contacts: { [key: string]: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]] } = {};

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
				updatedFeed = [...feed, [event, _.uniqBy(context, 'id')]];
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

	function processMessages(messages: [ParsedEvent<Kind4Parsed>, ParsedEvent<AnyKind>[]][]) {
		messages.forEach((m) => {
			const dm = m[0];
			if (dm.parsed?.chatID) {
				const prev = contacts[dm.parsed?.chatID]?.[0];
				// if (dm.created_at > contacts[dm.parsed?.chatID]?.[0]?.created_at || 0) {
				if ((prev?.created_at || 0) < dm.created_at) {
					contacts[dm.parsed?.chatID] = m;
				}
			}
		});
		return Object.values(contacts);
	}

	$: {
		if ($kind3?.parsed && $kind3?.parsed.length && $key?.pub) {
			feedRequests = [
				{
					kinds: [4],
					tags: { '#p': [$key.pub] },
					authors: $kind3?.parsed.map((c) => c.pubkey).filter((p) => p != $key?.pub),
					limit: 100, // only load the last 1000 msgs received
					relays: $kind10002?.parsed?.filter((r) => r.read).map((r) => r.url) || [],
					noContext: true
				},
				{
					kinds: [4],
					tags: { '#p': $kind3?.parsed.map((c) => c.pubkey).filter((p) => p != $key?.pub) },
					authors: [$key.pub],
					limit: 100,
					relays: $kind10002?.parsed?.filter((r) => r.write).map((r) => r.url) || [],
					noContext: true
				}
			];
			// feedRequests = $kind3?.parsed
			// 	.map((c) => c.pubkey)
			// 	.filter((p) => p != $key?.pub)
			// 	.flatMap((contact) => [
			// 		{
			// 			kinds: [4],
			// 			tags: { '#p': [$key.pub] },
			// 			authors: [contact],
			// 			// since: ago(6 * MONTH),
			// 			limit: 1,
			// 			relays: $kind10002?.parsed?.filter((r) => r.read).map((r) => r.url) || [],
			// 			noOptimize: true
			// 		},
			// 		{
			// 			kinds: [4],
			// 			tags: { '#p': [contact] },
			// 			authors: [$key.pub],
			// 			relays: $kind10002?.parsed?.filter((r) => r.write).map((r) => r.url) || [],
			// 			limit: 1,
			// 			noOptimize: true
			// 		}
			// 	]);
		}
	}

	function correspondant(post: ParsedEvent<Kind4Parsed>) {
		const recipient = post.parsed?.recipient;
		return recipient == $key?.pub ? post.pubkey : (recipient as string);
	}

	$: tweenedValue = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	$: {
		if (subs && subs.length > 0) {
			tweenedValue.set(1);
		} else {
			tweenedValue.set(0);
		}
	}

	// Create a tweened store for the depth-based translation
	const depthTranslation = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	// Update the tweened value when depth changes
	$: depthTranslation.set(subs.length * 30);
</script>

<div
	style="transform: translateX({-$tweenedValue *
		($viewport.vw * 20 + $depthTranslation)}px) rotateY({$tweenedValue * -20}deg);
         transform-style: preserve-3d; perspective: 1000px;"
	on:click={() => goto('/chat')}
>
	<Feed subscriptionID={`chat`} requests={feedRequests} {updateFeed} backdrop>
		<svelte:fragment slot="sticky-header">
			<div id="top">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold">Chat</h1>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="header">
			<div class="flex unsafe-padding-top justify-between w-feed m-auto h-16 items-center">
				<h1 class="text-2xl font-semibold">Chat</h1>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="item-content" let:post let:context let:visible>
			<a
				href={'/chat/' + 'kind4:' + correspondant(post)}
				class="flex gap-2 h-28 overflow-hidden hover:bg-base-200 p-4 cursor-pointer w-feed border-b border-base-200"
			>
				<div class="flex-shrink-0">
					<Avatar pubkey={correspondant(post)} {context} size="xl" />
				</div>
				<div class="flex-grow">
					<div class="flex justify-between">
						<User pubkey={correspondant(post)} link={false} {context} />
						<div class="text-xs font-bold text-gray-700 shrink-0">
							{formatDistanceToNow(post.created_at * 1000, { addSuffix: true })}
						</div>
					</div>
					<div class="text-xs lg:text-base break-words overflow-hidden max-w-full">
						<span class="flex gap-1">
							{#if post.pubkey == $key?.pub}<span class="text-primary">you:</span>
							{/if}
							<Content note={post} {context} class="!w-auto flex-grow" />
						</span>
					</div>
				</div>
			</a>
		</svelte:fragment>
	</Feed>
</div>

<Kind rootPath="/chat" bind:subs />
