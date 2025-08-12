<script lang="ts">
	import type {
		AnyKind,
		Kind4Parsed,
		ParsedEvent,
		Request,
		SubscribeKind,
		SubscriptionOptions
	} from '@candypoets/nipworker';
	import { isKind4 } from '@candypoets/nipworker/utils';
	import { formatDistanceToNow } from 'date-fns';
	import _ from 'lodash';
	import { cubicOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';

	import Pager from 'src/components/Pager.svelte';
	import { key } from 'src/controller';
	import { kind3Ready, readRelays, writeRelays } from 'src/controller/nostr';
	import Content from 'src/routes/explore/_post/content.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import Icon from '@iconify/svelte';

	export let visible = true;

	let feedRequests: Request[] = [];
	let subs: string[] = [];

	let contacts: { [key: string]: [ParsedEvent<AnyKind>, ParsedEvent<AnyKind>[]] } = {};

	const subscriptionOptions: SubscriptionOptions = {
		pipeline: {
			pipes: [
				{ name: 'npubLimiter', params: { kind: 4, limitPerNpub: 5, maxTotalNpubs: 100 } },
				{ name: 'parse' },
				{ name: 'serializeEvents' }
			]
		}
	};

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

	kind3Ready.promise.then((kind3) => {
		feedRequests = [
			{
				kinds: [4],
				tags: { '#p': kind3.parsed?.map((c) => c.pubkey).filter((p) => p != $key?.pub) || [] },
				authors: [$key.pub],
				relays: $writeRelays,
				noContext: true
			},
			{
				kinds: [4],
				tags: { '#p': [$key.pub] },
				authors: kind3.parsed?.map((c) => c.pubkey).filter((p) => p != $key?.pub) || [],
				relays: $readRelays,
				noContext: true
			}
		];
	});

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

<Pager rootPath="/chat">
	<Feed subscriptionID={`chat`} requests={feedRequests} {updateFeed} {subscriptionOptions} backdrop>
		<svelte:fragment slot="sticky-header">
			<div class="relative pt-safe">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold">Chats</h1>
					<button class="btn btn-circle btn-sm btn-accent">
						<Icon icon="teenyicons:add-outline" class="text-xl"></Icon>
					</button>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="header">
			<div class="relative pt-safe">
				<div class="w-feed flex justify-between w-feed m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold">Chats</h1>
					<button class="btn btn-circle btn-sm btn-accent">
						<Icon icon="teenyicons:add-outline" class="text-xl"></Icon>
					</button>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="item-content" let:post let:context let:visible>
			<a
				href={'/chat/' + 'kind4:' + correspondant(post)}
				class="flex gap-2 h-28 overflow-hidden p-4 cursor-pointer w-feed"
			>
				<div class="flex-shrink-0">
					<Avatar pubkey={correspondant(post)} {context} size="xl" />
				</div>
				<div class="flex-grow border-b border-primary-content">
					<div class="flex justify-between">
						<User pubkey={correspondant(post)} link={false} {context} />
						<div class="text-xs shrink-0">
							{formatDistanceToNow(post.created_at * 1000, { addSuffix: true })}
						</div>
					</div>
					<div class="text-xs lg:text-base break-words overflow-hidden max-w-full">
						<span class="flex gap-1 max-h-6">
							{#if post.pubkey == $key?.pub}<span class="text-primary">you:</span>
							{/if}
							<Content note={post} {context} class="!w-auto flex-grow" />
						</span>
					</div>
				</div>
			</a>
		</svelte:fragment>
	</Feed>
</Pager>
