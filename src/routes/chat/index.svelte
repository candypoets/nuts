<script lang="ts">
	import {
		Kind3Parsed,
		MessageType,
		type ConnectionStatus,
		type Kind4Parsed,
		type ParsedEvent,
		type RequestObject,
		type SubscriptionOptions,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { asKind3, asKind4, asParsedEvent, fbArray, isKind4 } from '@candypoets/nipworker/utils';
	import { formatDistanceToNow } from 'date-fns';
	import _, { orderBy, uniqBy } from 'lodash';
	import { cubicOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';

	import Icon from '@iconify/svelte';
	import Pager from 'src/components/Pager.svelte';
	import RelaysList from 'src/components/RelaysList.svelte';
	import { key } from 'src/controller';
	import { chatManager } from 'src/controller/managers';
	import { kind3Ready, readRelays, writeRelays } from 'src/controller/nostr';
	import Content from 'src/routes/explore/_post/content.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';

	export let visible = true;

	let feedRequests: RequestObject[] = [];
	let subs: string[] = [];
	let eoce = false;

	let contacts: { [key: string]: ParsedEvent } = {};

	let connectionStatus: { [url: string]: ConnectionStatus } = {};

	const subscriptionOptions: SubscriptionOptions = {
		pipeline: {
			pipes: [
				{ name: 'npubLimiter', params: { kind: 4, limitPerNpub: 5, maxTotalNpubs: 100 } },
				{ name: 'parse' },
				{ name: 'saveToDb' },
				{ name: 'serializeEvents' }
			]
		}
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
		return orderBy(
			uniqBy(Object.values(contacts), (c) => c?.id()?.fnv1aHash()),
			[(contact) => contact.createdAt()],
			['desc']
		);
	}

	kind3Ready.promise.then((kind3) => {
		const k3 = asKind3(kind3) as Kind3Parsed;
		const contactPubs = (fbArray(k3, 'contacts')
			.map((c) => c.pubkey()?.toString())
			.filter((p) => p != $key?.pub) || []) as string[];
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
	});

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
</script>

<Pager rootPath="/chat">
	<Feed
		subscriptionID={`chat`}
		requests={feedRequests}
		manager={chatManager}
		{updateFeed}
		{subscriptionOptions}
		backdrop
		bind:connectionStatus
	>
		<svelte:fragment slot="sticky-header">
			<div class="relative pt-safe bg-base-300 bg-opacity-50 backdrop-blur-xl">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold">Blurred Chat</h1>
					<button class="btn btn-circle btn-sm btn-primary">
						<Icon icon="teenyicons:add-outline" class="text-xl"></Icon>
					</button>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="header">
			<div class="relative pt-safe">
				<div class="w-feed flex justify-between w-feed m-auto h-16 items-center">
					<h1 class="text-2xl font-semibold">
						Blurred Chat<button
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
					<button class="btn btn-circle btn-sm btn-primary">
						<Icon icon="teenyicons:add-outline" class="text-xl"></Icon>
					</button>
				</div>
				<RelaysList relays={_.uniq([...$writeRelays, ...$readRelays])} {connectionStatus} />
			</div>
		</svelte:fragment>
		<svelte:fragment slot="item-content" let:post let:visible>
			<a
				href={'/chat/' + 'kind4:' + correspondant(post)}
				class="flex gap-2 h-24 overflow-hidden pt-4 pr-2 cursor-pointer w-feed"
			>
				<div class="flex-shrink-0">
					<Avatar pubkey={correspondant(post)} size="xl" />
				</div>
				<div class="flex-grow border-b border-primary-content">
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
