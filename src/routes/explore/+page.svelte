<script lang="ts">
	import { liveQuery } from 'dexie';
	import { type NostrEvent } from 'nostr-tools';
	import { contactsCache, db, notes } from 'src/stores/db';

	import Reply from './reply.svelte';

	import Fullpost from './fullpost.svelte';
	import { selectedPost } from 'src/stores';
	import { onMount } from 'svelte';

	// $: query = liveQuery<NostrEvent[]>(() =>
	// 	$db.notes
	// 		.orderBy('created_at')
	// 		.filter(
	// 			(note) => !note.tags || !note.tags.some((tag) => Array.isArray(tag) && tag[0] === 'e')
	// 		)
	// 		.filter((note) => !!$contactsCache.get(note.pubkey))
	// 		.reverse()
	// 		.toArray()
	// );
	// $: feed = $query || [];
	// $: console.log(feed);

	// let start;
	// let end;
	// let top: number = 0;

	// let oldTop = 0;

	// let topper: HTMLElement;
	// let footer: HTMLElement;

	// onMount(() => {
	// 	topper = document.getElementById('top');
	// 	footer = document.getElementById('footer');
	// });
	// $: {
	// 	console.log(topper, footer);
	// 	top > oldTop;

	// 	if (top > oldTop + 25) {
	// 		topper?.classList.add('toggle-up');
	// 		footer?.classList.add('blur-in');
	// 		oldTop = top;
	// 		// prevScrollPos = currentScrollPos;
	// 	} else if (top < oldTop - 25) {
	// 		topper?.classList.remove('toggle-up');
	// 		footer?.classList.remove('blur-in');
	// 		oldTop = top;
	// 		// prevScrollPos = currentScrollPos;
	// 	} else if (top == 0) {
	// 		topper?.classList.remove('toggle-up');
	// 		footer?.classList.remove('blur-in');
	// 		oldTop = top;
	// 		// prevScrollPos = currentScrollPos;
	// 	}
	// }

	let selected;
</script>

<!-- <div class="px-2 -mt-8"> -->
<!-- <br />
<br />
<br /> -->

<!-- </div> -->
<Fullpost />
<Reply />
