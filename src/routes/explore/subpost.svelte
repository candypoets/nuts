<script lang="ts">
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';

	import { liveQuery } from 'dexie';
	import { db, type Note } from 'src/stores/db';
	import { selectedPost } from 'src/stores';
	import _ from 'lodash';
	import Icon from '@iconify/svelte';
	import Replypost from './post/reply-post.svelte';
	import VirtualList from 'src/comp/VirtualList.svelte';
	import { fetchReplies } from 'src/stores/notes';
	import { onMount } from 'svelte';
	import { pool } from 'src/stores/relays';
	import SubLayer from 'src/comp/drawers/SubLayer.svelte';

	let start = 0;

	let results: Note[] = [];

	export let selectedReply: Note;

	// sort replies by created_at
	$: replies = results
		?.sort((a, b) => a.created_at - b.created_at)
		.filter((note) => !note.content.includes(selectedReply?.content))
		// .map((note) => {
		// 	console.log(note.content);
		// 	console.log($selectedPost?.content);
		// 	console.log(note.content.includes($selectedPost?.content));
		// 	return note;
		// })
		.filter((note) => note.reply_to == selectedReply?.id);

	$: open = !!selectedReply;

	let abortController = new AbortController();

	function fetch() {
		abortController.abort();
		abortController = new AbortController();
		$db.notes
			.where('reply_to')
			.equals(selectedReply?.id)
			.sortBy('created_at')
			.then(async (r) => {
				console.log('fetched', r);
				results = r;
				const newReplies = fetchReplies(
					$pool,
					selectedReply?.id,
					abortController,
					replies[replies.length - 1]?.created_at
				);
				for await (const newReply of newReplies) {
					results = _.uniqBy([...replies, ...newReply], 'id');
				}
			});
		return abortController;
	}

	onMount(() => {
		return () => {
			abortController.abort();
		};
	});

	$: selectedReply && fetch();

	$: items = [selectedReply, ...(replies || [])].filter((p) => !!p);

	$: console.log(selectedReply, replies, items);
</script>

<SubLayer
	bind:open
	onClose={() => {
		abortController.abort();
		selectedReply = null;
		replies = [];
	}}
>
	<div class="flex justify-between items-center px-4">
		<button on:click={() => ($selectedPost = null)}>
			<Icon icon="mingcute:down-line" class="text-xl" />
		</button>
		<h1 class="text-xl font-semibold">Post</h1>
		<div />
	</div>
	<div class="container-height pb-20 !pt-0">
		<!-- <div class="h-screen"> -->
		<VirtualList {items} bind:start let:item>
			<Replypost
				note={item}
				bind:selectedReply
				full={(replies || []).findIndex((note) => note.id === item.id) == -1}
				visible={(replies || []).findIndex((note) => note.id === item.id) >= start - 2}
			/>
		</VirtualList>
	</div>
</SubLayer>
