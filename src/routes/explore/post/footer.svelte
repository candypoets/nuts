<script lang="ts">
	import Icon from '@iconify/svelte';
	import { liveQuery } from 'dexie';
	import { getLinkPreview } from 'link-preview-js';
	import { type NostrEvent } from 'nostr-tools';
	import { db, previewCache } from 'src/stores/db';
	import { fetchReactions, fetchReplies, fetchZaps } from 'src/stores/notes';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';

	export let note: NostrEvent;

	$: reactions = liveQuery(() => $db.reactions.where('ref').equals(note.id).count());

	$: zaps = liveQuery(() => $db.zaps.where('ref').equals(note.id).toArray());

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
</script>

<div class="flex items-center w-full mt-1 border-b pb-1">
	<div class="min-w-8" />
	<div class="flex-grow flex justify-between px-4 opacity-60">
		<div class="flex items-center gap-1">
			<Icon icon="iconamoon:comment-light" class="" />
			{$replies?.length || ''}
		</div>
		<div class="flex items-center">
			<Icon icon="bitcoin-icons:lightning-outline" class="text-2xl" />
			{$zaps?.reduce((acc, cur) => (acc += cur.amount), 0) / 1000 || ''}
		</div>
		<div class="flex items-center gap-1">
			<Icon icon="icon-park-outline:like" class="" />
			{$reactions || ''}
		</div>
		<div class="flex items-center gap-1">
			<Icon icon="grommet-icons:sync" class="" />
			{0}
		</div>
	</div>
</div>
