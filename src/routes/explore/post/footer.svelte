<script lang="ts">
	import Icon from '@iconify/svelte';
	import _ from 'lodash';
	import { db, key } from 'src/stores/db';
	import { pool } from 'src/stores/relays';
	import { getContext, onMount } from 'svelte';

	import { nutsZap, sendReaction, sendRepost } from 'src/actions/notes';
	import { signer } from 'src/stores/signer';
	import type { Nip25Params, NIP25Parsed } from 'src/workers/nip25';
	import NIP25Worker from 'src/workers/nip25?worker';
	import NIP10Worker from 'src/workers/nip10?worker';
	import { handler } from 'src/handlers';
	import type { Writable } from 'svelte/store';
	import type { NIP01Parsed } from 'src/workers/nip01';
	import type { ParsedEvent } from 'src/workers/nipworker';
	import type { Nip10Params, NIP10Parsed } from 'src/workers/nip10';
	import { replyPost } from 'src/stores';
	import type { Kind10002Parsed } from 'src/parsers';
	import { getRelaysFromNote } from 'src/lib/getRelaysFromNote';

	let nip25: Worker | undefined;
	let nip10: Worker | undefined;

	export let note: ParsedEvent<any>;
	export let visible: boolean;

	let profile: Writable<NIP01Parsed | null> = getContext('profile');

	let relays: string[] = [];

	let reactions: ParsedEvent<NIP25Parsed>[] = [];
	let replies: ParsedEvent<NIP10Parsed>[] = [];
	let liked = false;
	let replied = false;
	let timeout: NodeJS.Timeout | undefined;
	const mapReactions: Record<string, ParsedEvent<NIP25Parsed>> = {};
	const mapReplies: Record<string, ParsedEvent<NIP10Parsed>> = {};

	async function subscribe() {
		relays = await getRelaysFromNote(note);
		timeout = setTimeout(async () => {
			if (visible) {
				// handle reactions
				handleReactions();
				// handle comments
				handleReplies();
			}
		}, 100);
	}

	async function handleReactions() {
		if (!nip25) nip25 = new NIP25Worker();
		nip25.postMessage({ '#e': [note.id], relays: relays || note.relays } as Nip25Params);
		const updateReactions = _.throttle(() => {
			reactions = Object.values(mapReactions);
		}, 100);
		for await (const data of handler<NIP25Parsed>(nip25, false)) {
			if (!data.parsed || mapReactions[data.id]) continue;
			if (data.pubkey == $profile?.pubkey) liked = true;
			mapReactions[data.id] = data;
			// Throttle updates to every 100ms
			updateReactions();
		}
	}

	async function handleReplies() {
		if (!nip10) nip10 = new NIP10Worker();
		nip10.postMessage({
			'#e': [note.id],
			relays: relays || note.relays,
			parse: false
		} as Nip10Params);
		const updateReplies = _.throttle(() => {
			replies = Object.values(mapReplies);
		}, 100);
		for await (const data of handler<NIP10Parsed>(nip10, false)) {
			if (data.type == 'EOSE' || mapReplies[data.id]) continue;
			if (data.pubkey == $profile?.pubkey) replied = true;
			mapReplies[data.id] = data;
			// // Throttle updates to every 100ms
			updateReplies();
		}
	}

	function unsubscribe() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		nip25?.terminate();
		nip25 = undefined;
		nip10?.terminate();
		nip10 = undefined;
	}

	onMount(() => {
		return () => {
			nip25?.terminate();
			nip10?.terminate();
			unsubscribe();
		};
	});

	$: visible ? subscribe() : unsubscribe();
</script>

<div class="flex items-center gap-1 min-h-1 justify-between pl-2">
	<!-- <Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" /> -->
	<!-- {#if biggerZap}
		<div class="flex items-center gap-2">
			<PictureProfile pubkey={biggerZap?.pubkey} />
			<div class="text-sm opacity-50">{biggerZap?.amount}</div>
			<div class="text-sm opacity-50 whitespace-nowrap overflow-hidden text-overflow-ellipsis">
				{biggerZap?.content}
			</div>
		</div>
	{:else}
		<div class="text-sm opacity-50"></div>
	{/if} -->
	<!-- <div class="flex items-center">
		{#if visible}
			{#each ($zaps || []).filter((z) => z.pubkey != biggerZap?.pubkey) as zap}
				<div class="flex items-center gap-2">
					<PictureProfile pubkey={zap.pubkey} />
					<div class="text-sm">{zap.amount}</div>
				</div>
			{/each}
		{/if}
	</div> -->
</div>

<!-- <div class="flex items-center w-full mt-1 pb-1"> -->
<!-- <div class="min-w-8" /> -->
<div class="flex-grow flex px-2 opacity-60 w-full h-6 pl-12">
	<div class="flex items-center gap-1 cursor-pointer w-full">
		{#if visible}
			<div
				class="flex items-center space-x-1 hover:font-bold hover:text-black hover:-mt-1 transition-all"
				class:text-red-600={!!replied}
				class:font-semibold={!!replied}
				on:click={() => ($replyPost = note)}
			>
				<Icon icon="iconamoon:comment-light" class="text-xl" />
				<span>{replies?.length || ''}</span>
			</div>
		{/if}
	</div>
	<!-- <div class="flex items-center justify-end cursor-pointer w-1/4">
		{#if visible}
			<div
				class="flex items-center"
				class:text-yellow-600={zapped}
				on:click={() => {
					nutsZap($pool, $signer, $wallets, note, $settings.zap.message, $settings.zap.amount);
					zaps = zaps.concat({
						id: '0',
						kind: nutKinds.Nutzap,
						content: $settings.zap.message || '',
						created_at: Math.floor(Date.now() / 1000),
						ref: note.id,
						pubkey: $key?.pub || '0',
						amount: $settings.zap.amount
					});
				}}
			>
				{zaps?.reduce((acc, cur) => (acc += Number(cur.amount)), 0) || ''}
				<Icon icon="bitcoin-icons:lightning-outline" class={'text-2xl '} />
			</div>
		{/if}
	</div> -->
	<div class="flex items-center justify-end gap-1 cursor-pointer">
		{#if visible}
			<div
				class="flex items-center space-x-1 hover:text-black hover:-mt-1 transition-all"
				class:text-red-600={!!liked}
				class:font-semibold={!!liked}
				on:click={() => {
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
<!-- </div> -->
