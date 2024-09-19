<script lang="ts">
	import Fullscreen from 'src/comp/drawers/Fullscreen.svelte';

	import { replyPost } from 'src/stores';
	import Icon from '@iconify/svelte';
	import Header from './post/header.svelte';
	import Content from './post/content.svelte';
	import User from './user.svelte';
	import { profile } from 'src/stores/profile';
	import { pool } from 'src/stores/relays';
	import { signer } from 'src/stores/signer';
	import { sendReply } from 'src/actions/notes';

	// $: results = liveQuery(() => $db.notes.where('reply_to').equals($replyPost?.id).toArray());
	// sort replies by created_at

	$: open = !!$replyPost;

	// $: console.log(replies);
	//
	let reply = '';
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
	scaleBackground={false}
	onClose={() => {
		$replyPost = null;
	}}
>
	<div class="flex justify-between items-center px-4">
		<button class="w-1/5" on:click={() => ($replyPost = null)}>
			<Icon icon="mingcute:down-line" class="text-xl" />
		</button>
		<h1 class="text-2xl font-semibold">Post</h1>
		<button
			class="btn btn-primary btn-xs w-1/5"
			disabled={!reply}
			on:click={async () => {
				await sendReply($pool, $signer, $replyPost, reply);
				reply = '';
				$replyPost = null;
			}}
		>
			Reply
		</button>
	</div>
	<div class="!pt-0 fixed reply-height overflow-scroll w-full" id="reply-container">
		<div class="mt-6">
			<Header note={$replyPost} />
			<div class="flex">
				<div class="min-w-8 flex items-stretch relative">
					<div class="w-1/2 border-r" />
					<div class="w-1/2" />
				</div>
				<div>
					<Content content={$replyPost?.content} />
					<br />
					Replying to <User npub={$replyPost?.pubkey} />
				</div>
			</div>
		</div>
		<div class="flex pt-4 gap-2">
			<img src={$profile.picture} alt="random" class="w-8 h-8 rounded-full" />
			<textarea
				bind:value={reply}
				class="w-full h-24 p-2 rounded-md"
				placeholder="Post your reply"
				rows="5"
				id="reply-post"
			/>
		</div>
		<div class="h-screen" />
		<!-- </div> -->
	</div>
</Fullscreen>
