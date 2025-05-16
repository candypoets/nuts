<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onDestroy, onMount } from 'svelte';
	import { kinds, type EventTemplate } from 'nostr-tools';

	import EmojiPickerContent from 'src/components/EmojiPickerContent.svelte';
	import { replying } from 'src/controller/editor';
	import { kind0 } from 'src/controller/nostr';
	import { getRelaysFromNote } from 'src/lib/getRelaysFromNote';
	import { now } from 'src/lib/period';
	import {
		isKind1,
		isKind17,
		isKind7,
		ReactionType,
		type AnyKind,
		type Kind1Parsed,
		type Kind7Parsed
	} from 'src/types';
	import { key } from 'src/controller';
	import { nostrManager } from 'src/model/nostr';
	import type { ParsedEvent } from 'src/types';

	export let note: ParsedEvent<any>;
	export let visible: boolean;

	$: relays = getRelaysFromNote(note);

	let reactions: ParsedEvent<Kind7Parsed>[] = [];
	// replies are exported back to the parent, if the parent decides to show some
	export let replies: ParsedEvent<Kind1Parsed>[] = [];
	let liked = '';
	let replied = false;
	let timeout: NodeJS.Timeout | undefined;
	let triggerElement: HTMLElement;
	const mapReactions: Record<string, ParsedEvent<Kind7Parsed>> = {};
	const mapReplies: Record<string, ParsedEvent<Kind1Parsed>> = {};
	const mapEmoticons: Record<string, number> = {};
	const commonEmoticons = ['👍', '❤️', '😂', '🔥', '😍', '🙏', '💯', '🤔', '🫂', '🚀'];

	const handleReactions = (event: ParsedEvent<Kind7Parsed>) => {
		if (!event.parsed || mapReactions[event.id]) return;
		if (event.pubkey == $kind0?.pubkey) {
			if (event.parsed?.emoji) {
				liked = event.parsed?.emoji.url;
			} else if (event.parsed?.type == ReactionType.CUSTOM) {
				liked = event.content;
			}
			return;
		}
		mapReactions[event.id] = event;
		if (event.parsed?.emoji) {
			mapEmoticons[event.parsed?.emoji.url] = (mapEmoticons[event.parsed?.emoji.url] || 0) + 1;
		} else if (event.parsed?.type == ReactionType.CUSTOM) {
			mapEmoticons[event.content] = (mapEmoticons[event.content] || 0) + 1;
		}

		reactions = Object.values(mapReactions);
	};

	async function handleReplies(event: ParsedEvent<Kind1Parsed>) {
		if (mapReplies[event.id]) return;
		if (event.pubkey == $kind0?.pubkey) replied = true;
		mapReplies[event.id] = event;
		replies = Object.values(mapReplies);
	}

	const handleEvents = (events: ParsedEvent<AnyKind>[]) => {
		const event = events[0];
		if (isKind7(event) || isKind17(event)) {
			handleReactions(event);
		} else if (isKind1(event)) {
			handleReplies(event);
		}
	};

	function subscribe() {
		timeout = setTimeout(async () => {
			if (visible) {
				nostrManager.subscribe(
					note.id + 'footer',
					[
						{
							kinds: [1, 7, 17],
							tags: { '#e': [note.id] },
							relays: relays || note.relays || []
						}
					],
					handleEvents
				);
			}
		}, 200);
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
			nostrManager.unsubscribe(note.id + 'footer');
		}
	}

	function sendReaction(emoji: string) {
		if (!$key.pub) return;
		const event: EventTemplate = {
			kind: kinds.Reaction,
			tags: [
				['e', note.id],
				['p', note.pubkey]
			],
			content: emoji,
			created_at: now()
		};

		nostrManager.publish('reaction_' + note.id, event);
	}

	onDestroy(unsubscribe);

	$: visible ? subscribe() : unsubscribe();
</script>

<div class="flex-grow flex px-2 w-full h-6 pl-10">
	<div class="flex items-center gap-2 cursor-pointer w-full">
		{#if visible}
			<div
				class="flex items-center space-x-1 hover:font-bold hover:text-black hover:-mt-1 transition-all"
				class:text-primary={!!replied}
				class:font-semibold={!!replied}
				on:click={() => ($replying = true)}
				role="button"
				tabindex="0"
				on:keydown={(e) => e.key === 'Enter' && ($replying = true)}
			>
				<Icon icon="iconamoon:comment-light" class="text-xl" />
				<span>{replies?.length || ''}</span>
			</div>

			<!-- Repost Button -->
			<div
				class="flex items-center space-x-1 hover:font-bold hover:text-black hover:-mt-1 transition-all"
				role="button"
				tabindex="0"
				on:click={() => {}}
				on:keydown={(e) => e.key === 'Enter' && {}}
			>
				<Icon icon="ph:repeat" class="text-2xl" />
			</div>

			<!-- Zap Button -->
			<div
				class="flex items-center space-x-1 hover:font-bold hover:text-black hover:-mt-1 transition-all"
				role="button"
				tabindex="0"
				on:click={() => {}}
				on:keydown={(e) => e.key === 'Enter' && {}}
			>
				<Icon icon="material-symbols-light:bolt-outline-rounded" class="text-3xl" />
				<span></span>
			</div>
		{/if}
	</div>
	<div class="flex items-center shrink-0 justify-end gap-1 cursor-pointer">
		{#if visible}
			<div class="flex items-center space-x-1">
				{#each Object.entries(mapEmoticons)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 10) as [emoji, count]}
					{#if emoji.startsWith('http')}
						<img src={emoji} alt={emoji} class="w-4 h-4 inline-block" />
					{:else if !!emoji && emoji != 'undefined'}
						<span class="max-w-4 inline-block overflow-hidden">{emoji}</span>
					{/if}
				{/each}
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
					<span>{reactions?.length || ''}</span>
					{#if liked}
						{#if liked.startsWith('http')}
							<img src={liked} alt={liked} class="w-4 h-4 inline-block" />
						{:else if !!liked && liked != 'undefined'}
							<span class="max-w-6 inline-block overflow-hidden text-xl">{liked}</span>
						{/if}
					{:else}
						<Icon icon="icon-park-outline:like" class="text-xl pointer-events-none" />
					{/if}
				</div>

				{#if triggerElement}
					<EmojiPickerContent {triggerElement} emojis={commonEmoticons} onSelect={sendReaction} />
				{/if}
			</div>
		{/if}
	</div>
</div>
