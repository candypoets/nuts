<script lang="ts">
	import Icon from '@iconify/svelte';
	import EmojiPickerContent from 'src/comp/EmojiPickerContent.svelte';
	import { getContext, onMount } from 'svelte';

	import { kinds, type EventTemplate } from 'nostr-tools';
	import { signAndSend } from 'src/actions/relay';
	import { replying } from 'src/controller/editor';
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
	} from 'src/parsers';
	import { key } from 'src/stores/db';
	import { signer } from 'src/stores/signer';
	import { nostrManager } from 'src/wasm/manager';
	import type { NIP01Parsed } from 'src/workers/nip01';
	import type { NIP10Parsed } from 'src/workers/nip10';
	import type { NIP25Parsed } from 'src/workers/nip25';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import type { Writable } from 'svelte/store';

	export let note: ParsedEvent<any>;
	export let visible: boolean;

	let profile: Writable<NIP01Parsed | null> = getContext('profile');

	$: relays = getRelaysFromNote(note);

	let reactions: ParsedEvent<NIP25Parsed>[] = [];
	// replies are exported back to the parent, if the parent decides to show some
	export let replies: ParsedEvent<NIP10Parsed>[] = [];
	let liked = false;
	let replied = false;
	let timeout: NodeJS.Timeout | undefined;
	let triggerElement: HTMLElement;
	const mapReactions: Record<string, ParsedEvent<NIP25Parsed>> = {};
	const mapReplies: Record<string, ParsedEvent<NIP10Parsed>> = {};
	const mapEmoticons: Record<string, number> = {};
	const commonEmoticons = ['👍', '❤️', '😂', '🔥', '😍', '🙏', '💯', '🤔', '🫂', '🚀'];

	const handleReactions = (event: ParsedEvent<Kind7Parsed>) => {
		if (!event.parsed || mapReactions[event.id]) return;
		if (event.pubkey == $profile?.pubkey) liked = true;
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
		if (event.pubkey == $profile?.pubkey) replied = true;
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
		// Renamed from handleSelect for clarity in parent scope
		if (!$signer || !$key?.pub) {
			console.error('Signer or public key not available.');
			return;
		}

		const event: EventTemplate = {
			kind: kinds.Reaction,
			tags: [['e', note.id]],
			content: emoji,
			created_at: now()
		};

		signAndSend($signer, event, (status) => {
			console.log('Reaction status:', status.relay, status.message);
			// Assuming reactions prop updates automatically via subscription
		});
		// No need to hide tippy here - the child component does that
	}

	onMount(() => {
		return () => {
			unsubscribe();
		};
	});

	$: visible ? subscribe() : unsubscribe();
</script>

<!-- <div class="flex items-center w-full mt-1 pb-1"> -->
<!-- <div class="min-w-8" /> -->
<div class="flex-grow flex px-2 w-full h-6 pl-10">
	<div class="flex items-center gap-1 cursor-pointer w-full">
		{#if visible}
			<div
				class="flex items-center space-x-1 hover:font-bold hover:text-black hover:-mt-1 transition-all"
				class:text-red-600={!!replied}
				class:font-semibold={!!replied}
				on:click={() => ($replying = true)}
			>
				<Icon icon="iconamoon:comment-light" class="text-xl" />
				<span>{replies?.length || ''}</span>
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
					class="reaction-trigger flex items-center space-x-1 hover:text-black hover:-mt-1 transition-all cursor-pointer"
					class:text-blue-600={liked}
					class:font-semibold={liked}
					title={liked ? 'You reacted' : 'React to this post'}
					aria-label="React to post"
					on:click|stopPropagation
				>
					<span>{reactions?.length || ''}</span>
					<Icon icon="icon-park-outline:like" class="text-xl pointer-events-none" />
				</div>

				{#if triggerElement}
					<EmojiPickerContent {triggerElement} emojis={commonEmoticons} onSelect={sendReaction} />
				{/if}
			</div>
		{/if}
	</div>
</div>
