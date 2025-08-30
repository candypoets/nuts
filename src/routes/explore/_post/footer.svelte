<script lang="ts">
	import {
		CountResponse,
		MessageType,
		WorkerMessage,
		type ConnectionStatus,
		type ParsedEvent,
		type SubscribeKind,
		type SubscriptionOptions
	} from '@candypoets/nipworker';
	import { usePublish, useSubscription } from '@candypoets/nipworker/hooks';
	import { asConnectionStatus, asCountResponse } from '@candypoets/nipworker/utils';
	import Icon from '@iconify/svelte';
	import { kinds, type EventTemplate } from 'nostr-tools';
	import { getContext, onDestroy, onMount } from 'svelte';

	import EmojiPickerContent from 'src/components/EmojiPickerContent.svelte';
	import { key } from 'src/controller';
	import { replying } from 'src/controller/editor';
	import { updateSendStatus } from 'src/controller/sendStatus';
	import { now } from 'src/lib/period';
	import { go } from 'src/routes/modals/modal';
	import { getUserRelays } from 'src/routes/queries/user';

	export let note: ParsedEvent;
	export let visible: boolean;
	export let main = false;

	let sub: (() => void) | undefined;
	let relaysub: (() => void) | undefined;

	let relays: string[] = [];

	let reactions: ParsedEvent[] = [];

	let isImageContext = getContext('imageContext');
	// replies are exported back to the parent, if the parent decides to show some
	export let replies: ParsedEvent[] = [];
	export let connectionStatus: { [url: string]: ConnectionStatus } = {};
	let reposts: ParsedEvent[] = [];
	let liked = '';
	let replied = false;
	let reposted = false;
	let timeout: NodeJS.Timeout | undefined;
	let triggerElement: HTMLElement;
	let isMobile = false;
	let reactionCount = 0;
	let replyCount = 0;
	let repostCount = 0;

	let decoded = {
		id: note.id()!.toString(),
		pubkey: note.pubkey()!.toString()
	};

	const commonEmoticons = ['👍', '❤️', '😂', '🔥', '😍', '🙏', '💯', '🤔', '🫂', '🚀'];

	function checkMobile() {
		isMobile = window.innerWidth < 640;
	}

	const subscriptionOptions: SubscriptionOptions = {
		pipeline: {
			pipes: [{ name: 'counter', params: { kinds: [1, 6, 7, 17], pubkey: $key?.pub } }]
		}
	};

	onMount(() => {
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	});

	const handleEvents = (message: WorkerMessage) => {
		switch (message.type()) {
			case MessageType.ConnectionStatus:
				const status = asConnectionStatus(message) as ConnectionStatus;
				connectionStatus[status.relayUrl()?.toString() as string] = status;
				break;
			case MessageType.CountResponse:
				const count = asCountResponse(message) as CountResponse;
				switch (count.kind()) {
					case 7:
						reactionCount = count.count() || reactionCount;
						liked = liked || count.you();
						break;
					case 17:
						reactionCount = count.count() || reactionCount;
						liked = liked || count.you();
						break;
					case 1:
						replyCount = count.count() || replyCount;
						replied = replied || count.you();
					case 6:
						repostCount = count.count() || repostCount;
						reposted = reposted || count.you();
				}
		}
	};

	function subscribe() {
		timeout = setTimeout(async () => {
			if (visible && !relaysub) {
				relaysub = getUserRelays(decoded.pubkey, (result) => {
					relays = result;
					sub = useSubscription(
						'f_' + decoded.id,
						[
							{
								kinds: [1, 6, 7, 17],
								tags: { '#e': [decoded.id] },
								noContext: true,
								relays
							}
						],
						handleEvents,
						subscriptionOptions
					);
				});
			}
		}, 200);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			sub?.();
			relaysub?.();
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

		// nostrManager.publish('reaction_' + decoded.id, event);
		usePublish('reaction_' + decoded.id, event, (statuses: any, kind: SubscribeKind) => {
			sendStatus[statuses.relay_url] = statuses.status;
			updateSendStatus('reaction_' + decoded.id, sendStatus);
		});
	}

	function sendRepost() {
		if (!$key.pub) return;
		let sendStatus: { [url: string]: ConnectionStatus } = {};
		const event: EventTemplate = {
			kind: kinds.Repost,
			tags: [
				['e', decoded.id],
				['p', decoded.pubkey]
			],
			content: JSON.stringify(note),
			created_at: now()
		};

		usePublish('repost_' + decoded.id, event, (statuses: any, kind: SubscribeKind) => {
			sendStatus[statuses.relay_url] = statuses.status;
			updateSendStatus('repost_' + decoded.id, sendStatus);
		});
	}

	onDestroy(unsubscribe);

	$: visible ? subscribe() : unsubscribe();
</script>

<div class="flex-grow flex px-2 w-full h-6 pl-10" class:!pl-2={main}>
	<div class="flex items-center gap-2 cursor-pointer w-full">
		<div
			class="flex items-center space-x-1 hover:font-bold hover:text-accent hover:-mt-1 transition-all"
			class:text-primary={!!replied}
			class:font-semibold={!!replied}
			on:click={() => ($replying = !isImageContext)}
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
			on:click|stopPropagation={() => !reposted && sendRepost()}
		>
			<Icon icon="ph:repeat" class="text-2xl" />
			<span>{repostCount || ''}</span>
		</div>

		<!-- Zap Button -->
		<div
			class="flex items-center space-x-1 hover:font-bold hover:text-accent hover:-mt-1 transition-all"
			role="button"
			tabindex="0"
			on:click|stopPropagation={() => {
				go('ecash:' + note.pubkey + ':' + decoded.id);
			}}
		>
			<Icon icon="material-symbols-light:bolt-outline-rounded" class="text-3xl" />
			<span></span>
		</div>
	</div>
	<div class="flex items-center shrink-0 justify-end gap-1 cursor-pointer">
		<div class="flex items-center space-x-1">
			<!-- {#each Object.entries(mapEmoticons)
				.sort((a, b) => b[1] - a[1])
				.slice(0, isMobile ? 8 : 10) as [emoji, count]}
				{#if emoji.startsWith('http')}
					<img src={proxyAvatarUrl(emoji)} alt={emoji} class="w-3 h-3 sm:w-4 sm:h-4 inline-block" />
				{:else if !!emoji && emoji != 'undefined'}
					<span class="max-w-3 sm:max-w-4 inline-block overflow-hidden text-sm sm:text-base"
						>{emoji}</span
					>
				{/if}
			{/each} -->
		</div>
		<div>
			<!-- Trigger Area - Bind this element -->
			<div
				bind:this={triggerElement}
				class="reaction-trigger flex items-center space-x-1 hover:text-accent hover:-mt-1 transition-all cursor-pointer"
				class:text-accent={liked}
				class:font-semibold={liked}
				title={liked ? 'You reacted' : 'React to this post'}
				aria-label="React to post"
				on:click|stopPropagation
			>
				<span>{reactionCount || ''}</span>
				<!-- {#if liked}
					{#if liked.startsWith('http')}
						<img src={liked} alt={liked} class="w-4 h-4 inline-block" />
					{:else if !!liked && liked != 'undefined'}
						<span class="max-w-6 inline-block overflow-hidden text-xl">{liked}</span>
					{/if}
				{:else} -->
				<Icon icon="icon-park-outline:like" class="text-xl pointer-events-none" />
				<!-- {/if} -->
			</div>

			{#if triggerElement}
				<EmojiPickerContent {triggerElement} emojis={commonEmoticons} onSelect={sendReaction} />
			{/if}
		</div>
	</div>
</div>
