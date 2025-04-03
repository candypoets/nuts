<script lang="ts">
	import Icon from '@iconify/svelte';
	import { key } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { getContext, onMount } from 'svelte';

	import { sendReaction } from 'src/actions/notes';
	import { getRelaysFromNote } from 'src/lib/getRelaysFromNote';
	import {
		isKind1,
		isKind17,
		isKind7,
		ReactionType,
		type AnyKind,
		type Kind1Parsed,
		type Kind7Parsed
	} from 'src/parsers';
	import { replyPost } from 'src/stores';
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
	const mapReactions: Record<string, ParsedEvent<NIP25Parsed>> = {};
	const mapReplies: Record<string, ParsedEvent<NIP10Parsed>> = {};
	const mapEmoticons: Record<string, number> = {};

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
				on:click|stopPropagation={() => ($replyPost = note)}
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
						{emoji}
					{/if}
				{/each}
			</div>
			<div
				class="flex items-center space-x-1 hover:text-black hover:-mt-1 transition-all"
				class:text-red-600={liked}
				class:font-semibold={liked}
				on:click|stopPropagation={() => {
					if (!liked) {
						sendReaction($pool, $signer, note.id, '🤟');
						reactions = [...reactions, { pubkey: $key?.pub, ref: note.id }];
					}
				}}
			>
				<span>{reactions?.length || ''}</span>
				<Icon icon="icon-park-outline:like" class="cursor-pointer text-xl" />
			</div>
		{/if}
	</div>
	<!-- <div class="flex items-center justify-end gap-1 cursor-pointer w-1/4">
		{#if visible}
			<div
				class="flex items-center"
				class:text-primary={!!reposted}
				class:font-semibold={!!reposted}
				on:click={() => {
					if (!reposted) {
						sendRepost($pool, $signer, note);
						reposts = [...reposts, { pubkey: $key?.pub, ref: note.id }];
					}
				}}
			>
				{reposts?.length || ''}
				<Icon icon="gridicons:reblog" class="" />
			</div>
		{/if}
	</div> -->
</div>
