<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ChatLimiterPipeConfigT,
		MessageType,
		ParsePipeConfigT,
		PipeConfig,
		PipeT,
		SaveToDbPipeConfigT,
		SerializeEventsPipeConfigT,
		type Kind3Parsed,
		type Kind4Parsed,
		type ParsedEvent,
		type RequestObject,
		type WorkerMessage
	} from '@candypoets/nipworker';
	import { useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asKind3,
		asKind4,
		asParsedEvent,
		ConnectionTracker,
		fbArray,
		isConnectionStatus,
		isKind4
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { orderBy } from 'lodash';
	import { onDestroy } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';

	import Pager from 'src/components/Pager.svelte';
	import { key } from 'src/controller';
	import { kind3, mutePipeConfig, readRelays, writeRelays } from 'src/controller/nostr';
	import { DEFAULT_RELAYS } from 'src/lib/env';
	import ContentBlocks from 'src/routes/explore/_post/ContentBlocks.svelte';
	import Avatar from 'src/routes/explore/avatar.svelte';
	import Feed from 'src/routes/explore/feed.svelte';
	import User from 'src/routes/explore/user.svelte';
	import { go, navigateStackPath, usePagerNavigation } from 'src/routes/modals/modal';
	import Empty from './empty.svelte';

	export let visible = true;
	const nav = usePagerNavigation();

	function openRoot(eventPath: string) {
		nav ? nav.root(eventPath) : go(eventPath);
	}

	type ChatListTab = 'messages' | 'request';

	// Feed items managed by parent - grouped by chatId
	let chatItems: ParsedEvent[] = [];
	let rawEvents: ParsedEvent[] = [];
	let loading = false;
	let refreshing = false;

	let activeChatTab: ChatListTab = 'messages';
	let messageItems: ParsedEvent[] = [];
	let requestItems: ParsedEvent[] = [];
	let contactPubkeys = new Set<string>();

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

	let chatRelays: string[] = [];
	$: chatRelays = Array.from(
		new Set(
			($readRelays?.length || $writeRelays?.length
				? [...($readRelays || []), ...($writeRelays || [])]
				: DEFAULT_RELAYS
			).filter((relay): relay is string => !!relay)
		)
	);

	function buildRequests(): RequestObject[] {
		if (!$key?.pub) return [];

		return [
			{
				kinds: [4],
				authors: [$key.pub],
				relays: chatRelays,
				noCache: true
			},
			{
				kinds: [4],
				authors: [$key.pub],
				relays: chatRelays
			},
			{
				kinds: [4],
				tags: { '#p': [$key.pub] },
				relays: chatRelays,
				noCache: true
			},
			{
				kinds: [4],
				tags: { '#p': [$key.pub] },
				relays: chatRelays
			}
		];
	}

	// Keep contact pubkeys ready for classifying message/request lists.
	$: {
		const pubs = $kind3
			? fbArray(asKind3($kind3) as Kind3Parsed, 'contacts')
					.map((contact) => contact.pubkey())
					.filter((pubkey): pubkey is string => Boolean(pubkey))
			: [];
		contactPubkeys = new Set(pubs);
	}

	// Process raw events into grouped conversations and split by list type.
	function processEvents(
		events: ParsedEvent[],
		knownContacts: Set<string>,
		hasContactList: boolean
	): {
		messages: ParsedEvent[];
		request: ParsedEvent[];
	} {
		const chatMap: {
			[key: string]: { latest: ParsedEvent; hasOutgoing: boolean; correspondant: string };
		} = {};

		events.forEach((dm) => {
			const kind4 = asKind4(dm) as Kind4Parsed;
			const chatId = kind4.chatId();
			if (!chatId) return;

			const prev = chatMap[chatId];
			const isOutgoing = dm.pubkey() === $key?.pub;
			const peerPubkey = correspondant(dm);

			if (!prev) {
				chatMap[chatId] = {
					latest: dm,
					hasOutgoing: isOutgoing,
					correspondant: peerPubkey
				};
				return;
			}

			chatMap[chatId] = {
				latest: prev.latest.createdAt() < dm.createdAt() ? dm : prev.latest,
				hasOutgoing: prev.hasOutgoing || isOutgoing,
				correspondant: prev.correspondant || peerPubkey
			};
		});

		const sortedChats = orderBy(
			Object.values(chatMap),
			[(chat) => chat.latest.createdAt()],
			['desc']
		);

		return sortedChats.reduce(
			(acc, chat) => {
				const isInContacts = hasContactList ? knownContacts.has(chat.correspondant) : true;
				if (isInContacts || chat.hasOutgoing) {
					acc.messages.push(chat.latest);
				} else {
					acc.request.push(chat.latest);
				}
				return acc;
			},
			{ messages: [], request: [] } as { messages: ParsedEvent[]; request: ParsedEvent[] }
		);
	}

	// Reactive: process raw events into messages/request lists.
	$: {
		const groupedChats = processEvents(rawEvents, contactPubkeys, Boolean($kind3));
		messageItems = groupedChats.messages;
		requestItems = groupedChats.request;
	}

	// Reactive: select list items shown in Feed.
	$: {
		if (activeChatTab === 'request') {
			chatItems = requestItems;
		} else {
			chatItems = messageItems;
		}
	}

	let subs: string[] = [];
	let eoce = false;
	let chatConnectionTracker = new ConnectionTracker();
	let chatLoadingTimeout: ReturnType<typeof setTimeout> | undefined;

	// Handle incoming events from subscription
	function handleEvents(message: WorkerMessage) {
		const status = isConnectionStatus(message);
		if (status) {
			chatConnectionTracker.handleMessage(message);
			if (chatConnectionTracker.resolutionRate > 0.5) {
				loading = false;
				refreshing = false;
				if (chatLoadingTimeout) {
					clearTimeout(chatLoadingTimeout);
					chatLoadingTimeout = undefined;
				}
			}
			return;
		}

		switch (message.type()) {
			case MessageType.Eoce:
				eoce = true;
				loading = false;
				break;
			case MessageType.ParsedNostrEvent:
				const parsedEvent = asParsedEvent(message) as ParsedEvent;
				if (!isKind4(message)) return;
				// Deduplicate by id
				const eventId = parsedEvent.id();
				const existingIndex = rawEvents.findIndex((item) => item.id() === eventId);
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

	function buildSubscriptionOptions(subId: string) {
		return {
			pipeline: [
				new PipeT(PipeConfig.MuteFilterPipeConfig, $mutePipeConfig),
				new PipeT(
					PipeConfig.ChatLimiterPipeConfig,
					new ChatLimiterPipeConfigT($key?.pub || '', 5, 5000, [4])
				),
				new PipeT(PipeConfig.ParsePipeConfig, new ParsePipeConfigT()),
				new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
				new PipeT(
					PipeConfig.SerializeEventsPipeConfig,
					new SerializeEventsPipeConfigT(new TextEncoder().encode(subId))
				)
			]
		};
	}

	// Initialize subscription
	let unsubscribeChat: (() => void) | undefined;

	$: if (visible && $key?.pub && $key?.hasSigner !== false) {
		if (rawEvents.length === 0 && !loading) {
			loading = true;
			const requests = buildRequests();
			if (requests.length > 0) {
				const subId = 'chat_' + $key.pub + '_' + chatRelays.join(',');
				unsubscribeChat?.();
				chatConnectionTracker.reset();
				unsubscribeChat = useSubscription(
					subId,
					requests,
					handleEvents,
					buildSubscriptionOptions(subId)
				);
				if (chatLoadingTimeout) clearTimeout(chatLoadingTimeout);
				chatLoadingTimeout = setTimeout(() => {
					loading = false;
					refreshing = false;
					chatLoadingTimeout = undefined;
				}, 5000);
			}
		}
	}

	// Handle pull-to-refresh
	function handleRefresh() {
		refreshing = true;
		eoce = false;
		rawEvents = [];
		const requests = buildRequests();
		if (requests.length > 0) {
			const refreshId = Date.now();
			const subId = 'chat_' + $key.pub + '_refresh_' + refreshId;
			unsubscribeChat?.();
			chatConnectionTracker.reset();
			unsubscribeChat = useSubscription(
				subId,
				requests,
				handleEvents,
				buildSubscriptionOptions(subId)
			);
			if (chatLoadingTimeout) clearTimeout(chatLoadingTimeout);
			chatLoadingTimeout = setTimeout(() => {
				loading = false;
				refreshing = false;
				chatLoadingTimeout = undefined;
			}, 5000);
		}
	}

	function correspondant(post: ParsedEvent) {
		const kind4 = asKind4(post) as Kind4Parsed;
		const recipient = kind4.recipient() || '';
		return recipient == $key?.pub ? post.pubkey()! : (recipient as string);
	}

	function parsedChatContent(post: ParsedEvent) {
		const kind4 = asKind4(post) as Kind4Parsed;
		return kind4 ? fbArray(kind4, 'parsedContent') : [];
	}

	function chatHref(post: ParsedEvent) {
		return resolve(`/chat/kind4:${correspondant(post)}` as '/chat');
	}

	function openChat(post: ParsedEvent, event: MouseEvent) {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		navigateStackPath(chatHref(post));
	}

	function selectChatTab(tab: ChatListTab) {
		activeChatTab = tab;
		if (start !== 0 || end !== 0) {
			start = 0;
			end = 0;
		}
	}

	function showChatInfoModal() {
		const modal = document.getElementById('blurred_chat_info') as HTMLDialogElement | null;
		modal?.showModal();
	}

	// Cleanup on unmount
	onDestroy(() => {
		unsubscribeChat?.();
		if (chatLoadingTimeout) clearTimeout(chatLoadingTimeout);
	});
</script>

<Pager rootPath="/chat">
	<Feed
		items={chatItems}
		getItemId={(item) => item?.id?.() ?? 0}
		{loading}
		pullToRefresh
		onRefresh={handleRefresh}
		bind:start
		bind:end
		backdrop={!chatItems.length}
	>
		<svelte:fragment slot="sticky-header">
			<div class="relative pt-safe bg-base-300 bg-opacity-50">
				<div class="flex justify-between w-feed lg:m-auto h-16 items-center px-1">
					<h1 class="text-2xl font-semibold">Messages</h1>
					<button
						class="btn btn-circle btn-sm btn-primary"
						on:click|stopPropagation={() => openRoot('newchat')}
					>
						<Icon icon="teenyicons:add-outline" class="text-xl"></Icon>
					</button>
				</div>
				<div class="w-feed lg:m-auto pb-2 px-1">
					<div class="tabs tabs-boxed bg-base-200 bg-opacity-70 w-full">
						<button
							class="tab flex-1 !text-inherit"
							class:tab-active={activeChatTab === 'messages'}
							class:!bg-base-100={activeChatTab === 'messages'}
							on:click={() => selectChatTab('messages')}
						>
							messages
							<span class="badge badge-sm ml-2">{messageItems.length}</span>
						</button>
						<button
							class="tab flex-1 !text-inherit"
							class:tab-active={activeChatTab === 'request'}
							class:!bg-base-100={activeChatTab === 'request'}
							on:click={() => selectChatTab('request')}
						>
							requests
							<span class="badge badge-sm ml-2">{requestItems.length}</span>
						</button>
					</div>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="header">
			<div
				class="w-feed relative pt-safe bg-base-300 bg-opacity-85 rounded-lg pb-2 px-1 shadow-widget-down"
			>
				<div class="flex justify-between m-auto h-16 items-center px-1">
					<h1 class="text-2xl font-semibold">
						Messages<button
							class="btn btn-circle btn-ghost btn-xs ml-2"
							on:click={showChatInfoModal}
						>
							<Icon icon="material-symbols:info-outline" class="text-lg"></Icon>
						</button>
					</h1>
					<dialog id="blurred_chat_info" class="modal">
						<div class="modal-box bg-base-300 bg-opacity-85">
							<h3 class="font-bold text-xl">What is Chat?</h3>
							<p class="py-4 text-base">
								Chat is like speaking a secret language with your conversation partner. While others
								can see who you're talking to and how long your conversations are, they can't
								understand a single word of what you're saying. Your messages are end-to-end
								encrypted on the Nostr protocol.
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
					<button
						class="btn btn-circle btn-sm btn-primary btn-outline"
						on:click|stopPropagation={() => openRoot('newchat')}
					>
						<Icon icon="material-symbols:chat-add-on-outline-rounded" class="text-xl" />
						<!-- <Icon icon="teenyicons:add-outline" class="text-xl"></Icon> -->
					</button>
				</div>
				<div class="px-1 mt-2">
					<div class="tabs tabs-boxed bg-base-200 bg-opacity-70 w-full">
						<button
							class="tab flex-1 !text-inherit"
							class:tab-active={activeChatTab === 'messages'}
							class:!bg-base-100={activeChatTab === 'messages'}
							on:click={() => selectChatTab('messages')}
						>
							messages
							<span class="badge badge-sm ml-2">{messageItems.length}</span>
						</button>
						<button
							class="tab flex-1 !text-inherit"
							class:tab-active={activeChatTab === 'request'}
							class:!bg-base-100={activeChatTab === 'request'}
							on:click={() => selectChatTab('request')}
						>
							request
							<span class="badge badge-sm ml-2">{requestItems.length}</span>
						</button>
					</div>
				</div>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="empty-content">
			<br />
			<Empty />
		</svelte:fragment>
		<svelte:fragment slot="item-content" let:post let:visible>
			{@const k4 = asKind4(post)}
			<a
				href={chatHref(post)}
				class="flex gap-2 h-24 overflow-hidden pt-4 pr-4 pl-1 cursor-pointer bg-base-300 bg-opacity-85 rounded-lg mt-1 shadow-widget"
				on:click={(event) => openChat(post, event)}
				on:touchstart|stopPropagation
				on:touchmove|stopPropagation
				on:touchend|stopPropagation
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
							<ContentBlocks
								content={parsedChatContent(post)}
								showQuote={false}
								class="!w-auto flex-grow"
							/>
						</span>
					</div>
				</div>
			</a>
		</svelte:fragment>
	</Feed>
</Pager>
