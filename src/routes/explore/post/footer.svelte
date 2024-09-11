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

	export let note: NostrEvent;

	$: reactions = liveQuery(() => $db.reactions.where('ref').equals(note.id).count());

	$: liked = liveQuery(() =>
		$db.reactions
			.where('ref')
			.equals(note.id)
			.and((r) => r.pubkey === $key?.pub)
			.count()
	);

	$: zaps = liveQuery(() => $db.zaps.where('ref').equals(note.id).toArray());

	$: biggerZap = $zaps?.sort((a, b) => (a.amount > b.amount ? -1 : 0))?.[0];

	$: replies = liveQuery(() => $db.notes.where('reply_to').equals(note.id).toArray());

	onMount(() => {
		let abortController = new AbortController();

		fetchReactions($pool, note, abortController);
		fetchZaps($pool, note, abortController);
		fetchReplies($pool, note, abortController);

		return () => {
			abortController.abort();
		};
	});

	$: console.log('liked', $liked);
</script>

<div class="flex items-center gap-1 h-6 justify-between">
	<!-- <Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" /> -->
	<div class="max-w-9">
		{#each ($zaps || []).filter((z) => z.pubkey != biggerZap?.pubkey) as zap}
			<div class="flex items-center gap-2">
				<PictureProfile pubkey={zap.pubkey} />
				<div class="text-sm">{zap.amount / 1000}</div>
			</div>
		{/each}
	</div>
	{#if biggerZap}
		<div class="flex items-center gap-2">
			<div class="text-sm">{biggerZap?.content}</div>
			<div class="text-sm">{biggerZap?.amount / 1000}</div>
			<PictureProfile pubkey={biggerZap?.pubkey} />
		</div>
	{:else}
		<div class="text-sm opacity-50">-</div>
	{/if}
</div>

<!-- <div class="flex items-center w-full mt-1 pb-1"> -->
<!-- <div class="min-w-8" /> -->
<div class="flex-grow flex justify-between px-4 opacity-60">
	<div class="flex items-center gap-1">
		<Icon icon="iconamoon:comment-light" class="" />
		{$replies?.length || ''}
	</div>
	<div class="flex items-center">
		<Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" />
		{$zaps?.reduce((acc, cur) => (acc += cur.amount), 0) / 1000 || ''}
	</div>
	<div
		class="flex items-center gap-1"
		class:text-red-600={!!$liked}
		class:font-semibold={!!$liked}
		on:click={() => !$liked && sendReaction($pool, $signer, note.id, '🤟')}
	>
		<Icon icon="icon-park-outline:like" class="" />
		{$reactions || ''}
	</div>
	<div class="flex items-center gap-1">
		<Icon icon="grommet-icons:sync" class="" />
	</div>
</div>
<!-- </div> -->
