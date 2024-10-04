<script lang="ts">
	import { db, notesCache, type Note } from 'src/stores/db';
	import _ from 'lodash';
	import Icon from '@iconify/svelte';
	import Replypost from 'src/routes/explore/post/reply-post.svelte';
	import VirtualList from 'src/comp/VirtualList.svelte';
	import { fetchReplies } from 'src/stores/notes';
	import { onMount } from 'svelte';
	import { pool } from 'src/stores/relays';
	import { spring } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { swipe, type SwipeCustomEvent } from 'src/actions/swipe';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let start = 0;

	let postElement: HTMLElement;

	let results: Note[] = [];

	$: selectedReply = $notesCache.get($page.params.reply);

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

	const translateX = spring(0);
	function handler(event: SwipeCustomEvent) {
		console.log('handler');
		$translateX = event.detail.deltaX;
	}
	function end(event: SwipeCustomEvent) {
		console.log('end');
		if ($translateX > postElement.clientWidth / 2) {
			// goto('/explore');
			$translateX = postElement.clientWidth;
			setTimeout(() => {
				window.history.back();
			}, 300);
		} else {
			$translateX = 0;
		}
	}
</script>

<div
	class="fixed top-0 right-0 overflow-hidden z-10"
	transition:slide={{ duration: 300, easing: quintOut, axis: 'x' }}
	style="right: -{$translateX}px;"
	bind:this={postElement}
	use:swipe
	on:swipe={handler}
	on:end={end}
>
	<div class="max-h-screen z-10 lg:w-25vw w-100vw bg-basic safe-padding-top">
		<div class="flex justify-between items-center px-4">
			<button on:click={() => window.history.back()}>
				<Icon icon="mingcute:left-line" class="text-xl" />
			</button>
			<h1 class="text-xl font-semibold">Post</h1>
			<div />
		</div>
		<div class="container-height lg:h-screen pb-20 !pt-0">
			<!-- <div class="h-screen"> -->
			<VirtualList {items} bind:start let:item getItemId={(item) => item.data.id}>
				<Replypost
					note={item}
					bind:selectedReply
					full={(replies || []).findIndex((note) => note.id === item.id) == -1}
					visible={(replies || []).findIndex((note) => note.id === item.id) >= start - 2}
				/>
			</VirtualList>
		</div>
	</div>
</div>

<style>
	@media (min-width: 1024px) {
		.lg\:w-25vw {
			width: 25vw !important;
		}
	}
	.w-100vw {
		width: 100vw;
	}
</style>
