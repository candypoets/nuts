<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '@iconify/svelte';
	import { db, notesCache, type Note } from 'src/stores/db';

	import VirtualList from 'src/comp/VirtualList.svelte';
	import Replypost from '../post/reply-post.svelte';
	import { fetchReplies } from 'src/stores/notes';
	import { pool } from 'src/stores/relays';
	import { onMount } from 'svelte';
	import { fly, slide } from 'svelte/transition';
	import { swipe, type SwipeCustomEvent } from 'src/actions/swipe';
	import { quintOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { spring } from 'svelte/motion';

	let start = 0;

	let postElement: HTMLElement;

	$: selectedPost = $notesCache.get($page.params.post);
	// $: console.log($page.params.post, selectedPost);

	let selectedReply: Note;

	let results: Note[] = [];

	$: replies = results
		?.sort((a, b) => a.created_at - b.created_at)
		.filter((note) => !note.content.includes(selectedPost?.content))
		// .map((note) => {
		// 	console.log(note.content);
		// 	console.log($selectedPost?.content);
		// 	console.log(note.content.includes($selectedPost?.content));
		// 	return note;
		// })
		.filter((note) => note.reply_to == selectedPost?.id);

	let abortController = new AbortController();

	function fetch() {
		console.log('fetch');
		abortController.abort();
		abortController = new AbortController();
		$db.notes
			.where('reply_to')
			.equals(selectedPost?.id)
			.sortBy('created_at')
			.then(async (r) => {
				console.log('fetched', r);
				results = r;
				const newReplies = fetchReplies(
					$pool,
					selectedPost,
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

	$: selectedPost && fetch();

	// $: {
	// 	if (!$selectedPost) {
	// 		selectedReply = null;
	// 	}
	// }

	$: items = [selectedPost, ...(replies || [])].filter((p) => !!p);
	const translateX = spring(0, {
		stiffness: 0.3,
		damping: 0.8
	});
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
				goto('/explore');
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
			<a href="/explore">
				<Icon icon="mingcute:left-line" class="text-xl" />
			</a>
			<!-- <div /> -->
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
<slot />

<!-- <Subpost bind:selectedReply /> -->
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
