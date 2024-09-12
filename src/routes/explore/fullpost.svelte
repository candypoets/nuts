<script lang="ts">
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';

	import { liveQuery } from 'dexie';
	import { db, type Note } from 'src/stores/db';
	import { selectedPost } from 'src/stores';
	import Icon from '@iconify/svelte';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import Footer from './post/footer.svelte';
	import VirtualList from '@sveltejs/svelte-virtual-list';
	import { fetchReplies } from 'src/stores/notes';
	import { onMount } from 'svelte';
	import { pool } from 'src/stores/relays';

	$: console.log($selectedPost);

	$: results = liveQuery(() => $db.notes.where('reply_to').equals($selectedPost?.id).toArray());
	// sort replies by created_at
	$: replies = ($results || [])
		.sort((a, b) => a.created_at - b.created_at)
		.filter(
			(note) => note.pubkey != '1c71a689772965af5cabfeb3cd4d99c62f7a908fdeb50ecf3e01eb7c25153a42'
		)
		.filter((note) => note.reply_to == $selectedPost?.id);
	$: open = !!$selectedPost;

	let abortController = new AbortController();

	function fetch() {
		abortController.abort();
		abortController = new AbortController();
		fetchReplies($pool, $selectedPost, abortController);
		return abortController;
	}

	onMount(() => {
		return () => {
			abortController.abort();
		};
	});

	$: $selectedPost && fetch();
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
		<h1 class="text-2xl font-semibold">Post</h1>
		<div />
	</div>
	<div class="container-height !pt-0">
		<div class="mt-6">
			<div class="px-2">
				<Header note={$selectedPost} />
				<Content content={$selectedPost.content} />
			</div>
			<Footer note={$selectedPost} />
			<div class="border-b">
				<div class="text-gray-500 mb-2 text-lg mt-4 text-right px-4">
					{new Date($selectedPost.created_at * 1000).toLocaleString()}
				</div>
			</div>
			<!-- <VirtualList items={replies} let:item> -->
			{#each replies as item}
				<div>
					<Header note={item} />
					<div class="flex gap-2">
						<div class="min-w-8" />
						<div class="flex-grow">
							<div class="flex gap-2" on:click={() => ($selectedPost = item)}>
								<!-- <div class="min-w-8" /> -->
								<div class="text-sm break-words overflow-hidden">
									<Content content={item.content} />
								</div>
							</div>
							<Footer note={item} />
						</div>
					</div>
				</div>
			{/each}
			<!-- </VirtualList> -->
		</div>
		<!-- </div> -->
	</div></Fullscreen
>
