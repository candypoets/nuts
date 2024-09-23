<script lang="ts">
	import Icon from '@iconify/svelte';
	import { liveQuery } from 'dexie';
	import { getLinkPreview } from 'link-preview-js';
	import { type NostrEvent } from 'nostr-tools';
	import _ from 'lodash';
	import {
		db,
		key,
		previewCache,
		settings,
		type Note,
		type Reaction,
		type Repost,
		type Zap
	} from 'src/stores/db';
	import { fetchReactions, fetchReplies, fetchRepost, fetchZaps } from 'src/stores/notes';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import PictureProfile from './picture-profile.svelte';
	import { sendMessage } from 'src/actions/chat';
	import { nutsZap, sendReaction, sendRepost } from 'src/actions/notes';
	import { signer } from 'src/stores/signer';
	import { replyPost } from 'src/stores';
	import { wallets } from 'src/stores/wallet';

	export let note: NostrEvent;
	export let visible: boolean;

	let reactions: Reaction[] = [];
	const reactionsQuery = $db.reactions.where('ref').equals(note.id).sortBy('created_at');

	$: liked = reactions?.some((r) => r.pubkey === $key?.pub);

	let reposts: Repost[] = [];
	const repostQuery = $db.reposts.where('ref').equals(note.id).sortBy('created_at');

	$: reposted = reposts?.some((r) => r.pubkey === $key?.pub);

	let zaps: Zap[] = [];
	const zapQuery = $db.zaps.where('ref').equals(note.id).sortBy('created_at');

	$: zapped = zaps?.some((z) => z.pubkey === $key?.pub);
	$: biggerZap = zaps?.sort((a, b) => (a.amount > b.amount ? -1 : 0))?.[0];

	let replies: Note[] = [];
	const repliesQuery = $db.notes.where('reply_to').equals(note.id).sortBy('created_at');

	let abortController = new AbortController();

	async function subscribe() {
		abortController.abort();
		abortController = new AbortController();
		reactionsQuery.then(async (r) => {
			reactions = r;
			const newReactions = fetchReactions(
				$pool,
				note,
				abortController,
				reactions[reactions.length - 1]?.created_at
			);
			for await (const newReaction of newReactions) {
				reactions = _.uniqBy([...reactions, ...newReaction], 'id');
			}
		});
		repostQuery.then(async (r) => {
			reposts = r;
			const newReposts = fetchRepost(
				$pool,
				note,
				abortController,
				reposts[reposts.length - 1]?.created_at
			);
			for await (const newRepost of newReposts) {
				reposts = _.uniqBy([...reposts, ...newRepost], 'id');
			}
		});
		zapQuery.then(async (r) => {
			zaps = r;
			const newZaps = fetchZaps($pool, note, abortController, zaps[zaps.length - 1]?.created_at);
			for await (const newZap of newZaps) {
				zaps = _.uniqBy([...zaps, ...newZap], 'id');
			}
		});

		repliesQuery.then(async (r) => {
			replies = r;
			const newReplies = fetchReplies(
				$pool,
				note,
				abortController,
				replies[replies.length - 1]?.created_at
			);
			for await (const newReply of newReplies) {
				replies = _.uniqBy([...replies, ...newReply], 'id');
			}
		});
	}

	function unsubscribe() {
		abortController.abort();
	}

	onMount(() => {
		// fetch();

		return () => {
			abortController.abort();
		};
	});

	$: visible ? subscribe() : unsubscribe();
</script>

<div class="flex items-center gap-1 min-h-1 justify-between pl-2">
	<!-- <Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" /> -->
	{#if biggerZap}
		<div class="flex items-center gap-2">
			<PictureProfile pubkey={biggerZap?.pubkey} />
			<div class="text-sm opacity-50">{biggerZap?.amount}</div>
			<div class="text-sm opacity-50 whitespace-nowrap overflow-hidden text-overflow-ellipsis">
				{biggerZap?.content}
			</div>
		</div>
	{:else}
		<div class="text-sm opacity-50"></div>
	{/if}
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
<div class="flex-grow flex justify-end px-4 opacity-60 w-full h-6">
	<div class="flex items-center justify-end gap-1 cursor-pointer w-1/4">
		{#if visible}
			<div class="flex items-center" on:click={() => ($replyPost = note)}>
				{replies?.length || ''}
				<Icon icon="iconamoon:comment-light" class="" />
			</div>
		{/if}
	</div>
	<div class="flex items-center justify-end cursor-pointer w-1/4">
		{#if visible}
			<div
				class="flex items-center"
				class:text-yellow-600={zapped}
				on:click={() =>
					nutsZap($pool, $signer, $wallets, note, $settings.zap.message, $settings.zap.amount)}
			>
				{zaps?.reduce((acc, cur) => (acc += Number(cur.amount)), 0) || ''}
				<Icon icon="bitcoin-icons:lightning-outline" class={'text-2xl '} />
			</div>
		{/if}
	</div>
	<div class="flex items-center justify-end gap-1 cursor-pointer w-1/4">
		{#if visible}
			<div
				class="flex items-center"
				class:text-red-600={!!liked}
				class:font-semibold={!!liked}
				on:click={() => {
					if (!liked) {
						sendReaction($pool, $signer, note.id, '🤟');
						reactions = [...reactions, { pubkey: $key?.pub, ref: note.id }];
					}
				}}
			>
				{reactions?.length || ''}
				<Icon icon="icon-park-outline:like" class="cursor-pointer" />
			</div>
		{/if}
	</div>
	<div class="flex items-center justify-end gap-1 cursor-pointer w-1/4">
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
	</div>
</div>
<!-- </div> -->
