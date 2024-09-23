<script lang="ts">
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';

	import { liveQuery } from 'dexie';
	import { db, type Note } from 'src/stores/db';
	import { selectedPost } from 'src/stores';
	import _ from 'lodash';
	import Icon from '@iconify/svelte';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';
	import Replypost from './post/reply-post.svelte';
	import VirtualList from 'src/comp/VirtualList.svelte';
	import { fetchReplies } from 'src/stores/notes';
	import { onMount } from 'svelte';
	import { pool } from 'src/stores/relays';

	let start = 0;

	let results: Note[] = [];

	// sort replies by created_at
	$: replies = results
		?.sort((a, b) => a.created_at - b.created_at)
		.filter((note) => !note.content.includes($selectedPost?.content))
		// .map((note) => {
		// 	console.log(note.content);
		// 	console.log($selectedPost?.content);
		// 	console.log(note.content.includes($selectedPost?.content));
		// 	return note;
		// })
		.filter((note) => note.reply_to == $selectedPost?.id);

	$: open = !!$selectedPost;

	let abortController = new AbortController();

	function fetch() {
		console.log('fetch');
		abortController.abort();
		abortController = new AbortController();
		$db.notes
			.where('reply_to')
			.equals($selectedPost?.id)
			.sortBy('created_at')
			.then(async (r) => {
				console.log('fetched', r);
				results = r;
				const newReplies = fetchReplies(
					$pool,
					$selectedPost,
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

	$: $selectedPost && fetch();

	$: items = [$selectedPost, ...(replies || [])].filter((p) => !!p);

	$: console.log($selectedPost, replies, items);
</script>

<Fullscreen
	bind:open
	onClose={() => {
		abortController.abort();
		$selectedPost = null;
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
				full={(replies || []).findIndex((note) => note.id === item.id) == -1}
				visible={(replies || []).findIndex((note) => note.id === item.id) >= start - 2}
			/>
			<!-- <div>
							<Header note={item} />
							<div class="flex gap-2">
								<div class="min-w-8" />
								<div class="flex-grow">
									<div class="flex gap-2" on:click={() => ($selectedPost = item)}>
										<div class="text-sm break-words overflow-hidden">
											<Content content={item.content} />
										</div>
									</div>
									<Footer
										note={item}
										visible={replies.findIndex((note) => note.id === item.id) >= start}
									/>
								</div>
							</div>
						</div> -->
		</VirtualList>
		<!-- </div> -->

		<!-- </div> -->
	</div></Fullscreen
>
