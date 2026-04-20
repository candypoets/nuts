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
	import { IconReply, IconRepost, IconShare, IconLike, IconComment } from 'src/components/icons';
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

	// Add kind1111 comment count
	let commentCount = 0;
	let commentSub: (() => void) | undefined;

	// Check if note supports kind1111 comments (kind20 and other non-kind1 events)
	$: supportsKind1111 = note?.kind?.() !== 1 && note?.kind?.() !== 6;
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

	// Like animation state
	let isAnimating = false;

	function triggerLikeAnimation() {
		if (liked) return;
		isAnimating = true;
		setTimeout(() => {
			isAnimating = false;
		}, 600);
	}

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
					case 1111:
						commentCount = count.count();
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

					// Separate subscription for kind1111 comments (NIP-22, uses #E tag for root)
					commentSub = useSubscription(
						'comment_' + decoded.id,
						[
							{
								kinds: [1111],
								tags: { '#E': [decoded.id] },
								noContext: true,
								relays
							}
						],
						handleEvents,
						createSubscriptionOptions([1111], $mutePipeConfig, $key?.pub || '')
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
			commentSub?.();
			sub = undefined;
			quoteSub = undefined;
			relaysub = undefined;
			commentSub = undefined;
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

		triggerLikeAnimation();

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
						// Optimistic update when any relay confirms
						if (status.status() === 'true' && !liked) {
							liked = 'true';
						}
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
		<!-- Reply Button (for kind1 posts) -->
		{#if !supportsKind1111}
			<div
				class="action-btn flex items-center space-x-1 hover:-mt-1 transition-all"
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
				<div class="icon-container" class:is-active={!!replied}>
					<IconReply />
				</div>
				<span>{replyCount || ''}</span>
			</div>
		{/if}

		<!-- Comments Button (for non-kind1 posts using kind1111) -->
		{#if supportsKind1111}
			<div
				class="action-btn flex items-center space-x-1 hover:-mt-1 transition-all"
				on:click|stopPropagation={() => {
					const goComments = (/** @type {string[]} */ r) => {
						const nevent = nip19.neventEncode({ id: note.id(), relays: r });
						go('kind1111:' + nevent);
					};
					if (relays.length > 0) {
						goComments(relays);
					} else {
						getUserRelays(note.pubkey(), goComments);
					}
				}}
				role="button"
				tabindex="0"
			>
				<div class="icon-container">
					<IconComment />
				</div>
				<span>{commentCount || ''}</span>
			</div>
		{/if}

		<!-- Repost Button -->
		<div
			class="action-btn flex items-center space-x-1 hover:-mt-1 transition-all"
			class:text-primary={!!reposted}
			class:font-semibold={!!reposted}
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
			<div class="icon-container" class:is-active={!!reposted}>
				<IconRepost />
			</div>
			<span>{repostCount + quoteCount || ''}</span>
		</div>
		<!-- Like Button -->
		<div
			bind:this={triggerElement}
			class="action-btn reaction-trigger flex items-center space-x-1 hover:-mt-1 transition-all cursor-pointer"
			class:text-accent={liked}
			class:font-semibold={liked}
			title={liked ? 'You reacted' : 'React to this post'}
			aria-label="React to post"
			on:click|stopPropagation
		>
			<div class="heart-container" class:is-liked={liked} class:is-animating={isAnimating}>
				<IconLike />
			</div>
			<span>{reactionCount || ''}</span>
		</div>

		{#if triggerElement}
			<EmojiPickerContent {triggerElement} emojis={commonEmoticons} onSelect={sendReaction} />
		{/if}
		<!-- Share Button -->
		<div
			class="action-btn flex items-center space-x-1 hover:-mt-1 transition-all"
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
			<div class="icon-container">
				<IconShare />
			</div>
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
				const goZap = (/** @type {string[]} */ r) => {
					const nevent = nip19.neventEncode({ id: note.id(), relays: r });
					go('ecash:' + note.pubkey() + ':' + nevent);
				};
				if (relays.length > 0) {
					goZap(relays);
				} else {
					getUserRelays(note.pubkey(), goZap);
				}
			}}
		>
			<Nutscash class="h-6 w-6" />
			<span></span>
		</div>
	</div>
</div>

<style>
	/* Icon container base styles - unified size */
	.icon-container,
	:global(.heart-container) {
		position: relative;
		width: 1.25rem;
		height: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.action-btn) {
		cursor: pointer;
		padding: 2px;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	:global(.action-btn:hover) {
		transform: translateY(-2px);
		background: rgba(128, 128, 128, 0.1);
	}

	:global(.action-svg),
	:global(.heart-svg) {
		width: 100%;
		height: 100%;
		overflow: visible;
		transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}

	/* Reply icon - subtle bounce + tilt on hover */
	:global(.action-btn:hover .action-svg:not(.repost-svg):not(.share-svg)) {
		transform: scale(1.15) rotate(-8deg);
	}

	/* Repost - rotation effect */
	:global(.repost-svg) {
		transition: transform 0.3s ease;
	}

	:global(.action-btn:hover .repost-svg) {
		transform: rotate(-45deg);
	}

	.icon-container.is-active :global(.repost-svg) {
		animation: repost-spin 0.5s ease;
	}

	@keyframes repost-spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(-360deg);
		}
	}

	/* Share - fly away effect */
	:global(.share-svg) {
		transition:
			transform 0.3s ease,
			opacity 0.2s ease;
	}

	:global(.action-btn:hover .share-svg) {
		transform: translate(3px, -3px) rotate(-20deg);
	}

	/* Active state for reply - wobble bounce */
	.icon-container.is-active :global(.action-svg:not(.repost-svg)) {
		animation: reply-bounce 0.4s ease;
	}

	@keyframes reply-bounce {
		0%,
		100% {
			transform: scale(1) rotate(0deg);
		}
		25% {
			transform: scale(1.2) rotate(-10deg);
		}
		50% {
			transform: scale(1.1) rotate(5deg);
		}
		75% {
			transform: scale(1.15) rotate(-3deg);
		}
	}

	/* Heart styles */
	:global(.heart-outline) {
		transition: all 0.3s ease;
		opacity: 1;
	}

	:global(.heart-fill) {
		fill: currentColor;
		opacity: 0;
		transform: scale(0);
		transform-origin: center;
		transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}

	:global(.heart-container.is-liked .heart-outline) {
		opacity: 0;
	}

	:global(.heart-container.is-liked .heart-fill) {
		opacity: 1;
		transform: scale(1);
	}

	/* Animation states */
	:global(.heart-container.is-animating .heart-fill) {
		animation: heart-burst 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}

	@keyframes heart-burst {
		0% {
			transform: scale(0);
			opacity: 0;
		}
		25% {
			transform: scale(1.3);
			opacity: 0.8;
		}
		50% {
			transform: scale(0.9);
			opacity: 1;
		}
		75% {
			transform: scale(1.1);
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* Particles */
	:global(.particle) {
		opacity: 0;
		transform-origin: center;
	}

	:global(.heart-container.is-animating .particle) {
		animation: particle-burst 0.5s ease-out;
	}

	:global(.heart-container.is-animating .p1) {
		animation-delay: 0ms;
	}
	:global(.heart-container.is-animating .p2) {
		animation-delay: 25ms;
	}
	:global(.heart-container.is-animating .p3) {
		animation-delay: 50ms;
	}
	:global(.heart-container.is-animating .p4) {
		animation-delay: 75ms;
	}
	:global(.heart-container.is-animating .p5) {
		animation-delay: 100ms;
	}
	:global(.heart-container.is-animating .p6) {
		animation-delay: 125ms;
	}
	:global(.heart-container.is-animating .p7) {
		animation-delay: 150ms;
	}
	:global(.heart-container.is-animating .p8) {
		animation-delay: 175ms;
	}

	@keyframes particle-burst {
		0% {
			transform: translate(0, 0) scale(0);
			opacity: 1;
		}
		100% {
			transform: translate(var(--tx), var(--ty)) scale(0);
			opacity: 0;
		}
	}

	/* Individual particle directions */
	:global(.p1) {
		--tx: 0px;
		--ty: -20px;
	}
	:global(.p2) {
		--tx: 14px;
		--ty: -14px;
	}
	:global(.p3) {
		--tx: 20px;
		--ty: 0px;
	}
	:global(.p4) {
		--tx: 14px;
		--ty: 14px;
	}
	:global(.p5) {
		--tx: 0px;
		--ty: 20px;
	}
	:global(.p6) {
		--tx: -14px;
		--ty: 14px;
	}
	:global(.p7) {
		--tx: -20px;
		--ty: 0px;
	}
	:global(.p8) {
		--tx: -14px;
		--ty: -14px;
	}

	/* Hover effect when not liked */
	:global(.heart-container:not(.is-liked):hover .heart-outline) {
		transform: scale(1.1);
		stroke-width: 2.5;
	}

	/* Subtle pulse for already-liked state */
	:global(.heart-container.is-liked:hover .heart-fill) {
		animation: subtle-pulse 0.3s ease;
	}

	@keyframes subtle-pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
	}
</style>
