<script lang="ts">
	import {
		MessageType,
		NpubLimiterPipeConfigT,
		ParsePipeConfigT,
		PipeConfig,
		PipeT,
		SaveToDbPipeConfigT,
		SerializeEventsPipeConfigT,
		type ConnectionStatus,
		type Kind4Parsed,
		type ParsedEvent,
		type RequestObject,
		type SubscriptionConfig,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { asKind4, asParsedEvent, isKind4 } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { orderBy, uniq, uniqBy } from 'lodash';
	import { cubicOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';

	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { key } from 'src/controller';
	import { readRelays, writeRelays } from 'src/controller/nostr';
	import Content from 'src/routes/explore/_post/content.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { go } from 'src/routes/modals/modal';
	import Empty from './empty.svelte';

	export let visible = true;

	let feedRequests: RequestObject[] = [];
	let feed: ParsedEvent[] = [];
	let subs: string[] = [];
	let eoce = false;

	let contacts: { [key: string]: ParsedEvent } = {};

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	const subscriptionOptions: SubscriptionConfig = {
		pipeline: [
			new PipeT(PipeConfig.NpubLimiterPipeConfig, new NpubLimiterPipeConfigT(4, 5, 100)),
			new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
			new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
			new PipeT(
				PipeConfig.SerializeEventsPipeConfig,
				new SerializeEventsPipeConfigT(new TextEncoder().encode('chat'))
			)
		]
	};

	function updateFeed(feed: ParsedEvent[], message: WorkerMessage): ParsedEvent[] {
		let updatedFeed = feed;
		switch (message.type()) {
			case MessageType.Eoce:
				eoce = true;
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message) as ParsedEvent;
				if (!isKind4(message)) return feed;
				if (!eoce) {
					updatedFeed.push(parsedEvent);
				} else {
					updatedFeed.unshift(parsedEvent);
				}
				break;
		}

		const processedFeed = processEvents(updatedFeed);
		// console.log(
		// 	feed.map((f) => f.id()?.fnv1aHash()),
		// 	processedFeed.map((f) => f.id()?.fnv1aHash())
		// );
		// Process the updated feed into grouped notifications
		return processedFeed;
	}

	function processEvents(events: ParsedEvent[]) {
		events.forEach((dm) => {
			const kind4 = asKind4(dm) as Kind4Parsed;
			if (kind4.chatId()) {
				const prev = contacts[kind4.chatId()!.fnv1aHash()];
				// if (dm.created_at > contacts[dm.parsed?.chatID]?.[0]?.created_at || 0) {
				if ((prev?.createdAt() || 0) < dm.createdAt()) {
					contacts[kind4.chatId()!.fnv1aHash()] = dm;
				}
			}
		});
		return orderBy(Object.values(contacts), [(contact) => contact.createdAt()], ['desc']);
	}

	$: visible && setFeedRequests();

	function setFeedRequests() {
		feedRequests = [
			{
				kinds: [4],
				// tags: { '#p': contactPubs },
				authors: [$key.pub],
				relays: [...$readRelays, ...$writeRelays],
				noContext: true
			},
			{
				kinds: [4],
				tags: { '#p': [$key.pub] },
				// authors: contactPubs,
				relays: [...$readRelays, ...$writeRelays],
				noContext: true
			}
		];
	}

	function correspondant(post: ParsedEvent) {
		const kind4 = asKind4(post) as Kind4Parsed;
		const recipient = kind4.recipient()?.toString() || '';
		return recipient == $key?.pub ? post.pubkey()!.toString() : (recipient as string);
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

	$: feed = uniqBy(feed, (message) => asKind4(message)?.chatId()?.fnv1aHash());
</script>

<Pager rootPath="/chat">
	<Feed
		subscriptionID={`chat`}
		requests={feedRequests}
		{updateFeed}
		{subscriptionOptions}
		backdrop={!feed.length}
		bind:connectionStatus
		bind:feed
	>
		<svelte:fragment slot="sticky-header">
			<div class="relative pt-safe bg-base-300 bg-opacity-50 backdrop-blur-xl">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold">BM</h1>
					<button class="btn btn-circle btn-sm btn-primary">
						<Icon icon="teenyicons:add-outline" class="text-xl"></Icon>
					</button>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="header">
			<div
				class="w-feed relative pt-safe bg-base-300 bg-opacity-85 backdrop-blur-md rounded-lg pb-2 px-1 shadow-widget-down"
			>
				<div class="flex justify-between m-auto h-16 items-center px-1">
					<h1 class="text-2xl font-semibold">
						BM<button
							class="btn btn-circle btn-ghost btn-xs ml-2"
							onclick="document.getElementById('blurred_chat_info').showModal()"
						>
							<Icon icon="material-symbols:info-outline" class="text-lg"></Icon>
						</button>
						<dialog id="blurred_chat_info" class="modal">
							<div class="modal-box bg-base-300 bg-opacity-85">
								<h3 class="font-bold text-xl">What is Blurred Chat?</h3>
								<p class="py-4 text-base">
									Blurred Chat is like speaking a secret language with your conversation partner.
									While others can see who you're talking to and how long your conversations are,
									they can't understand a single word of what you're saying. Your messages are
									end-to-end encrypted on the Nostr protocol.
								</p>
								<div class="modal-action">
									<form method="dialog">
										<button class="btn">Close</button>
									</form>
								</div>
							</div>
							<form method="dialog" class="modal-backdrop">
								<button>close</button>
							</form>
						</dialog>
					</h1>
					<button
						class="btn btn-circle btn-sm btn-primary btn-outline"
						on:click|stopPropagation={() => go('newchat')}
					>
						<Icon icon="material-symbols:chat-add-on-outline-rounded" class="text-xl" />
						<!-- <Icon icon="teenyicons:add-outline" class="text-xl"></Icon> -->
					</button>
				</div>
				<RelaysList relays={uniq([...$writeRelays, ...$readRelays])} {connectionStatus} />
			</div>
		</svelte:fragment>
		<svelte:fragment slot="empty-content">
			<br />
			<Empty />
		</svelte:fragment>
		<svelte:fragment slot="item-content" let:post let:visible>
			{@const k4 = asKind4(post)}
			<a
				href={'/chat/' + 'kind4:' + correspondant(post)}
				class="flex gap-2 h-24 overflow-hidden pt-4 pr-4 pl-1 cursor-pointer bg-base-300 bg-opacity-85 backdrop-blur-md rounded-lg mt-1 shadow-widget"
			>
				<div class="flex-shrink-0">
					<Avatar pubkey={correspondant(post)} size="xl" />
				</div>
				<div class="flex-grow">
					<div class="flex justify-between">
						<User pubkey={correspondant(post)} link={false} />
						<div class="text-xs shrink-0">
							{formatDistanceToNow(post.createdAt() * 1000, { addSuffix: true })}
						</div>
					</div>
					<div class="text-base break-words overflow-hidden max-w-full">
						<span class="flex gap-1 max-h-6">
							{#if post.pubkey == $key?.pub}<span class="text-primary">you:</span>
							{/if}
							<Content note={post} class="!w-auto flex-grow" />
						</span>
					</div>
				</div>
			</a>
		</svelte:fragment>
	</Feed>
</Pager>
