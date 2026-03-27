<script lang="ts">
	import {
		CounterPipeConfigT,
		MessageType,
		PipeConfig,
		PipeT,
		SaveToDbPipeConfigT,
		WorkerMessage,
		type ConnectionStatus,
		type ParsedEvent
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import {
		asConnectionStatus,
		asCountResponse,
		isConnectionStatus
	} from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { kinds, nip19, type EventTemplate } from 'nostr-tools';
	import { onDestroy } from 'svelte';

	import EmojiPickerContent from 'src/components/EmojiPickerContent.svelte';
	import Nutscash from 'src/components/Nutscash.svelte';
	import { isMobile, key } from 'src/controller';
	import { mutePipeConfig } from 'src/controller/nostr';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { now } from 'src/lib/period';
	import { go } from 'src/routes/modals/modal';
	import { getUserRelays } from 'src/routes/queries/user';

	export let note: ParsedEvent;
	export let visible: boolean;
	export let main = false;

	let sub: (() => void) | undefined;
	let quoteSub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	let relays: string[] = [];

	// replies are exported back to the parent, if the parent decides to show some
	export let connectionStatus: { [url: string]: ConnectionStatus } = {};
	let reposts: ParsedEvent[] = [];
	let liked = '';
	let replied = false;
	let reposted = false;
	let timeout: NodeJS.Timeout | undefined;
	let triggerElement: HTMLElement;
	let reactionCount = 0;
	let replyCount = 0;
	let repostCount = 0;
	let quoteCount = 0;

	let decoded = {
		id: note.id()!,
		pubkey: note.pubkey()!
	};

	const commonEmoticons = ['👍', '❤️', '😂', '🔥', '😍', '🙏', '💯', '🤔', '🫂', '🚀'];

	function createSubscriptionOptions(
		countKinds: number[],
		muteConfig: typeof $mutePipeConfig,
		pubkey: string
	) {
		return {
			pipeline: [
				new PipeT(PipeConfig.MuteFilterPipeConfig, muteConfig),
				new PipeT(PipeConfig.SaveToDbPipeConfig, new SaveToDbPipeConfigT()),
				new PipeT(PipeConfig.CounterPipeConfig, new CounterPipeConfigT(countKinds, pubkey))
			],
			bytesPerEvent: 256
		};
	}

	// $: subscriptionOptions = createSubscriptionOptions(
	// 	[1, 6, 7, 17],
	// 	$mutePipeConfig,
	// 	$key?.pub || ''
	// );
	// $: quoteSubscriptionOptions = createSubscriptionOptions([1], $mutePipeConfig, $key?.pub || '');

	function updateConnectionStatus(message: WorkerMessage) {
		if (message.type() !== MessageType.ConnectionStatus) return;

		const status = asConnectionStatus(message) as ConnectionStatus;
		connectionStatus[status.relayUrl() as string] = status;
	}

	const handleEvents = (message: WorkerMessage) => {
		switch (message.type()) {
			case MessageType.ConnectionStatus:
				updateConnectionStatus(message);
				break;
			case MessageType.CountResponse:
				const count = asCountResponse(message);
				if (!count) return;

				switch (count.kind()) {
					case 7:
						reactionCount = count.count();
						if (count.you() && !liked) liked = 'true';
						break;
					case 17:
						reactionCount = count.count();
						if (count.you() && !liked) liked = 'true';
						break;
					case 1:
						replyCount = count.count();
						replied = replied || count.you();
						break;
					case 6:
						repostCount = count.count();
						reposted = reposted || count.you();
						break;
				}
				break;
		}
	};

	const handleQuoteEvents = (message: WorkerMessage) => {
		switch (message.type()) {
			case MessageType.ConnectionStatus:
				updateConnectionStatus(message);
				break;
			case MessageType.CountResponse:
				const count = asCountResponse(message);
				if (!count || count.kind() !== 1) return;

				quoteCount = count.count();
				reposted = reposted || count.you();
				break;
		}
	};

	function subscribe() {
		timeout = setTimeout(async () => {
			if (visible && !relaysub) {
				relaysub = getUserRelays(decoded.pubkey, (result) => {
					relays = result.slice(0, $isMobile ? 3 : 5);

					// Main subscription: replies (kind 1 #e), reposts (kind 6), reactions (kind 7/17)
					sub = useSubscription(
						'f_' + decoded.id,
						[
							{
								kinds: [1, 6, 7],
								tags: { '#e': [decoded.id] },
								noContext: true,
								relays
							}
						],
						handleEvents,
						createSubscriptionOptions([1, 6, 7], $mutePipeConfig, $key?.pub || '')
					);

					// Separate subscription for quotes (kind 1 with #q tag)
					quoteSub = useSubscription(
						'fq_' + decoded.id,
						[
							{
								kinds: [1],
								tags: { '#q': [decoded.id] },
								noContext: true,
								relays
							}
						],
						handleQuoteEvents,
						createSubscriptionOptions([1], $mutePipeConfig, $key?.pub || '')
					);
				});
			}
		}, 700);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			sub?.();
			quoteSub?.();
			relaysub?.();
			sub = undefined;
			quoteSub = undefined;
			relaysub = undefined;
		}
	}

	function sendReaction(emoji: string) {
		let sendStatus: { [url: string]: ConnectionStatus } = {};
		if (!$key.pub) return;
		const event: EventTemplate = {
			kind: kinds.Reaction,
			tags: [
				['e', decoded.id],
				['p', decoded.pubkey]
			],
			content: emoji,
			created_at: now()
		};

		usePublish(
			'reaction_' + decoded.id,
			event,
			(message: WorkerMessage) => {
				const status = isConnectionStatus(message);
				if (status) {
					const relayUrl = status.relayUrl();
					if (relayUrl) {
						sendStatus[relayUrl] = status;
						updateSendStatus('repost_' + decoded.id, sendStatus);
					}
				}
			},
			{ defaultRelays: relays, trackStatus: true }
		);
	}

	onDestroy(unsubscribe);

	$: visible ? subscribe() : unsubscribe();
</script>

<div class="flex-grow flex px-2 w-full h-6 pl-10 mt-2" class:!pl-2={main}>
	<div class="flex items-center gap-2 cursor-pointer w-full">
		<div
			class="flex items-center space-x-1 hover:font-bold hover:text-accent hover:-mt-1 transition-all"
			class:text-accent={!!replied}
			class:font-semibold={!!replied}
			on:click|stopPropagation={() => {
				const goReply = (/** @type {string[]} */ r) => {
					const nevent = nip19.neventEncode({ id: note.id(), relays: r });
					go('reply:' + nevent);
				};
				if (relays.length > 0) {
					goReply(relays);
				} else {
					getUserRelays(note.pubkey(), goReply);
				}
			}}
			role="button"
			tabindex="0"
		>
			<Icon icon="iconamoon:comment-light" class="text-xl" />
			<span>{replyCount || ''}</span>
		</div>

		<!-- Repost Button -->
		<div
			class="flex items-center space-x-1 hover:font-bold hover:text-accent hover:-mt-1 transition-all"
			class:text-primary={!!reposted}
			class:font-semibold={!!reposted}
			class:hover:text-primary={!!reposted}
			class:hover:mt-0={!!reposted}
			class:cursor-default={!!reposted}
			role="button"
			tabindex="0"
			on:click|stopPropagation={() => {
				const goRepost = (/** @type {string[]} */ r) => {
					const nevent = nip19.neventEncode({ id: note.id(), relays: r });
					go('repost:' + nevent);
				};
				if (relays.length > 0) {
					goRepost(relays);
				} else {
					getUserRelays(note.pubkey(), goRepost);
				}
			}}
		>
			<Icon icon="ph:repeat" class="text-2xl" />
			<span>{repostCount + quoteCount || ''}</span>
		</div>
		<div
			bind:this={triggerElement}
			class="reaction-trigger flex items-center space-x-1 hover:text-accent hover:-mt-1 transition-all cursor-pointer"
			class:text-accent={liked}
			class:font-semibold={liked}
			title={liked ? 'You reacted' : 'React to this post'}
			aria-label="React to post"
			on:click|stopPropagation
		>
			<!-- {#if liked}
				{#if liked.startsWith('http')}
					<img src={liked} alt={liked} class="w-4 h-4 inline-block" />
				{:else if !!liked && liked != 'undefined'}
					<span class="max-w-6 inline-block overflow-hidden text-xl">{liked}</span>
				{/if}
			{:else} -->
			<Icon icon="icon-park-outline:like" class="text-xl pointer-events-none" />
			<span>{reactionCount || ''}</span>
			<!-- {/if} -->
		</div>

		{#if triggerElement}
			<EmojiPickerContent {triggerElement} emojis={commonEmoticons} onSelect={sendReaction} />
		{/if}
		<div
			class="flex items-center space-x-1 hover:font-bold hover:text-accent hover:-mt-1 transition-all"
			role="button"
			tabindex="0"
			on:click|stopPropagation={() => {
				const goShare = (/** @type {string[]} */ r) => {
					const nevent = nip19.neventEncode({ id: note.id(), relays: r });
					go('share:' + nevent);
				};
				if (relays.length > 0) {
					goShare(relays);
				} else {
					getUserRelays(note.pubkey(), goShare);
				}
			}}
		>
			<Icon icon="ph:paper-plane-tilt" class="text-xl" />
			<span></span>
		</div>
	</div>
	<div>
		<!-- Trigger Area - Bind this element -->
		<!-- Zap Button -->
		<div
			class="flex items-center space-x-1 hover:font-bold hover:text-accent hover:-mt-1 transition-all"
			role="button"
			tabindex="0"
			on:click|stopPropagation={() => {
				go('ecash:' + note.pubkey() + ':' + decoded.id);
			}}
		>
			<Nutscash class="h-6 w-6" />
			<span></span>
		</div>
	</div>
</div>
