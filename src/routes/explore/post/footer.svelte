<script lang="ts">
	import Icon from '@iconify/svelte';
	import { liveQuery } from 'dexie';
	import { getLinkPreview } from 'link-preview-js';
	import { type NostrEvent } from 'nostr-tools';
	import { db, key, previewCache } from 'src/stores/db';
	import { fetchReactions, fetchReplies, fetchZaps } from 'src/stores/notes';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import PictureProfile from './picture-profile.svelte';
	import { sendMessage } from 'src/actions/chat';
	import { sendReaction } from 'src/actions/notes';
	import { signer } from 'src/stores/signer';
	import { replyPost } from 'src/stores';

	export let note: NostrEvent;
	export let visible: boolean;

	let reactions = liveQuery(() => $db.reactions.where('ref').equals(note.id).count());

	let liked = liveQuery(() =>
		$db.reactions
			.where('ref')
			.equals(note.id)
			.and((r) => r.pubkey === $key?.pub)
			.count()
	);
	let zaps = liveQuery(() => $db.zaps.where('ref').equals(note.id).toArray());
	// $: zaps = zapQuery;

	$: biggerZap = $zaps?.sort((a, b) => (a.amount > b.amount ? -1 : 0))?.[0];

	let replies = liveQuery(() => $db.notes.where('reply_to').equals(note.id).toArray());

	let abortController = new AbortController();

	function fetch() {
		abortController.abort();
		abortController = new AbortController();
		fetchReactions($pool, note, abortController);
		fetchZaps($pool, note, abortController);
		fetchReplies($pool, note, abortController);

		// return abortController;
	}

	onMount(() => {
		// fetch();

		return () => {
			abortController.abort();
		};
	});

	$: visible ? fetch() : abortController.abort();
</script>

<div class="flex items-center gap-1 min-h-1 justify-between pl-2">
	<!-- <Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" /> -->
	{#if biggerZap}
		<div class="flex items-center gap-2">
			<PictureProfile pubkey={biggerZap?.pubkey} />
			<div class="text-sm opacity-50">{biggerZap?.amount / 1000}</div>
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
					<div class="text-sm">{zap.amount / 1000}</div>
				</div>
			{/each}
		{/if}
	</div> -->
</div>

<!-- <div class="flex items-center w-full mt-1 pb-1"> -->
<!-- <div class="min-w-8" /> -->
<div class="flex-grow flex justify-end px-4 opacity-60 w-full">
	<div
		class="flex items-center justify-end gap-1 cursor-pointer w-1/4"
		on:click={() => ($replyPost = note)}
	>
		{#if visible}
			{$replies?.length || ''}
			<Icon icon="iconamoon:comment-light" class="" />
		{/if}
	</div>
	<div class="flex items-center justify-end cursor-pointer w-1/4">
		{#if visible}
			{$zaps?.reduce((acc, cur) => (acc += cur.amount), 0) / 1000 || ''}
			<Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" />
		{/if}
	</div>
	<div
		class="flex items-center justify-end gap-1 cursor-pointer w-1/4"
		class:text-red-600={!!$liked}
		class:font-semibold={!!$liked}
		on:click={() => !$liked && sendReaction($pool, $signer, note.id, '🤟')}
	>
		{#if visible}
			{$reactions || ''}
			<Icon icon="icon-park-outline:like" class="cursor-pointer" />
		{/if}
	</div>
	<div class="flex items-center justify-end gap-1 cursor-pointer w-1/4">
		<Icon icon="grommet-icons:sync" class="" />
	</div>
</div>
<!-- </div> -->
