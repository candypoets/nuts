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
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import { asKind4, asParsedEvent, ConnectionTracker, isKind4 } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { orderBy, uniq } from 'lodash';
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
	import { normalizeURL } from 'nostr-tools/utils';

	export let visible = true;

	// Feed items managed by parent - grouped by chatId
	let chatItems: ParsedEvent[] = [];
	let rawEvents: ParsedEvent[] = [];
	let loading = false;
	let refreshing = false;

	let contacts: { [key: string]: ParsedEvent } = {};

	let connectionStatus: { [url: string]: ConnectionStatus } = {};
	let connectionTracker: ConnectionTracker | undefined;

	// Viewport state from Feed
	let start = 0;
	let end = 0;

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

	// Build subscription requests
	function buildRequests(): RequestObject[] {
		if (!$key?.pub) return [];

		return [
			{
				kinds: [4],
				authors: [$key.pub],
				relays: [...$readRelays, ...$writeRelays],
				noCache: true
			},
			{
				kinds: [4],
				authors: [$key.pub],
				relays: [...$readRelays, ...$writeRelays]
			},
			{
				kinds: [4],
				tags: { '#p': [$key.pub] },
				relays: [...$readRelays, ...$writeRelays],
				noCache: true
			},
			{
				kinds: [4],
				tags: { '#p': [$key.pub] },
				relays: [...$readRelays, ...$writeRelays]
			}
		];
	}

	// Process raw events into grouped conversations by chatId
	function processEvents(events: ParsedEvent[]): ParsedEvent[] {
		const contactsMap: { [key: string]: ParsedEvent } = {};
		events.forEach((dm) => {
			const kind4 = asKind4(dm) as Kind4Parsed;
			if (kind4.chatId()) {
				const prev = contactsMap[kind4.chatId()!.fnv1aHash()];
				if ((prev?.createdAt() || 0) < dm.createdAt()) {
					contactsMap[kind4.chatId()!.fnv1aHash()] = dm;
				}
			}
		});
		return orderBy(Object.values(contactsMap), [(contact) => contact.createdAt()], ['desc']);
	}

	// Reactive: process raw events into chat items
	$: chatItems = processEvents(rawEvents);

	let subs: string[] = [];
	let eoce = false;

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		// Handle connection status (type 6 = ConnectionStatus)
		const msg = message as any;
		if (msg.type && typeof msg.type === 'function' && msg.type() === 6) {
			const status = msg.status ? msg.status() : undefined;
			const relayUrl = msg.relayUrl ? msg.relayUrl() : undefined;
			if (status && relayUrl) {
				// Normalize URL to match relay keys
				const normalizedUrl = normalizeURL(relayUrl.toString());
				connectionStatus[normalizedUrl] = status;
				connectionTracker?.handleMessage?.(msg);
			}
			return;
		}

		switch (message.type()) {
			case MessageType.Eoce:
				eoce = true;
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message) as ParsedEvent;
				if (!isKind4(message)) return;
				// Deduplicate by id
				const eventId = parsedEvent.id()?.fnv1aHash();
				const existingIndex = rawEvents.findIndex(
					(item) => item.id()?.fnv1aHash() === eventId
				);
				if (existingIndex === -1) {
					if (!eoce) {
						rawEvents = [...rawEvents, parsedEvent];
					} else {
						rawEvents = [parsedEvent, ...rawEvents];
					}
				}
				break;
		}
	}

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

	// Initialize subscription
	let unsubscribe: (() => void) | undefined;

	$: if (visible && $key?.pub) {
		if (rawEvents.length === 0 && !loading) {
			loading = true;
			const requests = buildRequests();
			if (requests.length > 0) {
				unsubscribe?.();
				connectionTracker = new ConnectionTracker();
				unsubscribe = useSubscription(
					'chat_' + $key.pub,
					requests,
					handleEvents,
					subscriptionOptions
				);
			}
		}
	}

	// Handle pull-to-refresh
	function handleRefresh() {
		refreshing = true;
		eoce = false;
		rawEvents = [];
		contacts = {};
		const requests = buildRequests();
		if (requests.length > 0) {
			unsubscribe?.();
			connectionTracker = new ConnectionTracker();
			unsubscribe = useSubscription(
				'chat_' + $key.pub + '_refresh_' + Date.now(),
				requests,
				handleEvents,
				subscriptionOptions
			);
		}
		refreshing = false;
	}

	function correspondant(post: ParsedEvent) {
		const kind4 = asKind4(post) as Kind4Parsed;
		const recipient = kind4.recipient()?.toString() || '';
		return recipient == $key?.pub ? post.pubkey()!.toString() : (recipient as string);
	}

	function showChatInfoModal() {
		const modal = document.getElementById('blurred_chat_info') as HTMLDialogElement | null;
		modal?.showModal();
	}

	// Cleanup on unmount
	import { onDestroy } from 'svelte';
	onDestroy(() => {
		unsubscribe?.();
	});
</script>

<Pager rootPath="/chat">
	<Feed
		items={chatItems}
		getItemId={(item) => item?.id?.()?.fnv1aHash?.() ?? 0}
		{loading}
		pullToRefresh
		onRefresh={handleRefresh}
		bind:start
		bind:end
		backdrop={!chatItems.length}
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
							on:click={showChatInfoModal}
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
				<RelaysList
					relays={uniq([...$writeRelays, ...$readRelays]).map(normalizeURL)}
					{connectionStatus}
				/>
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
							<Content note={post} showQuote={false} class="!w-auto flex-grow" />
						</span>
					</div>
				</div>
			</a>
		</svelte:fragment>
	</Feed>
</Pager>
