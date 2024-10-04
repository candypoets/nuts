<script lang="ts">
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';

	import { posting, replyPost } from 'src/stores';
	import Icon from '@iconify/svelte';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';

	import Footer from './post/footer.svelte';
	import VirtualList from '@sveltejs/svelte-virtual-list';
	import { profile } from 'src/stores/profile';
	import { onMount } from 'svelte';
	import { pool } from 'src/stores/relays';
	import { signer } from 'src/stores/signer';
	import { sendPost, sendReply } from 'src/actions/notes';

	// $: results = liveQuery(() => $db.notes.where('reply_to').equals($replyPost?.id).toArray());
	// sort replies by created_at

	$: open = !!$posting;

	// $: console.log(replies);
	//
	let post = '';
	// onMount(() => {
	// 	console.log('mounted');
	// 	const textarea = document.getElementById('reply-post');
	// 	console.log(textarea);
	// 	if (textarea) {
	// 		console.log('textarea found');
	// 		textarea.focus();
	// 	}
	// });
</script>

<Fullscreen
	bind:open
	onClose={() => {
		$posting = false;
	}}
>
	<div class="flex justify-between items-center px-4">
		<button class="w-1/5" on:click={() => ($posting = false)}>
			<Icon icon="mingcute:down-line" class="text-xl" />
		</button>
		<h1 class="text-2xl font-semibold">new post</h1>
		<button
			class="btn btn-primary btn-xs w-1/5"
			disabled={!post}
			on:click={async () => {
				await sendPost($pool, $signer, post);
				post = '';
				$posting = false;
			}}
		>
			Post
		</button>
	</div>
	<div class="container-height !pt-0" id="reply-container">
		<div class="flex pt-4 gap-2">
			<img src={$profile.picture} alt="random" class="w-8 h-8 rounded-full" />
			<textarea
				bind:value={post}
				class="textarea w-full p-2 rounded-md"
				placeholder="What's up?"
				rows="10"
				id="reply-post"
			/>
		</div>
		<!-- </div> -->
	</div></Fullscreen
>
