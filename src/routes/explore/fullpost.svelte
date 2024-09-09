<script lang="ts">
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';
	import Post from './post.svelte';
	import { type NostrEvent } from 'nostr-tools';
	import { liveQuery } from 'dexie';
	import { db } from 'src/stores/db';
	import { selectedPost } from 'src/stores';
	import Icon from '@iconify/svelte';
	import VirtualList from '@sveltejs/svelte-virtual-list';

	export let selected: NostrEvent;

	$: results = liveQuery(() => $db.notes.where('reply_to').equals($selectedPost?.id).toArray());
	// sort replies by created_at
	$: replies = ($results || [])
		.sort((a, b) => a.created_at - b.created_at)
		.filter(
			(note) => note.pubkey != '1c71a689772965af5cabfeb3cd4d99c62f7a908fdeb50ecf3e01eb7c25153a42'
		)
		.filter((note) => note.reply_to == $selectedPost?.id);
	$: open = !!$selectedPost;

	$: console.log(replies);
</script>

<Fullscreen
	bind:open
	onClose={() => {
		$selectedPost = null;
		replies = [];
	}}
>
	<div class="flex justify-between items-center px-4">
		<button on:click={() => ($selectedPost = null)}>
			<Icon icon="mingcute:down-line" class="text-xl" />
		</button>
		<h1 class="text-2xl font-semibold">Post</h1>
		<div />
	</div>
	<div class="container-height !pt-0">
		<Post note={$selectedPost} />
		<!-- <VirtualList items={replies} let:item> -->
		{#each replies as item}
			<Post note={item} />
		{/each}
		<!-- </VirtualList> -->
	</div>
</Fullscreen>
